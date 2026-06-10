package main

import (
	"context"
	"database/sql"
	"fmt"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"gopal-v2/internal/db"
)

// App struct
type App struct {
	ctx    context.Context
	db     *sql.DB
	dbPath string // absolute path of the currently-open database file
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved so we can call the
// runtime methods, and the SQLite database is opened (created on first run) at the
// user-configured path, falling back to the default if that path can't be opened.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	path, err := db.ActivePath()
	if err == nil {
		var conn *sql.DB
		if conn, err = db.OpenAt(path); err == nil {
			a.db = conn
			a.dbPath = path
			return
		}
	}

	// The configured path failed (e.g. a removed drive). Fall back to the default
	// so a bad saved path can't brick the app, and clear the stale config.
	fmt.Printf("opening configured database failed (%v); falling back to default\n", err)
	defaultPath, derr := db.DefaultPath()
	if derr != nil {
		panic(fmt.Sprintf("failed to resolve default database path: %v", derr))
	}
	conn, derr := db.OpenAt(defaultPath)
	if derr != nil {
		// Without a database the app can't function; surface it loudly.
		panic(fmt.Sprintf("failed to open database: %v", derr))
	}
	a.db = conn
	a.dbPath = defaultPath
	_ = db.SaveConfig(db.Config{}) // reset to default; ignore write errors
}

// shutdown is called when the app closes; release the database handle.
func (a *App) shutdown(ctx context.Context) {
	if a.db != nil {
		a.db.Close()
	}
}

// AddItem creates an item master record (for a company) and returns the stored record.
func (a *App) AddItem(companyID int64, name string, packSize, gstPercent float64, hsn int64) (db.Item, error) {
	return db.AddItem(a.db, companyID, name, packSize, gstPercent, hsn)
}

// ListItems returns all inventory items (with their company name), ordered by company then item.
func (a *App) ListItems() ([]db.Item, error) {
	return db.ListItems(a.db)
}

// ListItemsByCompany returns the items belonging to one company.
func (a *App) ListItemsByCompany(companyID int64) ([]db.Item, error) {
	return db.ListItemsByCompany(a.db, companyID)
}

// AddCompany creates a company master record and returns the stored record.
func (a *App) AddCompany(name string) (db.Company, error) {
	return db.AddCompany(a.db, name)
}

// ListCompanies returns all companies in the master, ordered by name.
func (a *App) ListCompanies() ([]db.Company, error) {
	return db.ListCompanies(a.db)
}

// --- Database management (Settings → Database) ---

// GetDatabasePath returns the absolute path of the currently-open database file.
func (a *App) GetDatabasePath() string {
	return a.dbPath
}

// OpenExistingDatabase prompts for an existing .db file and switches the app to it.
// Returns the chosen path, or "" if the user cancelled (the current DB is kept).
func (a *App) OpenExistingDatabase() (string, error) {
	path, err := wruntime.OpenFileDialog(a.ctx, wruntime.OpenDialogOptions{
		Title: "Open database",
		Filters: []wruntime.FileFilter{
			{DisplayName: "SQLite database (*.db)", Pattern: "*.db"},
		},
	})
	if err != nil {
		return "", err
	}
	if path == "" {
		return "", nil // cancelled
	}
	if err := a.switchTo(path); err != nil {
		return "", err
	}
	return path, nil
}

// CreateNewDatabase prompts for a location for a new database and switches the app
// to it (OpenAt creates the file and migrates a fresh schema). Returns the chosen
// path, or "" if the user cancelled.
func (a *App) CreateNewDatabase() (string, error) {
	path, err := wruntime.SaveFileDialog(a.ctx, wruntime.SaveDialogOptions{
		Title:           "Create new database",
		DefaultFilename: "inventory.db",
		Filters: []wruntime.FileFilter{
			{DisplayName: "SQLite database (*.db)", Pattern: "*.db"},
		},
	})
	if err != nil {
		return "", err
	}
	if path == "" {
		return "", nil // cancelled
	}
	if err := a.switchTo(path); err != nil {
		return "", err
	}
	return path, nil
}

// WipeDatabase deletes all data in the current database and recreates an empty,
// freshly-migrated schema. The active path/config is unchanged.
func (a *App) WipeDatabase() error {
	if a.db != nil {
		a.db.Close()
	}
	conn, err := db.WipeAt(a.dbPath)
	if err != nil {
		return err
	}
	a.db = conn
	return nil
}

// Quit closes the application (from the sidebar Logout button).
func (a *App) Quit() {
	wruntime.Quit(a.ctx)
}

// switchTo opens the database at path and, only on success, swaps it in as the
// active connection and persists the choice. On failure the current DB is kept,
// so a bad/unreadable file never leaves the app without a database.
func (a *App) switchTo(path string) error {
	conn, err := db.OpenAt(path)
	if err != nil {
		return err
	}
	if a.db != nil {
		a.db.Close()
	}
	a.db = conn
	a.dbPath = path
	return db.SaveConfig(db.Config{DBPath: path})
}

// AddPurchaseBill saves a purchase bill (header + line items) and returns it with
// its assigned id.
func (a *App) AddPurchaseBill(bill db.PurchaseBill) (db.PurchaseBill, error) {
	return db.AddPurchaseBill(a.db, bill)
}

// ListPurchaseBills returns all saved purchase bills (header + line items), newest first.
func (a *App) ListPurchaseBills() ([]db.PurchaseBill, error) {
	return db.ListPurchaseBills(a.db)
}

// GetPurchaseBill returns a single purchase bill (header + line items) by id.
func (a *App) GetPurchaseBill(id int64) (db.PurchaseBill, error) {
	return db.GetPurchaseBill(a.db, id)
}

// UpdatePurchaseBill overwrites a bill completely (header + all line items).
func (a *App) UpdatePurchaseBill(bill db.PurchaseBill) (db.PurchaseBill, error) {
	return db.UpdatePurchaseBill(a.db, bill)
}

// DeletePurchaseBill removes a bill and its line items.
func (a *App) DeletePurchaseBill(id int64) error {
	return db.DeletePurchaseBill(a.db, id)
}
