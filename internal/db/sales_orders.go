package db

import (
	"database/sql"
	"fmt"
)

// SalesOrder is a customer order header plus its line items — first piece of the Order
// Book / Sales feature. See docs/DATA_MODEL.md (sales_orders + sales_order_items).
type SalesOrder struct {
	ID           int64            `json:"id"`
	CustomerID   int64            `json:"customerId"`   // → customers(id)
	CustomerName string           `json:"customerName"` // populated on read (JOIN); ignored on write
	Date         string           `json:"date"`
	Items        []SalesOrderItem `json:"items"`
}

// SalesOrderItem is a single line on a sales order. The item is referenced by ItemID
// (→ items.id); ItemName / ItemPackSize / GSTPercent / HSN are populated on read via a
// JOIN (not stored) — pulled regardless of which of them the UI currently shows. Final
// Amount (rate × qty × pack size) is derived on the frontend and not stored.
type SalesOrderItem struct {
	ItemID       int64   `json:"itemId"`       // written; → items(id)
	ItemName     string  `json:"itemName"`     // read (JOIN)
	ItemPackSize float64 `json:"itemPackSize"` // read (JOIN)
	GSTPercent   float64 `json:"gstPercent"`   // read (JOIN)
	HSN          int64   `json:"hsn"`          // read (JOIN)
	Rate         float64 `json:"rate"`
	Qty          float64 `json:"qty"`
}

