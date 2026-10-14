package reports

import (
	"fmt"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/xuri/excelize/v2"
)

// StockReportRow is one item's quantity as of a chosen date, fully computed by the caller
// (see Reports.tsx's computeStockRows, which sums purchase/sale lines up to the cutoff
// date — see docs/DECISIONS.md for why that math happens in the frontend, not SQL).
type StockReportRow struct {
	CompanyName string  `json:"companyName"`
	ItemName    string  `json:"itemName"`
	PackSize    float64 `json:"packSize"`
	HSN         int64   `json:"hsn"`
	GSTPercent  float64 `json:"gstPercent"`
	Quantity    float64 `json:"quantity"`
	// FinalRate/BillingRate come from the item's latest purchase-bill line on or before
	// the as-of date; ProfitLoss = PackSize × Quantity × FinalRate and
	// GSTValue = Quantity × BillingRate (as specified by the client) — all computed by
	// the caller, never here.
	FinalRate   float64 `json:"finalRate"`
	BillingRate float64 `json:"billingRate"`
	ProfitLoss  float64 `json:"profitLoss"`
	GSTValue    float64 `json:"gstValue"`
}

const stockSheetName = "Stock Report"

// Column layout (1-based). Keep in sync with the header/style setup below.
const (
	colSRCompany = iota + 1
	colSRItem
	colSRPackSize
	colSRHSN
	colSRGSTPercent
	colSRQuantity
	colSRFinalRate
	colSRBillingRate
	colSRProfitLoss
	colSRGSTValue
	colSRCount = colSRGSTValue
)

var stockHeaders = [colSRCount]string{
	colSRCompany - 1:     "Company",
	colSRItem - 1:        "Item",
	colSRPackSize - 1:    "Pack Size",
	colSRHSN - 1:         "HSN",
	colSRGSTPercent - 1:  "GST %",
	colSRQuantity - 1:    "Quantity",
	colSRFinalRate - 1:   "Final Rate",
	colSRBillingRate - 1: "Billing Rate",
	colSRProfitLoss - 1:  "P&L",
	colSRGSTValue - 1:    "GST Value",
}

// WriteStockReport writes rows to a new "Stock Report" workbook at path: a merged title
// row naming the as-of date (there's no per-row date column to convey this otherwise),
// a bold header, a frozen + auto-filtered header row, and a bold Totals row summing Quantity,
// P&L and GST Value.
func WriteStockReport(path string, asOfDate string, rows []StockReportRow) error {
	f := excelize.NewFile()
	defer f.Close()

	if _, err := f.NewSheet(stockSheetName); err != nil {
		return fmt.Errorf("create sheet: %w", err)
	}
	if err := f.DeleteSheet("Sheet1"); err != nil {
		return fmt.Errorf("delete default sheet: %w", err)
	}
	idx, err := f.GetSheetIndex(stockSheetName)
	if err != nil {
		return fmt.Errorf("sheet index: %w", err)
	}
	f.SetActiveSheet(idx)

	// Column styles must be applied before the header/title rows are styled: a
	// column-wide style (SetColStyle) overrides any per-cell style already on that
	// column, so writing it last would silently strip the header's bold formatting.
	if err := applyStockColumnStyles(f); err != nil {
		return err
	}
	if err := writeStockTitle(f, asOfDate); err != nil {
		return err
	}
	if err := writeStockHeader(f); err != nil {
		return err
	}
	lastDataRow, err := writeStockRows(f, rows)
	if err != nil {
		return err
	}
	if err := writeStockTotals(f, rows, lastDataRow+1); err != nil {
		return err
	}
	if err := finishStockLayout(f, rows, lastDataRow); err != nil {
		return err
	}

	if err := f.SaveAs(path); err != nil {
		return fmt.Errorf("save %q: %w", path, err)
	}
	return nil
}

func applyStockColumnStyles(f *excelize.File) error {
	qtyFmt := "0"
	qtyStyle, err := f.NewStyle(&excelize.Style{CustomNumFmt: &qtyFmt, Alignment: center})
	if err != nil {
		return fmt.Errorf("qty style: %w", err)
	}
	if err := applyColStyleOn(f, stockSheetName, []int{colSRPackSize, colSRHSN, colSRQuantity}, qtyStyle); err != nil {
		return err
	}
	// Written as a fraction (0.05) under a real Excel Percentage format, matching the
	// Purchase Summary / Order Report GST % columns.
	gstFmt := "0%"
	gstStyle, err := f.NewStyle(&excelize.Style{CustomNumFmt: &gstFmt, Alignment: center})
	if err != nil {
		return fmt.Errorf("gst style: %w", err)
	}
	if err := applyColStyleOn(f, stockSheetName, []int{colSRGSTPercent}, gstStyle); err != nil {
		return err
	}
	moneyFmt := "#,##0.00"
	moneyStyle, err := f.NewStyle(&excelize.Style{CustomNumFmt: &moneyFmt})
	if err != nil {
		return fmt.Errorf("money style: %w", err)
	}
	return applyColStyleOn(f, stockSheetName, []int{colSRFinalRate, colSRBillingRate, colSRProfitLoss, colSRGSTValue}, moneyStyle)
}

