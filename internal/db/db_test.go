package db

import (
	"path/filepath"
	"testing"
)

// TestItemsRoundTripAndPersistence verifies that an item added through one
// connection is readable, and survives reopening the same database file.
func TestItemsRoundTripAndPersistence(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.db")

	conn, err := OpenAt(path)
	if err != nil {
		t.Fatalf("OpenAt: %v", err)
	}

	added, err := AddItem(conn, "widget", 5)
	if err != nil {
		t.Fatalf("AddItem: %v", err)
	}
	if added.ID == 0 || added.Name != "widget" || added.Quantity != 5 {
		t.Fatalf("unexpected added item: %+v", added)
	}

	items, err := ListItems(conn)
	if err != nil {
		t.Fatalf("ListItems: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("want 1 item, got %d", len(items))
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
