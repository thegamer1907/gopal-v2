// Package db owns the SQLite connection: path resolution, opening/creating the
// database file, and running schema migrations. All database access should go
// through here so the storage location stays in one place (and stays easy to
// make user-configurable later).
package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite" // pure-Go SQLite driver (no CGO)
)

// appDirName is the per-user folder that holds the database file, created under
// the OS config dir (e.g. %APPDATA%\gopal-v2 on Windows,
// ~/Library/Application Support/gopal-v2 on macOS).
const appDirName = "gopal-v2"

// dbFileName is the single SQLite file that holds all app data.
const dbFileName = "inventory.db"

// DefaultPath returns the absolute path to the database file, creating the
// containing directory if it does not exist. The location is derived from
// os.UserConfigDir so it works unchanged across macOS (dev) and Windows (ship).
func DefaultPath() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("resolve user config dir: %w", err)
	}
	dir := filepath.Join(configDir, appDirName)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("create app dir %q: %w", dir, err)
	}
	return filepath.Join(dir, dbFileName), nil
}

// Open opens (creating if needed) the SQLite database at the default path,
// verifies the connection, and runs migrations. The caller owns closing the
// returned *sql.DB.
func Open() (*sql.DB, error) {
	path, err := DefaultPath()
	if err != nil {
		return nil, err
	}
	return OpenAt(path)
}

// OpenAt opens the database at an explicit path. Useful for tests and, later,
// for a user-chosen database location.
func OpenAt(path string) (*sql.DB, error) {
	// _pragma options enable foreign keys and a sane busy timeout.
	dsn := fmt.Sprintf("file:%s?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)", path)
	conn, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite at %q: %w", path, err)
	}
	if err := conn.Ping(); err != nil {
		conn.Close()
		return nil, fmt.Errorf("ping sqlite at %q: %w", path, err)
	}
	if err := migrate(conn); err != nil {
		conn.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return conn, nil
}
