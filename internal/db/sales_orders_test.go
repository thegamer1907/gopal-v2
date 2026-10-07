package db

import (
	"database/sql"
	"path/filepath"
	"testing"
)

// salesFixture is the minimal master data a sales order needs: one customer and two items.
type salesFixture struct {
	conn          *sql.DB
	path          string
	customerID    int64
	otherCustomer int64 // set only by tests that need a second customer
	itemA         int64
	itemB         int64
}

func seedSales(t *testing.T) salesFixture {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.db")
	conn, err := OpenAt(path)
	if err != nil {
		t.Fatalf("OpenAt: %v", err)
	}
	t.Cleanup(func() { conn.Close() })

	company, err := AddCompany(conn, "Acme")
	if err != nil {
		t.Fatalf("AddCompany: %v", err)
	}
	itemA, err := AddItem(conn, company.ID, "widget", 20, 18, 3402)
	if err != nil {
		t.Fatalf("AddItem A: %v", err)
	}
	itemB, err := AddItem(conn, company.ID, "gizmo", 36, 12, 3403)
	if err != nil {
		t.Fatalf("AddItem B: %v", err)
	}
	customer, err := AddCustomer(conn, Customer{Name: "Ravi Stores", City: "Pune"})
	if err != nil {
		t.Fatalf("AddCustomer: %v", err)
	}
	return salesFixture{conn: conn, path: path, customerID: customer.ID, itemA: itemA.ID, itemB: itemB.ID}
}

// addOrder saves a two-line order on the given date.
func (f salesFixture) addOrder(t *testing.T, date string) SalesOrder {
	t.Helper()
	order, err := AddSalesOrder(f.conn, SalesOrder{
		CustomerID: f.customerID,
		Date:       date,
		Items: []SalesOrderItem{
			{ItemID: f.itemA, Rate: 10, Qty: 5},
			{ItemID: f.itemB, Rate: 20, Qty: 3},
		},
	})
	if err != nil {
		t.Fatalf("AddSalesOrder: %v", err)
	}
	return order
}

func (f salesFixture) deliveryNo(t *testing.T, id int64) int64 {
	t.Helper()
	var n int64
	if err := f.conn.QueryRow(`SELECT delivery_number FROM sales_orders WHERE id = ?`, id).Scan(&n); err != nil {
		t.Fatalf("read delivery_number of %d: %v", id, err)
	}
	return n
}

// TestSalesOrderRoundTripAndPersistence covers the basic save/read cycle — previously
// untested — and that a new order starts undelivered.
func TestSalesOrderRoundTripAndPersistence(t *testing.T) {
	f := seedSales(t)
	saved := f.addOrder(t, "01-Oct-26")

	got, err := GetSalesOrder(f.conn, saved.ID)
	if err != nil {
		t.Fatalf("GetSalesOrder: %v", err)
	}
	if got.CustomerName != "Ravi Stores" || got.CustomerCity != "Pune" || len(got.Items) != 2 {
		t.Fatalf("unexpected order: %+v", got)
	}
	if got.DeliveryNo != 0 || got.Delivered {
		t.Fatalf("new order should be undelivered, got DeliveryNo=%d Delivered=%v", got.DeliveryNo, got.Delivered)
	}
	if got.Items[0].ItemName != "widget" || got.Items[0].ItemPackSize != 20 {
		t.Fatalf("line 1 should join the item master: %+v", got.Items[0])
	}

	list, err := ListSalesOrders(f.conn)
	if err != nil {
		t.Fatalf("ListSalesOrders: %v", err)
	}
	if len(list) != 1 || list[0].DeliveryNo != 0 || len(list[0].Items) != 2 {
		t.Fatalf("unexpected list: %+v", list)
	}
	f.conn.Close()

	// Reopen the same file: the order and its undelivered state must survive.
	conn2, err := OpenAt(f.path)
	if err != nil {
		t.Fatalf("reopen OpenAt: %v", err)
	}
	defer conn2.Close()
	reopened, err := GetSalesOrder(conn2, saved.ID)
	if err != nil {
		t.Fatalf("GetSalesOrder after reopen: %v", err)
	}
	if reopened.DeliveryNo != 0 || len(reopened.Items) != 2 {
		t.Fatalf("persistence failed: %+v", reopened)
	}
}

