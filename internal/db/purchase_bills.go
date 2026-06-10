package db

import (
	"database/sql"
	"fmt"
)

// PurchaseBill is a bill header plus its line items. See docs/DATA_MODEL.md
// (purchase_bills + purchase_bill_items).
type PurchaseBill struct {
	ID          int64              `json:"id"`
	CompanyID   int64              `json:"companyId"`   // → companies(id)
	CompanyName string             `json:"companyName"` // populated on read (JOIN); ignored on write
	BillNumber  string             `json:"billNumber"`
	Date        string             `json:"date"` // dd/mm/yyyy
	Items       []PurchaseBillItem `json:"items"`
}

// PurchaseBillItem is a single line on a purchase bill. The item is referenced by
// ItemID (→ items.id); ItemName / ItemPackSize / GSTPercent are populated on read
// via a JOIN (not stored). The calculated columns (GST amount, totals, final rates)
// are derived on the frontend and not stored.
type PurchaseBillItem struct {
	ItemID       int64   `json:"itemId"`      // written; → items(id)
	ItemName     string  `json:"itemName"`    // read (JOIN)
	ItemPackSize float64 `json:"itemPackSize"` // read (JOIN)
	GSTPercent   float64 `json:"gstPercent"`  // read (JOIN)
	TaxQty       float64 `json:"taxQty"`
	TaxValue     float64 `json:"taxValue"`
	DQty         float64 `json:"dQty"`
	DValue       float64 `json:"dValue"`
	Discount     float64 `json:"discount"`
	Remarks      string  `json:"remarks"`
}