// applyColStyleOn mirrors applyColStyle in purchase_summary.go but is parameterized by
// sheet name, since this package now writes to more than one sheet name.
func applyColStyleOn(f *excelize.File, sheet string, cols []int, styleID int) error {
	for _, c := range cols {
		letter, err := excelize.ColumnNumberToName(c)
		if err != nil {
			return err
		}
		if err := f.SetColStyle(sheet, letter, styleID); err != nil {
			return err
		}
	}
	return nil
}

func writeStockTitle(f *excelize.File, asOfDate string) error {
	lastCol, err := excelize.ColumnNumberToName(colSRCount)
	if err != nil {
		return err
	}
	lastCell := lastCol + "1"
	if err := f.MergeCell(stockSheetName, "A1", lastCell); err != nil {
		return fmt.Errorf("merge title: %w", err)
	}
	if err := f.SetCellValue(stockSheetName, "A1", "Stock Report — as of "+asOfDate); err != nil {
		return err
	}
	titleStyle, err := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true},
		Alignment: &excelize.Alignment{Horizontal: "center"},
	})
	if err != nil {
		return fmt.Errorf("title style: %w", err)
	}
	return f.SetCellStyle(stockSheetName, "A1", lastCell, titleStyle)
}

func writeStockHeader(f *excelize.File) error {
	boldStyle, err := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}})
	if err != nil {
		return fmt.Errorf("header style: %w", err)
	}
	for i, h := range stockHeaders {
		cell, err := excelize.CoordinatesToCellName(i+1, 2)
		if err != nil {
			return err
		}
		if err := f.SetCellValue(stockSheetName, cell, h); err != nil {
			return err
		}
	}
	last, err := excelize.CoordinatesToCellName(colSRCount, 2)
	if err != nil {
		return err
	}
	if err := f.SetCellStyle(stockSheetName, "A2", last, boldStyle); err != nil {
		return err
	}
	return centerHeaderCells(f, stockSheetName, 2, []int{colSRPackSize, colSRHSN, colSRGSTPercent, colSRQuantity})
}

// writeStockRows writes one row per item, starting at sheet row 3 (row 1 is the title,
// row 2 the header), and returns the last row written (for the autofilter range).
func writeStockRows(f *excelize.File, rows []StockReportRow) (int, error) {
	for i, r := range rows {
		row := i + 3
		values := make([]interface{}, colSRCount)
		values[colSRCompany-1] = r.CompanyName
		values[colSRItem-1] = r.ItemName
		values[colSRPackSize-1] = r.PackSize
		values[colSRHSN-1] = r.HSN
		values[colSRGSTPercent-1] = r.GSTPercent / 100
		values[colSRQuantity-1] = r.Quantity
		values[colSRFinalRate-1] = r.FinalRate
		values[colSRBillingRate-1] = r.BillingRate
		values[colSRProfitLoss-1] = r.ProfitLoss
		values[colSRGSTValue-1] = r.GSTValue

		for c, v := range values {
			cell, err := excelize.CoordinatesToCellName(c+1, row)
			if err != nil {
				return 0, err
			}
			if err := f.SetCellValue(stockSheetName, cell, v); err != nil {
				return 0, fmt.Errorf("write row %d: %w", row, err)
			}
		}
	}
	if len(rows) == 0 {
		return 2, nil
	}
	return len(rows) + 2, nil
}

// writeStockTotals writes a bold "Totals" row directly under the data (outside the
// autofilter range, so sorting/filtering never moves it) summing Quantity, P&L and GST
// Value. Rates and pack sizes aren't totaled.
func writeStockTotals(f *excelize.File, rows []StockReportRow, totalsRow int) error {
	var quantity, profitLoss, gstValue float64
	for _, r := range rows {
		quantity += r.Quantity
		profitLoss += r.ProfitLoss
		gstValue += r.GSTValue
	}

	boldStyle, err := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}})
	if err != nil {
		return fmt.Errorf("totals style: %w", err)
	}
	first, err := excelize.CoordinatesToCellName(1, totalsRow)
	if err != nil {
		return err
	}
	last, err := excelize.CoordinatesToCellName(colSRCount, totalsRow)
	if err != nil {
		return err
	}
	if err := f.SetCellStyle(stockSheetName, first, last, boldStyle); err != nil {
		return err
	}
	if err := setStockCell(f, colSRItem, totalsRow, "Totals", boldStyle); err != nil {
		return err
	}

	qtyFmt := "0"
	boldQtyStyle, err := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}, CustomNumFmt: &qtyFmt, Alignment: center})
	if err != nil {
		return fmt.Errorf("totals qty style: %w", err)
	}
	if err := setStockCell(f, colSRQuantity, totalsRow, quantity, boldQtyStyle); err != nil {
		return err
	}

	moneyFmt := "#,##0.00"
	boldMoneyStyle, err := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}, CustomNumFmt: &moneyFmt})
	if err != nil {
		return fmt.Errorf("totals money style: %w", err)
	}
	if err := setStockCell(f, colSRProfitLoss, totalsRow, profitLoss, boldMoneyStyle); err != nil {
		return err
	}
	return setStockCell(f, colSRGSTValue, totalsRow, gstValue, boldMoneyStyle)
}

