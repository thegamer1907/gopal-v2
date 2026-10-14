package reports

import (
	"path/filepath"
	"testing"

	"github.com/xuri/excelize/v2"
)

func TestWriteStockReportColumns(t *testing.T) {
	path := filepath.Join(t.TempDir(), "stock.xlsx")
	rows := []StockReportRow{{
		CompanyName: "Acme", ItemName: "Soap", PackSize: 10, HSN: 3401, GSTPercent: 18,
		Quantity: 5, FinalRate: 12.5, BillingRate: 100, ProfitLoss: 625, GSTValue: 500,
	}}
	if err := WriteStockReport(path, "13-Oct-26", rows); err != nil {
		t.Fatal(err)
	}
	f, err := excelize.OpenFile(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	wantHeaders := []string{"Company", "Item", "Pack Size", "HSN", "GST %", "Quantity", "Final Rate", "Billing Rate", "P&L", "GST Value"}
	for i, h := range wantHeaders {
		cell, _ := excelize.CoordinatesToCellName(i+1, 2)
		if got, _ := f.GetCellValue(stockSheetName, cell); got != h {
			t.Errorf("header %s = %q, want %q", cell, got, h)
		}
	}
	// Totals row sits directly under the data and sums only P&L and GST Value.
	for cell, want := range map[string]string{"B4": "Totals", "I4": "625.00", "J4": "500.00", "F4": "5"} {
		if got, _ := f.GetCellValue(stockSheetName, cell); got != want {
			t.Errorf("totals %s = %q, want %q", cell, got, want)
		}
	}
	// GST % must be a real percentage cell (0.18 under "0%"), like the other reports.
	if raw, _ := f.GetCellValue(stockSheetName, "E3", excelize.Options{RawCellValue: true}); raw != "0.18" {
		t.Errorf("GST raw value = %q, want 0.18", raw)
	}
	wantRow := []string{"Acme", "Soap", "10", "3401", "18%", "5", "12.50", "100.00", "625.00", "500.00"}
	for i, v := range wantRow {
		cell, _ := excelize.CoordinatesToCellName(i+1, 3)
		if got, _ := f.GetCellValue(stockSheetName, cell); got != v {
			t.Errorf("cell %s = %q, want %q", cell, got, v)
		}
	}
}

func TestStockColWidthsFitData(t *testing.T) {
	rows := []StockReportRow{
		{CompanyName: "Favorite Foods Co. (P)", ItemName: "Car Pop - 24 Box", PackSize: 24, HSN: 170490, GSTPercent: 5,
			Quantity: 100, FinalRate: 172.59, BillingRate: 3945, ProfitLoss: 20893583.9, GSTValue: 1985351.04},
	}
	w := stockColWidths(rows)
	if want := float64(len("Favorite Foods Co. (P)")) + 2; w[colSRCompany-1] != want {
		t.Errorf("company width = %v, want %v", w[colSRCompany-1], want)
	}
	// "20,893,583.90" (13) + bold (1) + padding (2)
	if w[colSRProfitLoss-1] < 16 {
		t.Errorf("P&L width = %v, want >= 16", w[colSRProfitLoss-1])
	}
	if w[colSRGSTPercent-1] >= 14 {
		t.Errorf("GST %% width = %v, should shrink below the old fixed 14", w[colSRGSTPercent-1])
	}
	if got := formatThousands(1234567.5); got != "1,234,567.50" {
		t.Errorf("formatThousands = %q", got)
	}
	if got := formatThousands(-999.5); got != "-999.50" {
		t.Errorf("formatThousands = %q", got)
	}
}
