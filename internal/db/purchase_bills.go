package db

import (
	"database/sql"
	"fmt"
)

// PurchaseBill is a bill header plus its line items. See docs/DATA_MODEL.md
// (purchase_bills + purchase_bill_items).
type PurchaseBill struct {
	ID         int64              `json:"id"`
	Company    string             `json:"company"`
	BillNumber string             `json:"billNumber"`
	Date       string             `json:"date"` // dd/mm/yyyy
	Items      []PurchaseBillItem `json:"items"`
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
		`INSERT INTO purchase_bills (company, bill_number, date) VALUES (?, ?, ?)`,
		bill.Company, bill.BillNumber, bill.Date,
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
