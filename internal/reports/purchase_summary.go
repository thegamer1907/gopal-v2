// Package reports builds downloadable report files (Reports page). Report math is
// never re-derived here — callers (the frontend, via lib/purchaseBill.ts) compute every
// value; this package only lays finished rows out into a formatted workbook.
package reports

import (
	"fmt"
	"time"

	"github.com/xuri/excelize/v2"
)

// PurchaseSummaryRow is one purchase-bill line, fully computed by the caller (see
// calcLine in frontend/src/lib/purchaseBill.ts — the single source of truth for these
// formulas).
type PurchaseSummaryRow struct {
	Date          string  `json:"date"` // dd-mmm-yyyy, as stored/displayed
	CompanyName   string  `json:"companyName"`
	BillNumber    string  `json:"billNumber"`
	ItemName      string  `json:"itemName"`
	HSN           int64   `json:"hsn"`
	PackSize      float64 `json:"packSize"`
	TaxQty        float64 `json:"taxQty"`
	TaxValue      float64 `json:"taxValue"`
	DQty          float64 `json:"dQty"`
	DValue        float64 `json:"dValue"`
	GSTPercent    float64 `json:"gstPercent"`
	GSTAmount     float64 `json:"gstAmount"`
	TaxBillAmount float64 `json:"taxBillAmount"`
	BillValue     float64 `json:"billValue"`
	BillingRate   float64 `json:"billingRate"`
	FinalRate     float64 `json:"finalRate"`
	Discount      float64 `json:"discount"`
	Remarks       string  `json:"remarks"`
}

const sheetName = "Purchase Summary"

// Column layout (1-based). Keep in sync with the header/style setup below.
const (
	colDate = iota + 1
	colCompany
	colBillNumber
	colItem
	colHSN
	colPackSize
	colTaxQty
	colTaxValue
	colDQty
	colDValue
	colGSTPercent
	colGSTAmount
	colTaxBillAmount
	colBillValue
	colBillingRate
	colFinalRate
	colDiscount
	colRemarks
	colCount = colRemarks
)

var headers = [colCount]string{
	colDate - 1:          "Date",
	colCompany - 1:       "Company",
	colBillNumber - 1:    "Bill No.",
	colItem - 1:          "Item",
	colHSN - 1:           "HSN",
	colPackSize - 1:      "Pack Size",
	colTaxQty - 1:        "Tax Qty",
	colTaxValue - 1:      "Tax Value",
	colDQty - 1:          "D Qty",
	colDValue - 1:        "D Value",
	colGSTPercent - 1:    "GST %",
	colGSTAmount - 1:     "GST Amount",
	colTaxBillAmount - 1: "Tax Bill Amount",
	colBillValue - 1:     "Bill Value",
	colBillingRate - 1:   "Billing Rate",
	colFinalRate - 1:     "Final Rate",
	colDiscount - 1:      "Discount",
	colRemarks - 1:       "Remarks",
}

// moneyCols get a 2-decimal, thousands-separated format; qtyCols get plain 2 decimals
// (no separator) — the "accounting-style" formatting agreed for the Reports feature.
var moneyCols = []int{colTaxValue, colDValue, colGSTAmount, colTaxBillAmount, colBillValue, colBillingRate, colFinalRate, colDiscount}
var qtyCols = []int{colPackSize, colTaxQty, colDQty, colGSTPercent}

// WritePurchaseSummary writes rows to a new "Purchase Summary" workbook at path: a bold
// header, real typed date/number cells (not text) with the agreed formats, a frozen +
// auto-filtered header row, and a bold Totals row — mirroring the footer Totals row on
// the Add/View Bill line-items grid.
func WritePurchaseSummary(path string, rows []PurchaseSummaryRow) error {
	f := excelize.NewFile()
	defer f.Close()

	if _, err := f.NewSheet(sheetName); err != nil {
		return fmt.Errorf("create sheet: %w", err)
	}
	if err := f.DeleteSheet("Sheet1"); err != nil {
		return fmt.Errorf("delete default sheet: %w", err)
	}
	idx, err := f.GetSheetIndex(sheetName)
	if err != nil {
		return fmt.Errorf("sheet index: %w", err)
	}
	f.SetActiveSheet(idx)

	// Column styles must be applied before the header/totals rows are styled: a
	// column-wide style (SetColStyle) overrides any per-cell style already on that
	// column, so writing it last would silently strip the header's bold formatting.
	if err := applyColumnStyles(f); err != nil {
		return err
	}
	if err := writeHeader(f); err != nil {
		return err
	}
	totalsRow, err := writeRows(f, rows)
	if err != nil {
		return err
	}
	if err := writeTotals(f, rows, totalsRow); err != nil {
		return err
	}
	if err := finishLayout(f, totalsRow); err != nil {
		return err
	}

	if err := f.SaveAs(path); err != nil {
		return fmt.Errorf("save %q: %w", path, err)
	}
	return nil
}

