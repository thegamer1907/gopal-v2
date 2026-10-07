package db

import (
	"database/sql"
	"errors"
	"fmt"
)

// SalesOrder is a customer order header plus its line items — first piece of the Order
// Book / Sales feature. See docs/DATA_MODEL.md (sales_orders + sales_order_items).
type SalesOrder struct {
	ID               int64            `json:"id"`
	CustomerID       int64            `json:"customerId"`       // → customers(id)
	CustomerName     string           `json:"customerName"`     // populated on read (JOIN); ignored on write
	CustomerNickName string           `json:"customerNickName"` // populated on read (JOIN); ignored on write
	CustomerCity     string           `json:"customerCity"`     // populated on read (JOIN); ignored on write
	Date             string           `json:"date"`
	DeliveryNo       int64            `json:"deliveryNo"` // 0 = not delivered; assigned once, by MarkSalesOrderDelivered
	Delivered        bool             `json:"delivered"`  // derived on read from DeliveryNo > 0; ignored on write
	Items            []SalesOrderItem `json:"items"`
}

// SalesOrderItem is a single line on a sales order. The item is referenced by ItemID
// (→ items.id); ItemName / ItemPackSize / GSTPercent / HSN are populated on read via a
// JOIN (not stored) — pulled regardless of which of them the UI currently shows. Final
// Amount (rate × qty × pack size) is derived on the frontend and not stored.
type SalesOrderItem struct {
	ItemID         int64   `json:"itemId"`       // written; → items(id)
	ItemName       string  `json:"itemName"`     // read (JOIN)
	ItemPackSize   float64 `json:"itemPackSize"` // read (JOIN) — the item's master pack size
	GSTPercent     float64 `json:"gstPercent"`   // read (JOIN)
	HSN            int64   `json:"hsn"`          // read (JOIN)
	Rate           float64 `json:"rate"`
	Qty            float64 `json:"qty"`
	CustomPackSize float64 `json:"customPackSize"` // written; 0 = no override, use ItemPackSize
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
			`INSERT INTO sales_order_items (order_id, item_id, rate, qty, custom_pack_size) VALUES (?, ?, ?, ?, ?)`,
			orderID, it.ItemID, it.Rate, it.Qty, it.CustomPackSize,
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

// UpdateSalesOrder overwrites an undelivered order completely: it updates the header and
// replaces all line items (delete + re-insert) in one transaction. Deliberately does not
// touch `delivered`/`delivery_number` — the caller's order-content edit form never
// round-trips those, so including them here would silently reset delivery status on every
// content-only save.
//
// Refuses a delivered order outright: once delivered, an order's shape is frozen and only
// qty/rate may move, so this whole-row overwrite (and the line delete below) must never
// reach it. Use UpdateDeliveredSalesOrder instead.
func UpdateSalesOrder(conn *sql.DB, order SalesOrder) (SalesOrder, error) {
	tx, err := conn.Begin()
	if err != nil {
		return SalesOrder{}, fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback() // no-op after a successful Commit

	// Inside the transaction, so it can't race a concurrent mark-delivered.
	var deliveryNo int64
	if err := tx.QueryRow(
		`SELECT delivery_number FROM sales_orders WHERE id = ?`, order.ID,
	).Scan(&deliveryNo); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return SalesOrder{}, fmt.Errorf("sales order %d not found", order.ID)
		}
		return SalesOrder{}, fmt.Errorf("check delivery status of order %d: %w", order.ID, err)
	}
	if deliveryNo > 0 {
		return SalesOrder{}, fmt.Errorf(
			"sales order %d is delivered (delivery no. %d): only qty and rate can be changed",
			order.ID, deliveryNo,
		)
	}

	if _, err := tx.Exec(
		`UPDATE sales_orders SET customer_id = ?, date = ? WHERE id = ?`,
		order.CustomerID, order.Date, order.ID,
	); err != nil {
		return SalesOrder{}, fmt.Errorf("update order: %w", err)
	}

	if _, err := tx.Exec(`DELETE FROM sales_order_items WHERE order_id = ?`, order.ID); err != nil {
		return SalesOrder{}, fmt.Errorf("clear lines: %w", err)
	}
	for i, it := range order.Items {
		if _, err := tx.Exec(
			`INSERT INTO sales_order_items (order_id, item_id, rate, qty, custom_pack_size) VALUES (?, ?, ?, ?, ?)`,
			order.ID, it.ItemID, it.Rate, it.Qty, it.CustomPackSize,
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

// MarkSalesOrderDelivered irreversibly marks an order delivered, assigning it the next
// sequential delivery number, and returns the updated order.
//
// One statement on purpose: the connection pool is not limited to a single connection, so a
// separate "read the max, then write it" pair could land on different connections, and a
// transaction that reads before upgrading to a write is the one shape busy_timeout doesn't
// rescue. The self-referencing MAX is safe because `id = ?` matches at most one row, and
// `delivery_number = 0` is what makes the mark one-way — a second attempt matches nothing.
// `delivered` is set in the same statement so the legacy column can never contradict the
// number (an older build rolled back to by the updater still reads it).
//
// Numbers may have gaps, since delivered orders can still be deleted, and deleting the
// highest-numbered one frees its number for reuse. Both are accepted: single-user app, and
// the number is never shown to the customer. See DECISIONS.md.
func MarkSalesOrderDelivered(conn *sql.DB, id int64) (SalesOrder, error) {
	res, err := conn.Exec(
		`UPDATE sales_orders
			SET delivery_number = (SELECT COALESCE(MAX(delivery_number), 0) + 1 FROM sales_orders),
			    delivered = 1
			WHERE id = ? AND delivery_number = 0`,
		id,
	)
	if err != nil {
		return SalesOrder{}, fmt.Errorf("mark order %d delivered: %w", id, err)
	}
	if n, err := res.RowsAffected(); err == nil && n == 0 {
		// Either the order doesn't exist or it was already delivered — GetSalesOrder tells
		// us which, so the caller gets the accurate reason.
		existing, getErr := GetSalesOrder(conn, id)
		if getErr != nil {
			return SalesOrder{}, fmt.Errorf("sales order %d not found", id)
		}
		return SalesOrder{}, fmt.Errorf(
			"sales order %d is already delivered (delivery no. %d)", id, existing.DeliveryNo,
		)
	}
	return GetSalesOrder(conn, id)
}

// UpdateDeliveredSalesOrder is the only write path for a delivered order: it updates qty
// and rate on the existing lines and nothing else. Customer, date, line count, each line's
// item and each line's custom pack size are all frozen, and a mismatch is an error rather
// than a silent partial write — a delivered order has already gone out, so its shape must
// keep matching what the customer received.
//
// Lines are matched positionally against the stored rows read back in `id` order, which is
// the same order every read hands to the caller. The row ids stay inside this package: the
// caller never sees them, so it can't be relied on to return them, and the per-position
// item/pack-size check is what catches any drift.
func UpdateDeliveredSalesOrder(conn *sql.DB, order SalesOrder) (SalesOrder, error) {
	tx, err := conn.Begin()
	if err != nil {
		return SalesOrder{}, fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback() // no-op after a successful Commit

	var storedCustomerID, deliveryNo int64
	var storedDate string
	if err := tx.QueryRow(
		`SELECT customer_id, date, delivery_number FROM sales_orders WHERE id = ?`, order.ID,
	).Scan(&storedCustomerID, &storedDate, &deliveryNo); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return SalesOrder{}, fmt.Errorf("sales order %d not found", order.ID)
		}
		return SalesOrder{}, fmt.Errorf("read order %d: %w", order.ID, err)
	}
	if deliveryNo == 0 {
		return SalesOrder{}, fmt.Errorf(
			"sales order %d is not delivered: use UpdateSalesOrder", order.ID,
		)
	}
	if order.CustomerID != storedCustomerID {
		return SalesOrder{}, fmt.Errorf("the customer of a delivered order can't be changed")
	}
	if order.Date != storedDate {
		return SalesOrder{}, fmt.Errorf("the date of a delivered order can't be changed")
	}

	type storedLine struct {
		id             int64
		itemID         int64
		customPackSize float64
	}
	rows, err := tx.Query(
		`SELECT id, item_id, custom_pack_size FROM sales_order_items WHERE order_id = ? ORDER BY id`,
		order.ID,
	)
	if err != nil {
		return SalesOrder{}, fmt.Errorf("read order %d lines: %w", order.ID, err)
	}
	stored := []storedLine{}
	for rows.Next() {
		var l storedLine
		if err := rows.Scan(&l.id, &l.itemID, &l.customPackSize); err != nil {
			rows.Close()
			return SalesOrder{}, fmt.Errorf("scan order line: %w", err)
		}
		stored = append(stored, l)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return SalesOrder{}, fmt.Errorf("iterate order %d lines: %w", order.ID, err)
	}
	rows.Close()

	if len(stored) != len(order.Items) {
		return SalesOrder{}, fmt.Errorf(
			"delivered order %d has %d line(s), got %d: lines can't be added or removed",
			order.ID, len(stored), len(order.Items),
		)
	}
	for i, in := range order.Items {
		if in.ItemID != stored[i].itemID {
			return SalesOrder{}, fmt.Errorf(
				"line %d: the item on a delivered order can't be changed", i+1,
			)
		}
		if in.CustomPackSize != stored[i].customPackSize {
			return SalesOrder{}, fmt.Errorf(
				"line %d: the pack size on a delivered order can't be changed", i+1,
			)
		}
	}

	for i, in := range order.Items {
		if _, err := tx.Exec(
			`UPDATE sales_order_items SET rate = ?, qty = ? WHERE id = ?`,
			in.Rate, in.Qty, stored[i].id,
		); err != nil {
			return SalesOrder{}, fmt.Errorf("update line %d: %w", i+1, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return SalesOrder{}, fmt.Errorf("commit: %w", err)
	}
	return GetSalesOrder(conn, order.ID)
}

// ListSalesOrders returns all saved orders (header + line items), newest first.
func ListSalesOrders(conn *sql.DB) ([]SalesOrder, error) {
	rows, err := conn.Query(
		`SELECT so.id, so.customer_id, c.name, c.nick_name, c.city, so.date, so.delivery_number
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
		if err := rows.Scan(
			&o.ID, &o.CustomerID, &o.CustomerName, &o.CustomerNickName, &o.CustomerCity, &o.Date, &o.DeliveryNo,
		); err != nil {
			return nil, fmt.Errorf("scan order: %w", err)
		}
		o.Delivered = o.DeliveryNo > 0
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
		`SELECT soi.order_id, soi.item_id, i.name, i.pack_size, i.gst_percent, i.hsn, soi.rate, soi.qty, soi.custom_pack_size
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
			&orderID, &it.ItemID, &it.ItemName, &it.ItemPackSize, &it.GSTPercent, &it.HSN, &it.Rate, &it.Qty, &it.CustomPackSize,
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
		`SELECT so.id, so.customer_id, c.name, c.nick_name, c.city, so.date, so.delivery_number
			FROM sales_orders so
			JOIN customers c ON c.id = so.customer_id
			WHERE so.id = ?`,
		id,
	).Scan(
		&o.ID, &o.CustomerID, &o.CustomerName, &o.CustomerNickName, &o.CustomerCity, &o.Date, &o.DeliveryNo,
	); err != nil {
		return SalesOrder{}, fmt.Errorf("get order %d: %w", id, err)
	}
	o.Delivered = o.DeliveryNo > 0

	rows, err := conn.Query(
		`SELECT soi.item_id, i.name, i.pack_size, i.gst_percent, i.hsn, soi.rate, soi.qty, soi.custom_pack_size
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
			&it.ItemID, &it.ItemName, &it.ItemPackSize, &it.GSTPercent, &it.HSN, &it.Rate, &it.Qty, &it.CustomPackSize,
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