// TestMarkSalesOrderDeliveredAssignsSequentialNumbers checks the numbering starts at 1,
// increments, leaves other orders alone, and persists.
func TestMarkSalesOrderDeliveredAssignsSequentialNumbers(t *testing.T) {
	f := seedSales(t)
	a := f.addOrder(t, "01-Oct-26")
	b := f.addOrder(t, "02-Oct-26")
	c := f.addOrder(t, "03-Oct-26")

	markedA, err := MarkSalesOrderDelivered(f.conn, a.ID)
	if err != nil {
		t.Fatalf("mark A: %v", err)
	}
	if markedA.DeliveryNo != 1 || !markedA.Delivered {
		t.Fatalf("first delivered order should be no. 1, got %+v", markedA)
	}

	markedC, err := MarkSalesOrderDelivered(f.conn, c.ID)
	if err != nil {
		t.Fatalf("mark C: %v", err)
	}
	if markedC.DeliveryNo != 2 {
		t.Fatalf("second delivered order should be no. 2, got %d", markedC.DeliveryNo)
	}

	if n := f.deliveryNo(t, b.ID); n != 0 {
		t.Fatalf("unmarked order B should still be 0, got %d", n)
	}
	f.conn.Close()

	conn2, err := OpenAt(f.path)
	if err != nil {
		t.Fatalf("reopen OpenAt: %v", err)
	}
	defer conn2.Close()
	reopened, err := GetSalesOrder(conn2, c.ID)
	if err != nil {
		t.Fatalf("GetSalesOrder after reopen: %v", err)
	}
	if reopened.DeliveryNo != 2 || !reopened.Delivered {
		t.Fatalf("delivery number should persist, got %+v", reopened)
	}
}

// TestMarkSalesOrderDeliveredIsOneWay verifies a second mark is refused, the number is
// untouched, and the legacy `delivered` column really was written alongside it.
func TestMarkSalesOrderDeliveredIsOneWay(t *testing.T) {
	f := seedSales(t)
	order := f.addOrder(t, "01-Oct-26")

	if _, err := MarkSalesOrderDelivered(f.conn, order.ID); err != nil {
		t.Fatalf("first mark: %v", err)
	}
	if _, err := MarkSalesOrderDelivered(f.conn, order.ID); err == nil {
		t.Fatal("marking an already-delivered order should fail")
	}
	if n := f.deliveryNo(t, order.ID); n != 1 {
		t.Fatalf("delivery number should stay 1 after a refused re-mark, got %d", n)
	}

	var delivered int
	if err := f.conn.QueryRow(`SELECT delivered FROM sales_orders WHERE id = ?`, order.ID).Scan(&delivered); err != nil {
		t.Fatalf("read delivered: %v", err)
	}
	if delivered != 1 {
		t.Fatalf("legacy delivered column should be 1, got %d", delivered)
	}
}

func TestMarkSalesOrderDeliveredMissingOrder(t *testing.T) {
	f := seedSales(t)
	if _, err := MarkSalesOrderDelivered(f.conn, 9999); err == nil {
		t.Fatal("marking a nonexistent order should fail")
	}
}

// TestUpdateSalesOrderRefusesDeliveredOrder is the structural guarantee that the whole-row
// overwrite (and its line delete) can never reach a delivered order.
func TestUpdateSalesOrderRefusesDeliveredOrder(t *testing.T) {
	f := seedSales(t)
	order := f.addOrder(t, "01-Oct-26")
	if _, err := MarkSalesOrderDelivered(f.conn, order.ID); err != nil {
		t.Fatalf("mark: %v", err)
	}

	_, err := UpdateSalesOrder(f.conn, SalesOrder{
		ID:         order.ID,
		CustomerID: f.customerID,
		Date:       "09-Oct-26",
		Items:      []SalesOrderItem{{ItemID: f.itemA, Rate: 99, Qty: 1}},
	})
	if err == nil {
		t.Fatal("UpdateSalesOrder should refuse a delivered order")
	}

	got, err := GetSalesOrder(f.conn, order.ID)
	if err != nil {
		t.Fatalf("GetSalesOrder: %v", err)
	}
	if got.Date != "01-Oct-26" {
		t.Fatalf("date should be untouched, got %q", got.Date)
	}
	if len(got.Items) != 2 {
		t.Fatalf("lines should be untouched (rollback), got %d", len(got.Items))
	}
	if got.DeliveryNo != 1 {
		t.Fatalf("delivery number should be untouched, got %d", got.DeliveryNo)
	}
}

func TestUpdateSalesOrderNotFound(t *testing.T) {
	f := seedSales(t)
	if _, err := UpdateSalesOrder(f.conn, SalesOrder{ID: 9999, CustomerID: f.customerID, Date: "01-Oct-26"}); err == nil {
		t.Fatal("UpdateSalesOrder on a nonexistent order should fail")
	}
}

