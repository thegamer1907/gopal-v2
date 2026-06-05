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

// migrations is the ordered list of schema changes. Append new migrations to the
// end with the next id — never edit or reorder existing ones. Keep this in sync
// with docs/DATA_MODEL.md.
var migrations = []migration{
	{
		id: 1,
		sql: `CREATE TABLE IF NOT EXISTS items (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			name       TEXT    NOT NULL,
			quantity   INTEGER NOT NULL DEFAULT 0,
			created_at TEXT    NOT NULL
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
