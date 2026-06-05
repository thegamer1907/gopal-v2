package main

import (
	"context"
	"database/sql"
	"fmt"

	"gopal-v2/internal/db"
)

// App struct
type App struct {
	ctx context.Context
	db  *sql.DB
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved so we can call the
// runtime methods, and the SQLite database is opened (created on first run).
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	conn, err := db.Open()
	if err != nil {
		// Without a database the app can't function; surface it loudly.
		panic(fmt.Sprintf("failed to open database: %v", err))
	}
	a.db = conn
}

// shutdown is called when the app closes; release the database handle.
func (a *App) shutdown(ctx context.Context) {
	if a.db != nil {
		a.db.Close()
	}
}

// AddItem creates an inventory item and returns the stored record.
func (a *App) AddItem(name string, quantity int) (db.Item, error) {
	return db.AddItem(a.db, name, quantity)
}

// ListItems returns all inventory items, newest first.
func (a *App) ListItems() ([]db.Item, error) {
	return db.ListItems(a.db)
}
