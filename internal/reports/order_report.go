package reports

import (
	"fmt"
	"time"

	"github.com/xuri/excelize/v2"
)

// OrderReportRow is one sales-order line, fully computed by the caller (see
// toOrderReportRows in Reports.tsx — reuses calcOrderLine/effectivePackSize from
// lib/salesOrder.ts, the single source of truth for Final Amount).
type OrderReportRow struct {
	Date         string  `json:"date"` // dd-mmm-yy, as displayed
	CustomerName string  `json:"customerName"`
	CustomerCity string  `json:"customerCity"`
	ItemName     string  `json:"itemName"`
	PackSize     float64 `json:"packSize"`
	GSTPercent   float64 `json:"gstPercent"`
	HSN          int64   `json:"hsn"`
	Qty          float64 `json:"qty"`
	Rate         float64 `json:"rate"`
	FinalAmount  float64 `json:"finalAmount"`
	Delivered    bool    `json:"delivered"`
	DeliveryNo   int64   `json:"deliveryNo"`
}

const orderReportSheetName = "Order Report"

// Column layout (1-based). Keep in sync with the header/style setup below.
const (
	colORDate = iota + 1
	colORCustomer
	colORCity
	colORItem
	colORPackSize
	colORGST
	colORHSN
	colORQty
	colORRate
	colORAmount
	colORDelivered
	colORDeliveryNo
	colORCount = colORDeliveryNo
)

var orderReportHeaders = [colORCount]string{
	colORDate - 1:       "Date",
	colORCustomer - 1:   "Customer",
	colORCity - 1:       "City",
	colORItem - 1:       "Item",
	colORPackSize - 1:   "Pack Size",
	colORGST - 1:        "GST %",
	colORHSN - 1:        "HSN",
	colORQty - 1:        "Qty",
	colORRate - 1:       "Rate",
	colORAmount - 1:     "Final Amount",
	colORDelivered - 1:  "Delivered?",
	colORDeliveryNo - 1: "Delivery #",
}

var orderReportMoneyCols = []int{colORRate, colORAmount}
var orderReportQtyCols = []int{colORPackSize, colORQty}

// WriteOrderReport writes rows to a new "Order Report" workbook at path: a bold header,
// real typed date/number cells, a frozen + auto-filtered header row, and a bold Totals
// row summing only Qty and Final Amount — mirroring the on-screen order Totals row.
func WriteOrderReport(path string, rows []OrderReportRow) error {
	f := excelize.NewFile()
	defer f.Close()

	if _, err := f.NewSheet(orderReportSheetName); err != nil {
		return fmt.Errorf("create sheet: %w", err)
	}
	if err := f.DeleteSheet("Sheet1"); err != nil {
		return fmt.Errorf("delete default sheet: %w", err)
	}
	idx, err := f.GetSheetIndex(orderReportSheetName)
	if err != nil {
		return fmt.Errorf("sheet index: %w", err)
	}
	f.SetActiveSheet(idx)

	// Column styles must be applied before the header/totals rows are styled: a
	// column-wide style (SetColStyle) overrides any per-cell style already on that
	// column, so writing it last would silently strip the header's bold formatting.
	if err := applyOrderReportColumnStyles(f); err != nil {
		return err
	}
	if err := writeOrderReportHeader(f); err != nil {
		return err
	}
	totalsRow, err := writeOrderReportRows(f, rows)
	if err != nil {
		return err
	}
	if err := writeOrderReportTotals(f, rows, totalsRow); err != nil {
		return err
	}
	if err := finishOrderReportLayout(f, totalsRow); err != nil {
		return err
	}

	if err := f.SaveAs(path); err != nil {
		return fmt.Errorf("save %q: %w", path, err)
	}
	return nil
}

