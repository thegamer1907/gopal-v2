package db

import (
	"database/sql"
	"fmt"
)

// Item is a product in the item master. It belongs to a company (CompanyID). The
// surrogate Id PK lets bill lines FK to it; (CompanyID, Name, PackSize) is unique
// within a company. See docs/DATA_MODEL.md.
type Item struct {
	ID          int64   `json:"id"`
	CompanyID   int64   `json:"companyId"`   // → companies(id)
	CompanyName string  `json:"companyName"` // populated on read (JOIN); ignored on write
	Name        string  `json:"name"`        // displayed as "Item"
	PackSize    float64 `json:"packSize"`    // numeric pack size, e.g. 100
	GSTPercent  float64 `json:"gstPercent"`  // GST rate %, e.g. 18
	HSN         int64   `json:"hsn"`         // HSN code (numeric)
}

// AddItem inserts a new item for a company and returns it with its assigned id.
// (companyID, name, packSize) must be unique.
func AddItem(conn *sql.DB, companyID int64, name string, packSize, gstPercent float64, hsn int64) (Item, error) {
	res, err := conn.Exec(
		`INSERT INTO items (company_id, name, pack_size, gst_percent, hsn) VALUES (?, ?, ?, ?, ?)`,
		companyID, name, packSize, gstPercent, hsn,
	)
	if err != nil {
		return Item{}, fmt.Errorf("insert item: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Item{}, fmt.Errorf("item id: %w", err)
	}
	return Item{ID: id, CompanyID: companyID, Name: name, PackSize: packSize, GSTPercent: gstPercent, HSN: hsn}, nil
}

const itemSelect = `SELECT i.id, i.company_id, c.name, i.name, i.pack_size, i.gst_percent, i.hsn
	FROM items i JOIN companies c ON c.id = i.company_id`

func scanItems(rows *sql.Rows) ([]Item, error) {
	items := []Item{}
	for rows.Next() {
		var it Item
		if err := rows.Scan(&it.ID, &it.CompanyID, &it.CompanyName, &it.Name, &it.PackSize, &it.GSTPercent, &it.HSN); err != nil {
			return nil, fmt.Errorf("scan item: %w", err)
		}
		items = append(items, it)
	}
	return items, rows.Err()
}

// ListItems returns all items (with their company name), ordered by company then item.
func ListItems(conn *sql.DB) ([]Item, error) {
	rows, err := conn.Query(itemSelect + ` ORDER BY c.name, i.name, i.pack_size`)
	if err != nil {
		return nil, fmt.Errorf("query items: %w", err)
	}
	defer rows.Close()
	return scanItems(rows)
}

// ListItemsByCompany returns the items belonging to one company, ordered by name.
func ListItemsByCompany(conn *sql.DB, companyID int64) ([]Item, error) {
	rows, err := conn.Query(itemSelect+` WHERE i.company_id = ? ORDER BY i.name, i.pack_size`, companyID)
	if err != nil {
		return nil, fmt.Errorf("query items by company: %w", err)
	}
	defer rows.Close()
	return scanItems(rows)
}
