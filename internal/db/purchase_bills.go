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
// its composite key (name, pack size). The calculated columns (GST amount, totals,
// final rates) are derived on the frontend and not stored.
type PurchaseBillItem struct {
	ItemName     string  `json:"itemName"`
	ItemPackSize float64 `json:"itemPackSize"`
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

	for i, it := range bill.Items {
		if _, err := tx.Exec(
			`INSERT INTO purchase_bill_items
				(bill_id, item_name, item_pack_size, tax_qty, tax_value, d_qty, d_value, discount, remarks)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			billID, it.ItemName, it.ItemPackSize, it.TaxQty, it.TaxValue,
			it.DQty, it.DValue, it.Discount, it.Remarks,
		); err != nil {
			return PurchaseBill{}, fmt.Errorf("insert line %d: %w", i+1, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return PurchaseBill{}, fmt.Errorf("commit: %w", err)
	}

	bill.ID = billID
	return bill, nil
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
		`SELECT bill_id, item_name, item_pack_size, tax_qty, tax_value, d_qty, d_value, discount, remarks
			FROM purchase_bill_items ORDER BY id`,
	)
	if err != nil {
		return nil, fmt.Errorf("query bill items: %w", err)
	}
	defer itemRows.Close()

	for itemRows.Next() {
		var billID int64
		var it PurchaseBillItem
		if err := itemRows.Scan(
			&billID, &it.ItemName, &it.ItemPackSize, &it.TaxQty, &it.TaxValue,
			&it.DQty, &it.DValue, &it.Discount, &it.Remarks,
		); err != nil {
			return nil, fmt.Errorf("scan bill item: %w", err)
		}
		if idx, ok := byID[billID]; ok {
			bills[idx].Items = append(bills[idx].Items, it)
		}
	}
	return bills, itemRows.Err()
}
