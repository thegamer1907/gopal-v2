package db

import (
	"path/filepath"
	"testing"
)

func TestCustomerSnoozes(t *testing.T) {
	conn, err := OpenAt(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("OpenAt: %v", err)
	}
	defer conn.Close()

	c, err := AddCustomer(conn, Customer{Name: "Amber Traders", City: "Meerut"})
	if err != nil {
		t.Fatalf("AddCustomer: %v", err)
	}

	if err := SnoozeCustomer(conn, c.ID, "29-Oct-26", 15, "day"); err != nil {
		t.Fatalf("SnoozeCustomer: %v", err)
	}
	// Re-snoozing replaces the earlier row rather than adding a second.
	if err := SnoozeCustomer(conn, c.ID, "30-Oct-26", 2, "month"); err != nil {
		t.Fatalf("re-snooze: %v", err)
	}
	got, err := ListCustomerSnoozes(conn)
	if err != nil {
		t.Fatalf("ListCustomerSnoozes: %v", err)
	}
	want := CustomerSnooze{CustomerID: c.ID, SnoozedOn: "30-Oct-26", Amount: 2, Unit: "month"}
	if len(got) != 1 || got[0] != want {
		t.Fatalf("snoozes = %+v, want [%+v]", got, want)
	}

	if err := SnoozeCustomer(conn, c.ID, "30-Oct-26", 0, "day"); err == nil {
		t.Error("amount 0 should be rejected")
	}
	if err := SnoozeCustomer(conn, c.ID, "30-Oct-26", 3, "year"); err == nil {
		t.Error("unit year should be rejected")
	}
	if err := SnoozeCustomer(conn, 9999, "30-Oct-26", 3, "day"); err == nil {
		t.Error("unknown customer should be rejected by the FK")
	}

	// Deleting the customer (no orders) cascades its snooze away.
	if err := DeleteCustomer(conn, c.ID); err != nil {
		t.Fatalf("DeleteCustomer: %v", err)
	}
	if got, _ := ListCustomerSnoozes(conn); len(got) != 0 {
		t.Errorf("snooze should cascade-delete, got %+v", got)
	}
}