func applyOrderReportColumnStyles(f *excelize.File) error {
	dateFmt := "dd-mmm-yy"
	dateStyle, err := f.NewStyle(&excelize.Style{CustomNumFmt: &dateFmt})
	if err != nil {
		return fmt.Errorf("date style: %w", err)
	}
	dateCol, err := excelize.ColumnNumberToName(colORDate)
	if err != nil {
		return err
	}
	if err := f.SetColStyle(orderReportSheetName, dateCol, dateStyle); err != nil {
		return err
	}

	moneyFmt := "#,##0.00"
	moneyStyle, err := f.NewStyle(&excelize.Style{CustomNumFmt: &moneyFmt})
	if err != nil {
		return fmt.Errorf("money style: %w", err)
	}
	if err := applyColStyleOn(f, orderReportSheetName, orderReportMoneyCols, moneyStyle); err != nil {
		return err
	}

	// Quantity columns (Pack Size, Qty) are whole numbers, no decimals — matches the
	// app's own fmtQty convention and the same fix already made to Purchase Summary
	// (quantities are always whole in this business; see docs/DECISIONS.md 2026-09-27).
	qtyFmt := "0"
	qtyStyle, err := f.NewStyle(&excelize.Style{CustomNumFmt: &qtyFmt})
	if err != nil {
		return fmt.Errorf("qty style: %w", err)
	}
	if err := applyColStyleOn(f, orderReportSheetName, orderReportQtyCols, qtyStyle); err != nil {
		return err
	}

	// GST % is written as a fraction (e.g. 0.18) so this is a real Excel Percentage
	// cell, matching the Purchase Summary convention.
	gstFmt := "0%"
	gstStyle, err := f.NewStyle(&excelize.Style{CustomNumFmt: &gstFmt})
	if err != nil {
		return fmt.Errorf("gst style: %w", err)
	}
	gstCol, err := excelize.ColumnNumberToName(colORGST)
	if err != nil {
		return err
	}
	if err := f.SetColStyle(orderReportSheetName, gstCol, gstStyle); err != nil {
		return err
	}

	intFmt := "0"
	intStyle, err := f.NewStyle(&excelize.Style{CustomNumFmt: &intFmt})
	if err != nil {
		return fmt.Errorf("int style: %w", err)
	}
	return applyColStyleOn(f, orderReportSheetName, []int{colORHSN, colORDeliveryNo}, intStyle)
}

func writeOrderReportHeader(f *excelize.File) error {
	boldStyle, err := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}})
	if err != nil {
		return fmt.Errorf("header style: %w", err)
	}
	for i, h := range orderReportHeaders {
		cell, err := excelize.CoordinatesToCellName(i+1, 1)
		if err != nil {
			return err
		}
		if err := f.SetCellValue(orderReportSheetName, cell, h); err != nil {
			return err
		}
	}
	last, err := excelize.CoordinatesToCellName(colORCount, 1)
	if err != nil {
		return err
	}
	return f.SetCellStyle(orderReportSheetName, "A1", last, boldStyle)
}

// writeOrderReportRows writes one row per line, starting at sheet row 2, and returns
// the row number the Totals row should occupy.
func writeOrderReportRows(f *excelize.File, rows []OrderReportRow) (int, error) {
	for i, r := range rows {
		row := i + 2
		values := make([]interface{}, colORCount)
		values[colORDate-1] = orderDateValue(r.Date)
		values[colORCustomer-1] = r.CustomerName
		values[colORCity-1] = r.CustomerCity
		values[colORItem-1] = r.ItemName
		values[colORPackSize-1] = r.PackSize
		values[colORGST-1] = r.GSTPercent / 100
		values[colORHSN-1] = r.HSN
		values[colORQty-1] = r.Qty
		values[colORRate-1] = r.Rate
		values[colORAmount-1] = r.FinalAmount
		values[colORDelivered-1] = deliveredLabel(r.Delivered)
		if r.DeliveryNo > 0 {
			values[colORDeliveryNo-1] = r.DeliveryNo
		}

		for c, v := range values {
			if v == nil {
				continue
			}
			cell, err := excelize.CoordinatesToCellName(c+1, row)
			if err != nil {
				return 0, err
			}
			if err := f.SetCellValue(orderReportSheetName, cell, v); err != nil {
				return 0, fmt.Errorf("write row %d: %w", row, err)
			}
		}
	}
	return len(rows) + 2, nil
}

