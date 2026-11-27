package reports

import (
	"path/filepath"
	"testing"

	"github.com/xuri/excelize/v2"
)

// The Sales Report workbook (the Order Report's UI name) must carry a Company column between
// City and Item, with Totals still under Item / Qty / Final Amount.
func TestWriteOrderReportHasCompanyColumn(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sales.xlsx")
	rows := []OrderReportRow{
		{Date: "05-Nov-26", CustomerName: "Amber", CustomerCity: "Meerut", CompanyName: "Prayagh", ItemName: "Eclair", PackSize: 32, GSTPercent: 5, HSN: 170490, Qty: 4, Rate: 10, FinalAmount: 400},
		{Date: "06-Nov-26", CustomerName: "Sample", CustomerCity: "Delhi", CompanyName: "Acme", ItemName: "Widget", PackSize: 10, GSTPercent: 18, HSN: 3402, Qty: 6, Rate: 12, FinalAmount: 720, Delivered: true, DeliveryNo: 7},
	}
	if err := WriteOrderReport(path, rows); err != nil {
		t.Fatalf("WriteOrderReport: %v", err)
	}

	f, err := excelize.OpenFile(path)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer f.Close()

	if got := f.GetSheetList(); len(got) != 1 || got[0] != "Sales Report" {
		t.Fatalf("sheets = %v, want [Sales Report]", got)
	}

	cell := func(ref string) string {
		v, err := f.GetCellValue("Sales Report", ref)
		if err != nil {
			t.Fatalf("GetCellValue %s: %v", ref, err)
		}
		return v
	}
	wantHeaders := []string{"Date", "Customer", "City", "Company", "Item", "Pack Size", "GST %", "HSN", "Qty", "Rate", "Final Amount", "Delivered?", "Delivery #"}
	for i, h := range wantHeaders {
		ref, _ := excelize.CoordinatesToCellName(i+1, 1)
		if got := cell(ref); got != h {
			t.Errorf("header %s = %q, want %q", ref, got, h)
		}
	}
	if got := cell("D2"); got != "Prayagh" {
		t.Errorf("D2 company = %q, want Prayagh", got)
	}
	if got := cell("D3"); got != "Acme" {
		t.Errorf("D3 company = %q, want Acme", got)
	}
	if got := cell("E2"); got != "Eclair" {
		t.Errorf("E2 item = %q, want Eclair", got)
	}

	// Totals row (row 4): label under Item (E), sums under Qty (I) and Final Amount (K).
	if got := cell("E4"); got != "Totals" {
		t.Errorf("E4 = %q, want Totals", got)
	}
	if got := cell("I4"); got != "10" {
		t.Errorf("Qty total I4 = %q, want 10", got)
	}
	if got := cell("K4"); got != "1,120.00" {
		t.Errorf("Final Amount total K4 = %q, want 1,120.00", got)
	}
}