// TestUpdateDeliveredSalesOrderQtyAndRate checks the allowed edit, and that it's a targeted
// update — the line row ids must survive, proving it isn't a delete-and-reinsert.
func TestUpdateDeliveredSalesOrderQtyAndRate(t *testing.T) {
	f := seedSales(t)
	order := f.addOrder(t, "01-Oct-26")
	if _, err := MarkSalesOrderDelivered(f.conn, order.ID); err != nil {
		t.Fatalf("mark: %v", err)
	}
	idsBefore := f.lineIDs(t, order.ID)

	updated, err := UpdateDeliveredSalesOrder(f.conn, SalesOrder{
		ID:         order.ID,
		CustomerID: f.customerID,
		Date:       "01-Oct-26",
		Items: []SalesOrderItem{
			{ItemID: f.itemA, Rate: 11.5, Qty: 7},
			{ItemID: f.itemB, Rate: 25, Qty: 4},
		},
	})
	if err != nil {
		t.Fatalf("UpdateDeliveredSalesOrder: %v", err)
	}
	if updated.Items[0].Rate != 11.5 || updated.Items[0].Qty != 7 ||
		updated.Items[1].Rate != 25 || updated.Items[1].Qty != 4 {
		t.Fatalf("qty/rate not applied: %+v", updated.Items)
	}
	if updated.DeliveryNo != 1 || !updated.Delivered {
		t.Fatalf("delivery status should survive the edit, got %+v", updated)
	}

	idsAfter := f.lineIDs(t, order.ID)
	if len(idsAfter) != len(idsBefore) {
		t.Fatalf("line count changed: %v -> %v", idsBefore, idsAfter)
	}
	for i := range idsBefore {
		if idsBefore[i] != idsAfter[i] {
			t.Fatalf("line rows were replaced, not updated: %v -> %v", idsBefore, idsAfter)
		}
	}
}

func (f salesFixture) lineIDs(t *testing.T, orderID int64) []int64 {
	t.Helper()
	rows, err := f.conn.Query(`SELECT id FROM sales_order_items WHERE order_id = ? ORDER BY id`, orderID)
	if err != nil {
		t.Fatalf("read line ids: %v", err)
	}
	defer rows.Close()
	ids := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			t.Fatalf("scan line id: %v", err)
		}
		ids = append(ids, id)
	}
	return ids
}

// TestUpdateDeliveredSalesOrderRejections pins every frozen field: each case changes one
// thing off a valid baseline and must be refused, leaving the order exactly as it was.
func TestUpdateDeliveredSalesOrderRejections(t *testing.T) {
	cases := []struct {
		name  string
		mutate func(f salesFixture, o *SalesOrder)
	}{
		{"changed customer", func(f salesFixture, o *SalesOrder) { o.CustomerID = f.otherCustomer }},
		{"changed date", func(f salesFixture, o *SalesOrder) { o.Date = "09-Oct-26" }},
		{"line appended", func(f salesFixture, o *SalesOrder) {
			o.Items = append(o.Items, SalesOrderItem{ItemID: f.itemA, Rate: 1, Qty: 1})
		}},
		{"line removed", func(f salesFixture, o *SalesOrder) { o.Items = o.Items[:1] }},
		{"item swapped", func(f salesFixture, o *SalesOrder) { o.Items[0].ItemID = f.itemB }},
		{"pack size changed", func(f salesFixture, o *SalesOrder) { o.Items[0].CustomPackSize = 50 }},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := seedSales(t)
			other, err := AddCustomer(f.conn, Customer{Name: "Other Stores", City: "Nashik"})
			if err != nil {
				t.Fatalf("AddCustomer: %v", err)
			}
			f.otherCustomer = other.ID

			order := f.addOrder(t, "01-Oct-26")
			if _, err := MarkSalesOrderDelivered(f.conn, order.ID); err != nil {
				t.Fatalf("mark: %v", err)
			}
			baseline, err := GetSalesOrder(f.conn, order.ID)
			if err != nil {
				t.Fatalf("baseline GetSalesOrder: %v", err)
			}

			payload := SalesOrder{
				ID:         order.ID,
				CustomerID: f.customerID,
				Date:       "01-Oct-26",
				Items: []SalesOrderItem{
					{ItemID: f.itemA, Rate: 10, Qty: 5},
					{ItemID: f.itemB, Rate: 20, Qty: 3},
				},
			}
			tc.mutate(f, &payload)

			if _, err := UpdateDeliveredSalesOrder(f.conn, payload); err == nil {
				t.Fatalf("%s should be rejected", tc.name)
			}

			after, err := GetSalesOrder(f.conn, order.ID)
			if err != nil {
				t.Fatalf("GetSalesOrder after rejection: %v", err)
			}
			if after.CustomerID != baseline.CustomerID || after.Date != baseline.Date ||
				after.DeliveryNo != baseline.DeliveryNo || len(after.Items) != len(baseline.Items) {
				t.Fatalf("order changed despite rejection:\n baseline %+v\n after    %+v", baseline, after)
			}
			for i := range baseline.Items {
				if after.Items[i] != baseline.Items[i] {
					t.Fatalf("line %d changed despite rejection: %+v -> %+v", i+1, baseline.Items[i], after.Items[i])
				}
			}
		})
	}
}