func setStockCell(f *excelize.File, col, row int, value interface{}, styleID int) error {
	cell, err := excelize.CoordinatesToCellName(col, row)
	if err != nil {
		return err
	}
	if err := f.SetCellValue(stockSheetName, cell, value); err != nil {
		return err
	}
	return f.SetCellStyle(stockSheetName, cell, cell, styleID)
}

// stockColWidths sizes each column to its widest displayed text — header (plus room for
// the autofilter's dropdown arrow), every data cell and the bold Totals row — as Excel
// would render it (money in "#,##0.00" with thousands separators, GST % as "5%"), plus a
// little padding. Excel has no auto-fit on write, so the width is estimated from the text.
func stockColWidths(rows []StockReportRow) [colSRCount]float64 {
	widest := [colSRCount]int{}
	note := func(col int, text string, extra int) {
		if n := utf8.RuneCountInString(text) + extra; n > widest[col-1] {
			widest[col-1] = n
		}
	}
	for i, h := range stockHeaders {
		note(i+1, h, 3) // autofilter arrow
	}

	var quantity, profitLoss, gstValue float64
	for _, r := range rows {
		note(colSRCompany, r.CompanyName, 0)
		note(colSRItem, r.ItemName, 0)
		note(colSRPackSize, strconv.FormatFloat(r.PackSize, 'f', -1, 64), 0)
		note(colSRHSN, strconv.FormatInt(r.HSN, 10), 0)
		note(colSRGSTPercent, strconv.FormatFloat(r.GSTPercent, 'f', 0, 64)+"%", 0)
		note(colSRQuantity, strconv.FormatFloat(r.Quantity, 'f', 0, 64), 0)
		note(colSRFinalRate, formatThousands(r.FinalRate), 0)
		note(colSRBillingRate, formatThousands(r.BillingRate), 0)
		note(colSRProfitLoss, formatThousands(r.ProfitLoss), 0)
		note(colSRGSTValue, formatThousands(r.GSTValue), 0)
		quantity += r.Quantity
		profitLoss += r.ProfitLoss
		gstValue += r.GSTValue
	}
	// Totals row is bold (wider glyphs), so give it an extra character.
	note(colSRItem, "Totals", 1)
	note(colSRQuantity, strconv.FormatFloat(quantity, 'f', 0, 64), 1)
	note(colSRProfitLoss, formatThousands(profitLoss), 1)
	note(colSRGSTValue, formatThousands(gstValue), 1)

	var widths [colSRCount]float64
	for i, n := range widest {
		widths[i] = float64(n) + 2 // padding
	}
	return widths
}

// formatThousands renders n like Excel's "#,##0.00" (Western 3-digit grouping).
func formatThousands(n float64) string {
	neg := n < 0
	if neg {
		n = -n
	}
	s := strconv.FormatFloat(n, 'f', 2, 64)
	intPart, frac, _ := strings.Cut(s, ".")
	var b strings.Builder
	for i, c := range intPart {
		if i > 0 && (len(intPart)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(c)
	}
	out := b.String() + "." + frac
	if neg {
		out = "-" + out
	}
	return out
}

func finishStockLayout(f *excelize.File, rows []StockReportRow, lastDataRow int) error {
	lastCol, err := excelize.ColumnNumberToName(colSRCount)
	if err != nil {
		return err
	}
	for i, w := range stockColWidths(rows) {
		letter, err := excelize.ColumnNumberToName(i + 1)
		if err != nil {
			return err
		}
		if err := f.SetColWidth(stockSheetName, letter, letter, w); err != nil {
			return err
		}
	}

	if err := f.SetPanes(stockSheetName, &excelize.Panes{
		Freeze:      true,
		Split:       false,
		XSplit:      0,
		YSplit:      2,
		TopLeftCell: "A3",
		ActivePane:  "bottomLeft",
	}); err != nil {
		return fmt.Errorf("freeze header: %w", err)
	}

	headerRange := fmt.Sprintf("A2:%s%d", lastCol, lastDataRow)
	if err := f.AutoFilter(stockSheetName, headerRange, nil); err != nil {
		return fmt.Errorf("autofilter: %w", err)
	}
	return nil
}