func deliveredLabel(delivered bool) string {
	if delivered {
		return "Yes"
	}
	return "No"
}

// orderDateValue parses a dd-mmm-yy string into a time.Time for a real Excel date cell.
// The caller (Reports.tsx) always normalizes to the current format before building a
// row, so this never needs to understand the legacy dd-mmm-yyyy form. An unparseable
// date falls back to the zero value rather than failing the whole export.
func orderDateValue(s string) time.Time {
	t, err := time.Parse("02-Jan-06", s)
	if err != nil {
		return time.Time{}
	}
	return t
}

// writeOrderReportTotals sums Qty and Final Amount only — mirroring the on-screen order
// list/detail Totals row, which has never summed GST/Rate/HSN.
func writeOrderReportTotals(f *excelize.File, rows []OrderReportRow, totalsRow int) error {
	var qty, finalAmount float64
	for _, r := range rows {
		qty += r.Qty
		finalAmount += r.FinalAmount
	}

	boldStyle, err := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}})
	if err != nil {
		return fmt.Errorf("totals style: %w", err)
	}
	first, err := excelize.CoordinatesToCellName(1, totalsRow)
	if err != nil {
		return err
	}
	last, err := excelize.CoordinatesToCellName(colORCount, totalsRow)
	if err != nil {
		return err
	}
	if err := f.SetCellStyle(orderReportSheetName, first, last, boldStyle); err != nil {
		return err
	}

	label, err := excelize.CoordinatesToCellName(colORItem, totalsRow)
	if err != nil {
		return err
	}
	if err := f.SetCellValue(orderReportSheetName, label, "Totals"); err != nil {
		return err
	}

	qtyFmt := "0"
	boldQtyStyle, err := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}, CustomNumFmt: &qtyFmt})
	if err != nil {
		return fmt.Errorf("totals qty style: %w", err)
	}
	if err := setStyledCellOn(f, orderReportSheetName, colORQty, totalsRow, qty, boldQtyStyle); err != nil {
		return err
	}

	moneyFmt := "#,##0.00"
	boldMoneyStyle, err := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}, CustomNumFmt: &moneyFmt})
	if err != nil {
		return fmt.Errorf("totals money style: %w", err)
	}
	return setStyledCellOn(f, orderReportSheetName, colORAmount, totalsRow, finalAmount, boldMoneyStyle)
}

// setStyledCellOn mirrors setStyledCell in purchase_summary.go but is parameterized by
// sheet name, since this package now writes to more than one sheet name.
func setStyledCellOn(f *excelize.File, sheet string, col, row int, value interface{}, styleID int) error {
	cell, err := excelize.CoordinatesToCellName(col, row)
	if err != nil {
		return err
	}
	if err := f.SetCellValue(sheet, cell, value); err != nil {
		return err
	}
	return f.SetCellStyle(sheet, cell, cell, styleID)
}

func finishOrderReportLayout(f *excelize.File, totalsRow int) error {
	lastCol, err := excelize.ColumnNumberToName(colORCount)
	if err != nil {
		return err
	}
	if err := f.SetColWidth(orderReportSheetName, "A", lastCol, 14); err != nil {
		return err
	}
	if err := f.SetColWidth(orderReportSheetName, "B", "B", 20); err != nil { // Customer, wider
		return err
	}
	if err := f.SetColWidth(orderReportSheetName, "D", "D", 22); err != nil { // Item name, wider
		return err
	}

	if err := f.SetPanes(orderReportSheetName, &excelize.Panes{
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
	if err := f.AutoFilter(orderReportSheetName, headerRange, nil); err != nil {
		return fmt.Errorf("autofilter: %w", err)
	}
	return nil
}
