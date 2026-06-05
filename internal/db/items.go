package db

import (
	"database/sql"
	"fmt"
	"time"
)

// Item is a single inventory record. (Skeleton model — proves the stack; the real
// inventory schema will replace it. See docs/DATA_MODEL.md.)
type Item struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Quantity  int    `json:"quantity"`
	CreatedAt string `json:"createdAt"`
}

// AddItem inserts a new item and returns it with its assigned id and timestamp.
func AddItem(conn *sql.DB, name string, quantity int) (Item, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	res, err := conn.Exec(
		`INSERT INTO items (name, quantity, created_at) VALUES (?, ?, ?)`,
		name, quantity, now,
	)
	if err != nil {
		return Item{}, fmt.Errorf("insert item: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Item{}, fmt.Errorf("last insert id: %w", err)
	}
	return Item{ID: id, Name: name, Quantity: quantity, CreatedAt: now}, nil
}

// ListItems returns all items, newest first.
func ListItems(conn *sql.DB) ([]Item, error) {
	rows, err := conn.Query(
		`SELECT id, name, quantity, created_at FROM items ORDER BY id DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("query items: %w", err)
	}
	defer rows.Close()

	items := []Item{}
	for rows.Next() {
		var it Item
		if err := rows.Scan(&it.ID, &it.Name, &it.Quantity, &it.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan item: %w", err)
		}
		items = append(items, it)
	}
	return items, rows.Err()
}