func writeHeader(f *excelize.File) error {
	boldStyle, err := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}})
	if err != nil {
		return fmt.Errorf("header style: %w", err)
	}
	for i, h := range headers {
		cell, err := excelize.CoordinatesToCellName(i+1, 1)
		if err != nil {
			return err
		}
		if err := f.SetCellValue(sheetName, cell, h); err != nil {
			return err
		}
	}
	last, err := excelize.CoordinatesToCellName(colCount, 1)
	if err != nil {
		return err
	}
	return f.SetCellStyle(sheetName, "A1", last, boldStyle)
}

func applyColumnStyles(f *excelize.File) error {
	dateFmt := "dd-mmm-yyyy"
	dateStyle, err := f.NewStyle(&excelize.Style{CustomNumFmt: &dateFmt})
	if err != nil {
		return fmt.Errorf("date style: %w", err)
	}
	dateCol, err := excelize.ColumnNumberToName(colDate)
	if err != nil {
		return err
	}
	if err := f.SetColStyle(sheetName, dateCol, dateStyle); err != nil {
		return err
	}

	moneyFmt := "#,##0.00"
	moneyStyle, err := f.NewStyle(&excelize.Style{CustomNumFmt: &moneyFmt})
	if err != nil {
		return fmt.Errorf("money style: %w", err)
	}
	if err := applyColStyle(f, moneyCols, moneyStyle); err != nil {
		return err
	}

	qtyFmt := "0.00"
	qtyStyle, err := f.NewStyle(&excelize.Style{CustomNumFmt: &qtyFmt})
	if err != nil {
		return fmt.Errorf("qty style: %w", err)
	}
	if err := applyColStyle(f, qtyCols, qtyStyle); err != nil {
		return err
	}

	hsnFmt := "0"
	hsnStyle, err := f.NewStyle(&excelize.Style{CustomNumFmt: &hsnFmt})
	if err != nil {
		return fmt.Errorf("hsn style: %w", err)
	}
	hsnCol, err := excelize.ColumnNumberToName(colHSN)
	if err != nil {
		return err
	}
	return f.SetColStyle(sheetName, hsnCol, hsnStyle)
}

func applyColStyle(f *excelize.File, cols []int, styleID int) error {
	for _, c := range cols {
		letter, err := excelize.ColumnNumberToName(c)
		if err != nil {
			return err
		}
		if err := f.SetColStyle(sheetName, letter, styleID); err != nil {
			return err
		}
	}
	return nil
}

// writeRows writes one row per line item, starting at sheet row 2, and returns the row
// number the Totals row should occupy.
func writeRows(f *excelize.File, rows []PurchaseSummaryRow) (int, error) {
	for i, r := range rows {
		row := i + 2
		values := make([]interface{}, colCount)
		values[colDate-1] = dateValue(r.Date)
		values[colCompany-1] = r.CompanyName
		values[colBillNumber-1] = r.BillNumber
		values[colItem-1] = r.ItemName
		values[colHSN-1] = r.HSN
		values[colPackSize-1] = r.PackSize
		values[colTaxQty-1] = r.TaxQty
		values[colTaxValue-1] = r.TaxValue
		values[colDQty-1] = r.DQty
		values[colDValue-1] = r.DValue
		values[colGSTPercent-1] = r.GSTPercent
		values[colGSTAmount-1] = r.GSTAmount
		values[colTaxBillAmount-1] = r.TaxBillAmount
		values[colBillValue-1] = r.BillValue
		values[colBillingRate-1] = r.BillingRate
		values[colFinalRate-1] = r.FinalRate
		values[colDiscount-1] = r.Discount
		values[colRemarks-1] = r.Remarks

		for c, v := range values {
			cell, err := excelize.CoordinatesToCellName(c+1, row)
			if err != nil {
				return 0, err
			}
			if err := f.SetCellValue(sheetName, cell, v); err != nil {
				return 0, fmt.Errorf("write row %d: %w", row, err)
			}
		}
	}
	return len(rows) + 2, nil
}