// AddSalesOrder saves an order header and all its line items in one transaction,
// returning the order with its assigned id.
func AddSalesOrder(conn *sql.DB, order SalesOrder) (SalesOrder, error) {
	tx, err := conn.Begin()
	if err != nil {
		return SalesOrder{}, fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback() // no-op after a successful Commit

	res, err := tx.Exec(
		`INSERT INTO sales_orders (customer_id, date) VALUES (?, ?)`,
		order.CustomerID, order.Date,
	)
	if err != nil {
		return SalesOrder{}, fmt.Errorf("insert order: %w", err)
	}
	orderID, err := res.LastInsertId()
	if err != nil {
		return SalesOrder{}, fmt.Errorf("order id: %w", err)
	}

	for i, it := range order.Items {
		if _, err := tx.Exec(
			`INSERT INTO sales_order_items (order_id, item_id, rate, qty) VALUES (?, ?, ?, ?)`,
			orderID, it.ItemID, it.Rate, it.Qty,
		); err != nil {
			return SalesOrder{}, fmt.Errorf("insert line %d: %w", i+1, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return SalesOrder{}, fmt.Errorf("commit: %w", err)
	}

	order.ID = orderID
	return order, nil
}

// UpdateSalesOrder overwrites an order completely: it updates the header and replaces
// all line items (delete + re-insert) in one transaction.
func UpdateSalesOrder(conn *sql.DB, order SalesOrder) (SalesOrder, error) {
	tx, err := conn.Begin()
	if err != nil {
		return SalesOrder{}, fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback() // no-op after a successful Commit

	res, err := tx.Exec(
		`UPDATE sales_orders SET customer_id = ?, date = ? WHERE id = ?`,
		order.CustomerID, order.Date, order.ID,
	)
	if err != nil {
		return SalesOrder{}, fmt.Errorf("update order: %w", err)
	}
	if n, err := res.RowsAffected(); err == nil && n == 0 {
		return SalesOrder{}, fmt.Errorf("sales order %d not found", order.ID)
	}

	if _, err := tx.Exec(`DELETE FROM sales_order_items WHERE order_id = ?`, order.ID); err != nil {
		return SalesOrder{}, fmt.Errorf("clear lines: %w", err)
	}
	for i, it := range order.Items {
		if _, err := tx.Exec(
			`INSERT INTO sales_order_items (order_id, item_id, rate, qty) VALUES (?, ?, ?, ?)`,
			order.ID, it.ItemID, it.Rate, it.Qty,
		); err != nil {
			return SalesOrder{}, fmt.Errorf("insert line %d: %w", i+1, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return SalesOrder{}, fmt.Errorf("commit: %w", err)
	}
	return order, nil
}

// DeleteSalesOrder removes an order and its line items (ON DELETE CASCADE).
func DeleteSalesOrder(conn *sql.DB, id int64) error {
	if _, err := conn.Exec(`DELETE FROM sales_orders WHERE id = ?`, id); err != nil {
		return fmt.Errorf("delete order %d: %w", id, err)
	}
	return nil
}

// ListSalesOrders returns all saved orders (header + line items), newest first.
func ListSalesOrders(conn *sql.DB) ([]SalesOrder, error) {
	rows, err := conn.Query(
		`SELECT so.id, so.customer_id, c.name, so.date
			FROM sales_orders so
			JOIN customers c ON c.id = so.customer_id
			ORDER BY so.id DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("query orders: %w", err)
	}
	defer rows.Close()

	orders := []SalesOrder{}
	byID := map[int64]int{} // order id -> index in orders, for attaching line items
	for rows.Next() {
		var o SalesOrder
		if err := rows.Scan(&o.ID, &o.CustomerID, &o.CustomerName, &o.Date); err != nil {
			return nil, fmt.Errorf("scan order: %w", err)
		}
		o.Items = []SalesOrderItem{}
		byID[o.ID] = len(orders)
		orders = append(orders, o)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate orders: %w", err)
	}
	if len(orders) == 0 {
		return orders, nil
	}

	itemRows, err := conn.Query(
		`SELECT soi.order_id, soi.item_id, i.name, i.pack_size, i.gst_percent, i.hsn, soi.rate, soi.qty
			FROM sales_order_items soi
			JOIN items i ON i.id = soi.item_id
			ORDER BY soi.id`,
	)
	if err != nil {
		return nil, fmt.Errorf("query order items: %w", err)
	}
	defer itemRows.Close()

	for itemRows.Next() {
		var orderID int64
		var it SalesOrderItem
		if err := itemRows.Scan(
			&orderID, &it.ItemID, &it.ItemName, &it.ItemPackSize, &it.GSTPercent, &it.HSN, &it.Rate, &it.Qty,
		); err != nil {
			return nil, fmt.Errorf("scan order item: %w", err)
		}
		if idx, ok := byID[orderID]; ok {
			orders[idx].Items = append(orders[idx].Items, it)
		}
	}
	return orders, itemRows.Err()
}

// GetSalesOrder returns a single order (header + line items) by id.
func GetSalesOrder(conn *sql.DB, id int64) (SalesOrder, error) {
	var o SalesOrder
	if err := conn.QueryRow(
		`SELECT so.id, so.customer_id, c.name, so.date
			FROM sales_orders so
			JOIN customers c ON c.id = so.customer_id
			WHERE so.id = ?`,
		id,
	).Scan(&o.ID, &o.CustomerID, &o.CustomerName, &o.Date); err != nil {
		return SalesOrder{}, fmt.Errorf("get order %d: %w", id, err)
	}

	rows, err := conn.Query(
		`SELECT soi.item_id, i.name, i.pack_size, i.gst_percent, i.hsn, soi.rate, soi.qty
			FROM sales_order_items soi
			JOIN items i ON i.id = soi.item_id
			WHERE soi.order_id = ?
			ORDER BY soi.id`,
		id,
	)
	if err != nil {
		return SalesOrder{}, fmt.Errorf("query order %d items: %w", id, err)
	}
	defer rows.Close()

	o.Items = []SalesOrderItem{}
	for rows.Next() {
		var it SalesOrderItem
		if err := rows.Scan(
			&it.ItemID, &it.ItemName, &it.ItemPackSize, &it.GSTPercent, &it.HSN, &it.Rate, &it.Qty,
		); err != nil {
			return SalesOrder{}, fmt.Errorf("scan order item: %w", err)
		}
		o.Items = append(o.Items, it)
	}
	return o, rows.Err()
}

// RateHistoryEntry is one past order's rate for a given customer+item pair.
type RateHistoryEntry struct {
	Date string  `json:"date"`
	Rate float64 `json:"rate"`
}

// RateHistory returns every past rate a customer has been charged for an item, derived
// directly from sales_order_items/sales_orders (no separate table to keep in sync).
// Order is a cheap id-based tie-break only — dates are free-text (dd-mmm-yy, possibly the
// legacy dd-mmm-yyyy) and not safely sortable as SQL strings, so the caller sorts by
// parsed date, same as the frontend already does everywhere else it sorts by date.
func RateHistory(conn *sql.DB, customerID, itemID int64) ([]RateHistoryEntry, error) {
	rows, err := conn.Query(
		`SELECT so.date, soi.rate
			FROM sales_order_items soi
			JOIN sales_orders so ON so.id = soi.order_id
			WHERE so.customer_id = ? AND soi.item_id = ?
			ORDER BY so.id DESC`,
		customerID, itemID,
	)
	if err != nil {
		return nil, fmt.Errorf("query rate history: %w", err)
	}
	defer rows.Close()

	history := []RateHistoryEntry{}
	for rows.Next() {
		var e RateHistoryEntry
		if err := rows.Scan(&e.Date, &e.Rate); err != nil {
			return nil, fmt.Errorf("scan rate history: %w", err)
		}
		history = append(history, e)
	}
	return history, rows.Err()
}
