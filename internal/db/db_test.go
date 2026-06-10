package db

import (
	"path/filepath"
	"testing"
)

// TestItemsRoundTripAndPersistence verifies that an item added (under a company)
// through one connection is readable, and survives reopening the same database file.
func TestItemsRoundTripAndPersistence(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.db")

	conn, err := OpenAt(path)
	if err != nil {
		t.Fatalf("OpenAt: %v", err)
	}

	company, err := AddCompany(conn, "Acme")
	if err != nil {
		t.Fatalf("AddCompany: %v", err)
	}

	added, err := AddItem(conn, company.ID, "widget", 100, 18, 3402)
	if err != nil {
		t.Fatalf("AddItem: %v", err)
	}
	if added.Name != "widget" || added.PackSize != 100 || added.GSTPercent != 18 ||
		added.HSN != 3402 || added.CompanyID != company.ID {
		t.Fatalf("unexpected added item: %+v", added)
	}

	items, err := ListItems(conn)
	if err != nil {
		t.Fatalf("ListItems: %v", err)
	}
	if len(items) != 1 || items[0].CompanyName != "Acme" {
		t.Fatalf("want 1 item with company Acme, got %+v", items)
	}

	byCompany, err := ListItemsByCompany(conn, company.ID)
	if err != nil {
		t.Fatalf("ListItemsByCompany: %v", err)
	}
	if len(byCompany) != 1 || byCompany[0].Name != "widget" {
		t.Fatalf("ListItemsByCompany want 1 widget, got %+v", byCompany)
	}
	conn.Close()

	// Reopen the same file: data must still be there (and migrations idempotent).
	conn2, err := OpenAt(path)
	if err != nil {
		t.Fatalf("reopen OpenAt: %v", err)
	}
	defer conn2.Close()

	items, err = ListItems(conn2)
	if err != nil {
		t.Fatalf("ListItems after reopen: %v", err)
	}
	if len(items) != 1 || items[0].Name != "widget" {
		t.Fatalf("persistence failed, got %+v", items)
	}
}
