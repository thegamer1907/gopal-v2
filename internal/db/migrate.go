package db

import (
	"database/sql"
	"fmt"
)

// migration is a single, ordered, forward-only schema change. Migrations are
// applied in slice order; each runs at most once (tracked in schema_migrations).
type migration struct {
	id  int
	sql string
}

// migrations is the ordered, append-only list of schema changes, each applied at most
// once (tracked in schema_migrations) — including against the client's real database. An
// additive change (new table, new DEFAULTed column) is always safe to append here; a
// genuinely breaking change (rename/retype/drop an existing column) needs a real,
// hand-written migration instead of a plain CREATE/ALTER. See docs/DATA_MODEL.md for the
// full policy — this is not a from-scratch-only schema anymore.
var migrations = []migration{
	// Company master. Surrogate id PK so items/bills can FK to it without breaking when a
	// company is renamed; name is unique. Created first so it's a valid FK target.
	{
		id: 1,
		sql: `CREATE TABLE IF NOT EXISTS companies (
			id   INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE
		);`,
	},
	// Item master. An item belongs to a company (company_id FK). Surrogate id PK so bill
	// lines FK to it cleanly; (company_id, name, pack_size) is unique within a company.
	{
		id: 2,
		sql: `CREATE TABLE IF NOT EXISTS items (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			company_id  INTEGER NOT NULL,
			name        TEXT NOT NULL,
			pack_size   REAL NOT NULL DEFAULT 0,
			gst_percent REAL NOT NULL DEFAULT 0,
			hsn         INTEGER NOT NULL DEFAULT 0,
			UNIQUE (company_id, name, pack_size),
			FOREIGN KEY (company_id) REFERENCES companies(id)
		);`,
	},
	// Purchase bill header (Company, Bill number, Date). Surrogate id so line items
	// have a clean FK target; company_id → companies(id).
	{
		id: 3,
		sql: `CREATE TABLE IF NOT EXISTS purchase_bills (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			company_id  INTEGER NOT NULL,
			bill_number TEXT NOT NULL,
			date        TEXT NOT NULL,
			FOREIGN KEY (company_id) REFERENCES companies(id)
		);`,
	},
	// Purchase bill line items. References the parent bill and an item in the master
	// (item_id → items(id)). Item name/pack/GST are read back via a JOIN, not stored.
	{
		id: 4,
		sql: `CREATE TABLE IF NOT EXISTS purchase_bill_items (
			id        INTEGER PRIMARY KEY AUTOINCREMENT,
			bill_id   INTEGER NOT NULL,
			item_id   INTEGER NOT NULL,
			tax_qty   REAL NOT NULL DEFAULT 0,
			tax_value REAL NOT NULL DEFAULT 0,
			d_qty     REAL NOT NULL DEFAULT 0,
			d_value   REAL NOT NULL DEFAULT 0,
			discount  REAL NOT NULL DEFAULT 0,
			remarks   TEXT NOT NULL DEFAULT '',
			FOREIGN KEY (bill_id) REFERENCES purchase_bills(id) ON DELETE CASCADE,
			FOREIGN KEY (item_id) REFERENCES items(id)
		);`,
	},
	// Customer master (first piece of the Sales feature). Surrogate id PK; name is NOT
	// unique (two customers may share a display name). Only name/city are required by
	// the app; every other column defaults to '' so partially-filled customers save
	// cleanly. state is plain text (a small, effectively static list), not a lookup table.
	{
		id: 5,
		sql: `CREATE TABLE IF NOT EXISTS customers (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			name       TEXT NOT NULL,
			nick_name  TEXT NOT NULL DEFAULT '',
			address1   TEXT NOT NULL DEFAULT '',
			address2   TEXT NOT NULL DEFAULT '',
			city       TEXT NOT NULL DEFAULT '',
			state      TEXT NOT NULL DEFAULT '',
			pincode    TEXT NOT NULL DEFAULT '',
			gstin      TEXT NOT NULL DEFAULT '',
			mobile     TEXT NOT NULL DEFAULT ''
		);`,
	},
	// Sales order header (first piece of the Order Book / Sales feature, after
	// Customers). Surrogate id PK; references a customer. No order number for v1 — just
	// the internal id.
	{
		id: 6,
		sql: `CREATE TABLE IF NOT EXISTS sales_orders (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			customer_id INTEGER NOT NULL,
			date        TEXT NOT NULL,
			FOREIGN KEY (customer_id) REFERENCES customers(id)
		);`,
	},
	// Sales order line items. References the parent order and an item in the master.
	// Rate/Qty are entered by the user; Final Amount (rate × qty × pack size) is derived
	// on the frontend and not stored, same as purchase_bill_items' calculated columns.
	{
		id: 7,
		sql: `CREATE TABLE IF NOT EXISTS sales_order_items (
			id       INTEGER PRIMARY KEY AUTOINCREMENT,
			order_id INTEGER NOT NULL,
			item_id  INTEGER NOT NULL,
			rate     REAL NOT NULL DEFAULT 0,
			qty      REAL NOT NULL DEFAULT 0,
			FOREIGN KEY (order_id) REFERENCES sales_orders(id) ON DELETE CASCADE,
			FOREIGN KEY (item_id) REFERENCES items(id)
		);`,
	},
}

// migrate applies any migrations not yet recorded in schema_migrations.
func migrate(conn *sql.DB) error {
	if _, err := conn.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
		id      INTEGER PRIMARY KEY,
		applied TEXT    NOT NULL
	);`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	for _, m := range migrations {
		var exists int
		if err := conn.QueryRow(
			`SELECT COUNT(1) FROM schema_migrations WHERE id = ?`, m.id,
		).Scan(&exists); err != nil {
			return fmt.Errorf("check migration %d: %w", m.id, err)
		}
		if exists > 0 {
			continue
		}

		tx, err := conn.Begin()
		if err != nil {
			return fmt.Errorf("begin migration %d: %w", m.id, err)
		}
		if _, err := tx.Exec(m.sql); err != nil {
			tx.Rollback()
			return fmt.Errorf("apply migration %d: %w", m.id, err)
		}
		if _, err := tx.Exec(
			`INSERT INTO schema_migrations (id, applied) VALUES (?, datetime('now'))`, m.id,
		); err != nil {
			tx.Rollback()
			return fmt.Errorf("record migration %d: %w", m.id, err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit migration %d: %w", m.id, err)
		}
	}
	return nil
}
