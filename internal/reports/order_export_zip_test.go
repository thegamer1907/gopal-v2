package reports

import (
	"archive/zip"
	"bytes"
	"io"
	"path/filepath"
	"testing"

	"github.com/signintech/gopdf"
	"github.com/xuri/excelize/v2"
)

func sampleEntry(name, item string) DeliveredOrderExcelEntry {
	return DeliveredOrderExcelEntry{
		Filename: name,
		Header:   OrderExportHeader{CustomerLabel: "Ravi - Pune", Date: "13-Oct-26"},
		Rows:     []OrderExportRow{{Qty: 2, ItemName: item, PackSize: 10, Rate: 5, FinalAmount: 100}},
	}
}

func TestWriteOrderExcelsZip(t *testing.T) {
	dir := t.TempDir()
	zipPath := filepath.Join(dir, "out.zip")
	entries := []DeliveredOrderExcelEntry{
		sampleEntry("001 Ravi 13-Oct-26.xlsx", "Soap"),
		sampleEntry("002 Ravi 13-Oct-26.xlsx", "Oil"),
		sampleEntry("002 Ravi 13-Oct-26.xlsx", "Tea"), // duplicate name
	}
	if err := WriteOrderExcelsZip(zipPath, entries); err != nil {
		t.Fatal(err)
	}

	zr, err := zip.OpenReader(zipPath)
	if err != nil {
		t.Fatal(err)
	}
	defer zr.Close()
	want := []string{"001 Ravi 13-Oct-26.xlsx", "002 Ravi 13-Oct-26.xlsx", "002 Ravi 13-Oct-26 (2).xlsx"}
	if len(zr.File) != len(want) {
		t.Fatalf("got %d members, want %d", len(zr.File), len(want))
	}
	for i, zf := range zr.File {
		if zf.Name != want[i] {
			t.Errorf("member %d = %q, want %q", i, zf.Name, want[i])
		}
		rc, _ := zf.Open()
		data, _ := io.ReadAll(rc)
		rc.Close()
		xf, err := excelize.OpenReader(bytes.NewReader(data))
		if err != nil {
			t.Fatalf("%s: %v", zf.Name, err)
		}
		cell, _ := xf.GetCellValue(orderSheetName, "B3")
		xf.Close()
		if wantItem := entries[i].Rows[0].ItemName; cell != wantItem {
			t.Errorf("%s: B3 = %q, want %q", zf.Name, cell, wantItem)
		}
	}
}

func TestFitDeliveredOrdersColsAndPDF(t *testing.T) {
	long := DeliveredOrdersPrintEntry{DeliveryNo: 7, Header: OrderExportHeader{CustomerLabel: "Ravi - Pune", Date: "13-Oct-26"},
		Rows: []OrderExportRow{{Qty: 1, ItemName: "A very long item name for width testing purposes", PackSize: 1, Rate: 1, FinalAmount: 1}}}
	short := DeliveredOrdersPrintEntry{DeliveryNo: 8, Header: long.Header,
		Rows: []OrderExportRow{{Qty: 1, ItemName: "Tea", PackSize: 1, Rate: 1, FinalAmount: 1}}}

	dir := t.TempDir()
	if err := WriteDeliveredOrdersPDF(filepath.Join(dir, "a.pdf"), []DeliveredOrdersPrintEntry{short}); err != nil {
		t.Fatal(err)
	}
	if err := WriteDeliveredOrdersPDF(filepath.Join(dir, "b.pdf"), []DeliveredOrdersPrintEntry{long, short}); err != nil {
		t.Fatal(err)
	}
}

func TestFitDeliveredOrdersColsShrinksToLongestItem(t *testing.T) {
	pdf := newTestPDF(t)
	mk := func(item string) []DeliveredOrdersPrintEntry {
		return []DeliveredOrdersPrintEntry{{DeliveryNo: 1, Header: OrderExportHeader{CustomerLabel: "Ravi - Pune", Date: "13-Oct-26"},
			Rows: []OrderExportRow{{ItemName: item}}}}
	}
	short, err := fitDeliveredOrdersCols(pdf, mk("Tea"))
	if err != nil {
		t.Fatal(err)
	}
	long, err := fitDeliveredOrdersCols(pdf, mk("A very long item name for width testing"))
	if err != nil {
		t.Fatal(err)
	}
	if !(short[1] < long[1] && long[1] < pdfColWidths[1]) {
		t.Errorf("item widths short=%v long=%v default=%v: want short < long < default", short[1], long[1], pdfColWidths[1])
	}
	if short[0] != pdfColWidths[0] || short[4] != pdfColWidths[4] {
		t.Error("only the Item column should change")
	}
}

func newTestPDF(t *testing.T) *gopdf.GoPdf {
	t.Helper()
	pdf := &gopdf.GoPdf{}
	pdf.Start(gopdf.Config{PageSize: *gopdf.PageSizeA4})
	pdf.AddPage()
	if err := pdf.AddTTFFontData("Nunito", nunitoRegularTTF); err != nil {
		t.Fatal(err)
	}
	if err := pdf.AddTTFFontDataWithOption("Nunito", nunitoBoldTTF, gopdf.TtfOption{Style: gopdf.Bold}); err != nil {
		t.Fatal(err)
	}
	return pdf
}