func TestUpdateDeliveredSalesOrderRejectsUndeliveredOrder(t *testing.T) {
	f := seedSales(t)
	order := f.addOrder(t, "01-Oct-26")

	_, err := UpdateDeliveredSalesOrder(f.conn, SalesOrder{
		ID:         order.ID,
		CustomerID: f.customerID,
		Date:       "01-Oct-26",
		Items: []SalesOrderItem{
			{ItemID: f.itemA, Rate: 11, Qty: 6},
			{ItemID: f.itemB, Rate: 21, Qty: 4},
		},
	})
	if err == nil {
		t.Fatal("UpdateDeliveredSalesOrder should refuse an undelivered order")
	}
}

// TestDeleteDeliveredSalesOrderLeavesGap documents the accepted numbering behaviour:
// deleting a delivered order leaves a permanent gap, and deleting the highest-numbered one
// frees its number for reuse.
func TestDeleteDeliveredSalesOrderLeavesGap(t *testing.T) {
	f := seedSales(t)
	a := f.addOrder(t, "01-Oct-26")
	b := f.addOrder(t, "02-Oct-26")
	c := f.addOrder(t, "03-Oct-26")
	for _, id := range []int64{a.ID, b.ID, c.ID} {
		if _, err := MarkSalesOrderDelivered(f.conn, id); err != nil {
			t.Fatalf("mark %d: %v", id, err)
		}
	}

	// Deleting a middle one leaves its number permanently missing.
	if err := DeleteSalesOrder(f.conn, b.ID); err != nil {
		t.Fatalf("DeleteSalesOrder: %v", err)
	}
	if n := f.deliveryNo(t, a.ID); n != 1 {
		t.Fatalf("A should still be 1, got %d", n)
	}
	if n := f.deliveryNo(t, c.ID); n != 3 {
		t.Fatalf("C should still be 3, got %d", n)
	}

	// The next mark continues past the max — the gap at 2 is never refilled.
	d := f.addOrder(t, "04-Oct-26")
	markedD, err := MarkSalesOrderDelivered(f.conn, d.ID)
	if err != nil {
		t.Fatalf("mark D: %v", err)
	}
	if markedD.DeliveryNo != 4 {
		t.Fatalf("next number should be 4, got %d", markedD.DeliveryNo)
	}

	// Deleting the highest frees its number for reuse — accepted, see DECISIONS.md.
	if err := DeleteSalesOrder(f.conn, d.ID); err != nil {
		t.Fatalf("DeleteSalesOrder D: %v", err)
	}
	e := f.addOrder(t, "05-Oct-26")
	markedE, err := MarkSalesOrderDelivered(f.conn, e.ID)
	if err != nil {
		t.Fatalf("mark E: %v", err)
	}
	if markedE.DeliveryNo != 4 {
		t.Fatalf("number of a deleted highest order is reused, want 4, got %d", markedE.DeliveryNo)
	}
}

// TestBackfillDeliveryNumbers runs migration 11's statement against rows in the pre-migration
// shape (delivered = 1 with no number), which is what the client's database looks like.
func TestBackfillDeliveryNumbers(t *testing.T) {
	f := seedSales(t)
	orders := []SalesOrder{
		f.addOrder(t, "01-Oct-26"),
		f.addOrder(t, "02-Oct-26"),
		f.addOrder(t, "03-Oct-26"),
		f.addOrder(t, "04-Oct-26"),
		f.addOrder(t, "05-Oct-26"),
	}
	// Legacy state: marked delivered by an older build, so no delivery_number yet.
	legacy := []int64{orders[0].ID, orders[2].ID, orders[3].ID}
	for _, id := range legacy {
		if _, err := f.conn.Exec(
			`UPDATE sales_orders SET delivered = 1, delivery_number = 0 WHERE id = ?`, id,
		); err != nil {
			t.Fatalf("set legacy state on %d: %v", id, err)
		}
	}

	if _, err := f.conn.Exec(backfillDeliveryNumbersSQL); err != nil {
		t.Fatalf("backfill: %v", err)
	}

	want := map[int64]int64{
		orders[0].ID: 1, orders[2].ID: 2, orders[3].ID: 3,
		orders[1].ID: 0, orders[4].ID: 0,
	}
	for id, n := range want {
		if got := f.deliveryNo(t, id); got != n {
			t.Fatalf("order %d: want delivery number %d, got %d", id, n, got)
		}
	}

	// Re-running must not renumber anything.
	if _, err := f.conn.Exec(backfillDeliveryNumbersSQL); err != nil {
		t.Fatalf("backfill rerun: %v", err)
	}
	for id, n := range want {
		if got := f.deliveryNo(t, id); got != n {
			t.Fatalf("after rerun, order %d: want %d, got %d", id, n, got)
		}
	}
}
