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

// migrations is the ordered list of schema changes. NOTE: we're in early, fast schema
// iteration — we are NOT maintaining incremental migrations yet. Edit the schema below
// directly; the local dev DB is reset when it changes (see docs/DATA_MODEL.md). Real
// migrations come later, before there's data worth preserving.
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