// AddPurchaseBill saves a bill header and all its line items in one transaction,
// returning the bill with its assigned id.
func AddPurchaseBill(conn *sql.DB, bill PurchaseBill) (PurchaseBill, error) {
	tx, err := conn.Begin()
	if err != nil {
		return PurchaseBill{}, fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback() // no-op after a successful Commit

	res, err := tx.Exec(
		`INSERT INTO purchase_bills (company_id, bill_number, date) VALUES (?, ?, ?)`,
		bill.CompanyID, bill.BillNumber, bill.Date,
	)
	if err != nil {
		return PurchaseBill{}, fmt.Errorf("insert bill: %w", err)
	}
	billID, err := res.LastInsertId()
	if err != nil {
		return PurchaseBill{}, fmt.Errorf("bill id: %w", err)
	}

	if err := insertBillItems(tx, billID, bill.Items); err != nil {
		return PurchaseBill{}, err
	}

	if err := tx.Commit(); err != nil {
		return PurchaseBill{}, fmt.Errorf("commit: %w", err)
	}

	bill.ID = billID
	return bill, nil
}

// insertBillItems inserts all line items for a bill within an open transaction.
func insertBillItems(tx *sql.Tx, billID int64, items []PurchaseBillItem) error {
	for i, it := range items {
		if _, err := tx.Exec(
			`INSERT INTO purchase_bill_items
				(bill_id, item_id, tax_qty, tax_value, d_qty, d_value, discount, remarks)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			billID, it.ItemID, it.TaxQty, it.TaxValue,
			it.DQty, it.DValue, it.Discount, it.Remarks,
		); err != nil {
			return fmt.Errorf("insert line %d: %w", i+1, err)
		}
	}
	return nil
}

// UpdatePurchaseBill overwrites a bill completely: it updates the header and
// replaces all line items (delete + re-insert) in one transaction.
func UpdatePurchaseBill(conn *sql.DB, bill PurchaseBill) (PurchaseBill, error) {
	tx, err := conn.Begin()
	if err != nil {
		return PurchaseBill{}, fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback() // no-op after a successful Commit

	res, err := tx.Exec(
		`UPDATE purchase_bills SET company_id = ?, bill_number = ?, date = ? WHERE id = ?`,
		bill.CompanyID, bill.BillNumber, bill.Date, bill.ID,
	)
	if err != nil {
		return PurchaseBill{}, fmt.Errorf("update bill: %w", err)
	}
	if n, err := res.RowsAffected(); err == nil && n == 0 {
		return PurchaseBill{}, fmt.Errorf("purchase bill %d not found", bill.ID)
	}

	if _, err := tx.Exec(`DELETE FROM purchase_bill_items WHERE bill_id = ?`, bill.ID); err != nil {
		return PurchaseBill{}, fmt.Errorf("clear lines: %w", err)
	}
	if err := insertBillItems(tx, bill.ID, bill.Items); err != nil {
		return PurchaseBill{}, err
	}

	if err := tx.Commit(); err != nil {
		return PurchaseBill{}, fmt.Errorf("commit: %w", err)
	}
	return bill, nil
}

// DeletePurchaseBill removes a bill and its line items (ON DELETE CASCADE).
func DeletePurchaseBill(conn *sql.DB, id int64) error {
	if _, err := conn.Exec(`DELETE FROM purchase_bills WHERE id = ?`, id); err != nil {
		return fmt.Errorf("delete bill %d: %w", id, err)
	}
	return nil
}

// ListPurchaseBills returns all saved bills (header + line items), newest first.
// Calculated columns (GST amount, totals, final rates) are not stored — the
// frontend derives them from these raw fields, so the formula stays in one place.
// Single-user/local scale, so loading every line up front is fine; revisit if the
// table grows large (move to header summaries + on-demand detail).
func ListPurchaseBills(conn *sql.DB) ([]PurchaseBill, error) {
	rows, err := conn.Query(
		`SELECT pb.id, pb.company_id, c.name, pb.bill_number, pb.date
			FROM purchase_bills pb
			JOIN companies c ON c.id = pb.company_id
			ORDER BY pb.id DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("query bills: %w", err)
	}
	defer rows.Close()

	bills := []PurchaseBill{}
	byID := map[int64]int{} // bill id -> index in bills, for attaching line items
	for rows.Next() {
		var b PurchaseBill
		if err := rows.Scan(&b.ID, &b.CompanyID, &b.CompanyName, &b.BillNumber, &b.Date); err != nil {
			return nil, fmt.Errorf("scan bill: %w", err)
		}
		b.Items = []PurchaseBillItem{}
		byID[b.ID] = len(bills)
		bills = append(bills, b)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate bills: %w", err)
	}
	if len(bills) == 0 {
		return bills, nil
	}

	itemRows, err := conn.Query(
		`SELECT pbi.bill_id, pbi.item_id, i.name, i.pack_size, i.gst_percent,
				pbi.tax_qty, pbi.tax_value, pbi.d_qty, pbi.d_value, pbi.discount, pbi.remarks
			FROM purchase_bill_items pbi
			JOIN items i ON i.id = pbi.item_id
			ORDER BY pbi.id`,
	)
	if err != nil {
		return nil, fmt.Errorf("query bill items: %w", err)
	}
	defer itemRows.Close()

	for itemRows.Next() {
		var billID int64
		var it PurchaseBillItem
		if err := itemRows.Scan(
			&billID, &it.ItemID, &it.ItemName, &it.ItemPackSize, &it.GSTPercent,
			&it.TaxQty, &it.TaxValue, &it.DQty, &it.DValue, &it.Discount, &it.Remarks,
		); err != nil {
			return nil, fmt.Errorf("scan bill item: %w", err)
		}
		if idx, ok := byID[billID]; ok {
			bills[idx].Items = append(bills[idx].Items, it)
		}
	}
	return bills, itemRows.Err()
}

// GetPurchaseBill returns a single bill (header + line items) by id.
func GetPurchaseBill(conn *sql.DB, id int64) (PurchaseBill, error) {
	var b PurchaseBill
	if err := conn.QueryRow(
		`SELECT pb.id, pb.company_id, c.name, pb.bill_number, pb.date
			FROM purchase_bills pb
			JOIN companies c ON c.id = pb.company_id
			WHERE pb.id = ?`,
		id,
	).Scan(&b.ID, &b.CompanyID, &b.CompanyName, &b.BillNumber, &b.Date); err != nil {
		return PurchaseBill{}, fmt.Errorf("get bill %d: %w", id, err)
	}

	rows, err := conn.Query(
		`SELECT pbi.item_id, i.name, i.pack_size, i.gst_percent,
				pbi.tax_qty, pbi.tax_value, pbi.d_qty, pbi.d_value, pbi.discount, pbi.remarks
			FROM purchase_bill_items pbi
			JOIN items i ON i.id = pbi.item_id
			WHERE pbi.bill_id = ?
			ORDER BY pbi.id`,
		id,
	)
	if err != nil {
		return PurchaseBill{}, fmt.Errorf("query bill %d items: %w", id, err)
	}
	defer rows.Close()

	b.Items = []PurchaseBillItem{}
	for rows.Next() {
		var it PurchaseBillItem
		if err := rows.Scan(
			&it.ItemID, &it.ItemName, &it.ItemPackSize, &it.GSTPercent,
			&it.TaxQty, &it.TaxValue, &it.DQty, &it.DValue, &it.Discount, &it.Remarks,
		); err != nil {
			return PurchaseBill{}, fmt.Errorf("scan bill item: %w", err)
		}
		b.Items = append(b.Items, it)
	}
	return b, rows.Err()
}
