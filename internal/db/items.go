package db

import (
	"database/sql"
	"fmt"
)

// Item is a product in the item master. The natural key is (Name, PackSize); see
// docs/DATA_MODEL.md. Columns: Item (name), Pack Size, GST %, HSN.
type Item struct {
	Name       string  `json:"name"`       // displayed as "Item"
	PackSize   float64 `json:"packSize"`   // numeric pack size, e.g. 100
	GSTPercent float64 `json:"gstPercent"` // GST rate %, e.g. 18
	HSN        int64   `json:"hsn"`        // HSN code (numeric)
}

// AddItem inserts a new item and returns it. (name, packSize) must be unique.
func AddItem(conn *sql.DB, name string, packSize, gstPercent float64, hsn int64) (Item, error) {
	_, err := conn.Exec(
		`INSERT INTO items (name, pack_size, gst_percent, hsn) VALUES (?, ?, ?, ?)`,
		name, packSize, gstPercent, hsn,
	)
	if err != nil {
		return Item{}, fmt.Errorf("insert item: %w", err)
	}
	return Item{Name: name, PackSize: packSize, GSTPercent: gstPercent, HSN: hsn}, nil
}

// ListItems returns all items, ordered by name then pack size.
func ListItems(conn *sql.DB) ([]Item, error) {
	rows, err := conn.Query(
		`SELECT name, pack_size, gst_percent, hsn FROM items ORDER BY name, pack_size`,
	)
	if err != nil {
		return nil, fmt.Errorf("query items: %w", err)
	}
	defer rows.Close()

	items := []Item{}
	for rows.Next() {
		var it Item
		if err := rows.Scan(&it.Name, &it.PackSize, &it.GSTPercent, &it.HSN); err != nil {
			return nil, fmt.Errorf("scan item: %w", err)
		}
		items = append(items, it)
	}
	return items, rows.Err()
}