// dateValue parses a dd-mmm-yyyy string into a time.Time for a real Excel date cell.
// An unparseable date (shouldn't happen for saved bills) falls back to the zero value
// rather than failing the whole export.
func dateValue(s string) time.Time {
	t, err := time.Parse("02-Jan-2006", s)
	if err != nil {
		return time.Time{}
	}
	return t
}

// writeTotals sums the money/quantity columns and writes them as a bold row. The
// numeric total cells get a combined bold+numFmt style (not plain bold) so they keep
// the same accounting format as the data above them, rather than reverting to General.
func writeTotals(f *excelize.File, rows []PurchaseSummaryRow, totalsRow int) error {
	var taxQty, taxValue, dQty, dValue, gstAmount, taxBillAmount, billValue, discount float64
	for _, r := range rows {
		taxQty += r.TaxQty
		taxValue += r.TaxValue
		dQty += r.DQty
		dValue += r.DValue
		gstAmount += r.GSTAmount
		taxBillAmount += r.TaxBillAmount
		billValue += r.BillValue
		discount += r.Discount
	}

	boldStyle, err := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}})
	if err != nil {
		return fmt.Errorf("totals style: %w", err)
	}
	first, err := excelize.CoordinatesToCellName(1, totalsRow)
	if err != nil {
		return err
	}
	last, err := excelize.CoordinatesToCellName(colCount, totalsRow)
	if err != nil {
		return err
	}
	if err := f.SetCellStyle(sheetName, first, last, boldStyle); err != nil {
		return err
	}

	label, err := excelize.CoordinatesToCellName(colItem, totalsRow)
	if err != nil {
		return err
	}
	if err := f.SetCellValue(sheetName, label, "Totals"); err != nil {
		return err
	}

	moneyFmt := "#,##0.00"
	boldMoneyStyle, err := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}, CustomNumFmt: &moneyFmt})
	if err != nil {
		return fmt.Errorf("totals money style: %w", err)
	}
	moneyTotals := map[int]float64{
		colTaxValue:      taxValue,
		colDValue:        dValue,
		colGSTAmount:     gstAmount,
		colTaxBillAmount: taxBillAmount,
		colBillValue:     billValue,
		colDiscount:      discount,
	}
	for col, v := range moneyTotals {
		if err := setStyledCell(f, col, totalsRow, v, boldMoneyStyle); err != nil {
			return err
		}
	}

	qtyFmt := "0.00"
	boldQtyStyle, err := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}, CustomNumFmt: &qtyFmt})
	if err != nil {
		return fmt.Errorf("totals qty style: %w", err)
	}
	qtyTotals := map[int]float64{
		colTaxQty: taxQty,
		colDQty:   dQty,
	}
	for col, v := range qtyTotals {
		if err := setStyledCell(f, col, totalsRow, v, boldQtyStyle); err != nil {
			return err
		}
	}

	return nil
}

func setStyledCell(f *excelize.File, col, row int, value interface{}, styleID int) error {
	cell, err := excelize.CoordinatesToCellName(col, row)
	if err != nil {
		return err
	}
	if err := f.SetCellValue(sheetName, cell, value); err != nil {
		return err
	}
	return f.SetCellStyle(sheetName, cell, cell, styleID)
}

func finishLayout(f *excelize.File, totalsRow int) error {
	lastCol, err := excelize.ColumnNumberToName(colCount)
	if err != nil {
		return err
	}
	if err := f.SetColWidth(sheetName, "A", lastCol, 14); err != nil {
		return err
	}
	if err := f.SetColWidth(sheetName, "D", "D", 22); err != nil { // Item name, wider
		return err
	}
	if err := f.SetColWidth(sheetName, "R", "R", 24); err != nil { // Remarks, wider
		return err
	}

	if err := f.SetPanes(sheetName, &excelize.Panes{
		Freeze:      true,
		Split:       false,
		XSplit:      0,
		YSplit:      1,
		TopLeftCell: "A2",
		ActivePane:  "bottomLeft",
	}); err != nil {
		return fmt.Errorf("freeze header: %w", err)
	}

	headerRange := fmt.Sprintf("A1:%s%d", lastCol, totalsRow-1)
	if err := f.AutoFilter(sheetName, headerRange, nil); err != nil {
		return fmt.Errorf("autofilter: %w", err)
	}
	return nil
}
