package reports

import (
	"archive/zip"
	_ "embed" // required by //go:embed even though we embed into []byte, not embed.FS
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/signintech/gopdf"
	"github.com/xuri/excelize/v2"
)

//go:embed fonts/Nunito-Regular.ttf
var nunitoRegularTTF []byte

//go:embed fonts/Nunito-Bold.ttf
var nunitoBoldTTF []byte

// OrderExportHeader is the customer-facing summary line for one order, fully built by
// the caller (SavedOrders.tsx) — CustomerLabel is already "{nickname||name} - {city}"
// and Date is already display-formatted (dd-mmm-yy). This file does no string assembly
// or date parsing, only layout — same convention as purchase_summary.go's row math.
type OrderExportHeader struct {
	OrderID       int64  `json:"orderId"`
	CustomerLabel string `json:"customerLabel"`
	Date          string `json:"date"`
}

// OrderExportRow mirrors ShareableOrderImage.tsx's columns exactly — Qty, Item,
// Unit (= pack size), Rate, Amount. No GST%/HSN, by design (customer-facing export,
// matching the WhatsApp-shared image's style). FinalAmount is pre-computed by the
// caller (calcOrderLine) — never re-derived here.
type OrderExportRow struct {
	ItemName    string  `json:"itemName"`
	PackSize    float64 `json:"packSize"`
	Rate        float64 `json:"rate"`
	Qty         float64 `json:"qty"`
	FinalAmount float64 `json:"finalAmount"`
}

// OrderExportDeduction is one "Less: N unit — Item Name" line (or "Add: ..." when
// Units is negative — the actual pack size was larger than standard), fully computed
// by the caller from a line whose custom pack size differed from the item's master
// pack size. Never re-derived here — this package only lays it out.
type OrderExportDeduction struct {
	ItemName string  `json:"itemName"`
	Units    float64 `json:"units"` // positive = shortfall (Less), negative = surplus (Add)
	Rate     float64 `json:"rate"`
	Value    float64 `json:"value"` // Units * Rate — net total = gross - sum(Value)
}

// headerYellow is #FFD966 — the shared brand color for the customer-facing export
// header/footer bars, matching ShareableOrderImage.tsx exactly.
var headerYellow = [3]uint8{0xFF, 0xD9, 0x66}

const orderSheetName = "Order"

// WriteOrderExcel writes a single order to a new workbook at path, styled to match
// ShareableOrderImage.tsx: a merged yellow customer/date header bar, a yellow bold
// column-header row, black-bordered white data rows (already grouped by the caller —
// see lib/salesOrder.ts's buildOrderExportGroups), a bold "Total" row, and — only when
// deductions is non-empty — one "Less"/"Add" line per custom-pack-size line followed by
// a final net "Total" row.
func WriteOrderExcel(path string, header OrderExportHeader, rows []OrderExportRow, deductions []OrderExportDeduction) error {
	f, err := buildOrderExcel(header, rows, deductions)
	if err != nil {
		return err
	}
	defer f.Close()

	if err := f.SaveAs(path); err != nil {
		return fmt.Errorf("save %q: %w", path, err)
	}
	return nil
}

// buildOrderExcel lays out one order's workbook in memory, shared by WriteOrderExcel
// (saves to a path) and WriteOrderExcelsZip (writes into a zip entry). The caller owns
// closing the returned file.
func buildOrderExcel(header OrderExportHeader, rows []OrderExportRow, deductions []OrderExportDeduction) (*excelize.File, error) {
	f := excelize.NewFile()
	ok := false
	defer func() {
		if !ok {
			f.Close()
		}
	}()

	if _, err := f.NewSheet(orderSheetName); err != nil {
		return nil, fmt.Errorf("create sheet: %w", err)
	}
	if err := f.DeleteSheet("Sheet1"); err != nil {
		return nil, fmt.Errorf("delete default sheet: %w", err)
	}
	idx, err := f.GetSheetIndex(orderSheetName)
	if err != nil {
		return nil, fmt.Errorf("sheet index: %w", err)
	}
	f.SetActiveSheet(idx)

	if err := writeOrderHeaderBar(f, header); err != nil {
		return nil, err
	}
	if err := writeOrderColumnHeaders(f); err != nil {
		return nil, err
	}
	totalsRow, err := writeOrderRows(f, rows)
	if err != nil {
		return nil, err
	}
	grossAmount, err := writeOrderTotals(f, rows, totalsRow)
	if err != nil {
		return nil, err
	}
	if len(deductions) > 0 {
		nextRow, err := writeOrderDeductions(f, deductions, totalsRow+1)
		if err != nil {
			return nil, err
		}
		var deductionTotal float64
		for _, d := range deductions {
			deductionTotal += d.Value
		}
		if err := writeOrderNetTotal(f, grossAmount-deductionTotal, nextRow); err != nil {
			return nil, err
		}
	}
	if err := finishOrderLayout(f); err != nil {
		return nil, err
	}

	ok = true
	return f, nil
}

// DeliveredOrderExcelEntry is one order's workbook for the zip export: the same
// header/rows/deductions WriteOrderExcel takes, plus the member filename inside the zip
// (built by the caller via orderExportFilename, so it matches single-order exports).
type DeliveredOrderExcelEntry struct {
	Filename   string                 `json:"filename"`
	Header     OrderExportHeader      `json:"header"`
	Rows       []OrderExportRow       `json:"rows"`
	Deductions []OrderExportDeduction `json:"deductions"`
}

// WriteOrderExcelsZip writes one .xlsx per entry — each byte-for-byte what WriteOrderExcel
// would produce — into a single zip at path. Duplicate filenames get " (2)", " (3)", …
// before the extension so no member silently overwrites another.
func WriteOrderExcelsZip(path string, entries []DeliveredOrderExcelEntry) (err error) {
	out, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("create %q: %w", path, err)
	}
	defer func() {
		if cerr := out.Close(); err == nil && cerr != nil {
			err = fmt.Errorf("close %q: %w", path, cerr)
		}
	}()

	zw := zip.NewWriter(out)
	used := map[string]bool{}
	for _, e := range entries {
		name := uniqueZipName(e.Filename, used)
		f, err := buildOrderExcel(e.Header, e.Rows, e.Deductions)
		if err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		buf, err := f.WriteToBuffer()
		f.Close()
		if err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		w, err := zw.Create(name)
		if err != nil {
			return fmt.Errorf("zip entry %q: %w", name, err)
		}
		if _, err := w.Write(buf.Bytes()); err != nil {
			return fmt.Errorf("zip entry %q: %w", name, err)
		}
	}
	if err := zw.Close(); err != nil {
		return fmt.Errorf("write zip %q: %w", path, err)
	}
	return nil
}

func uniqueZipName(name string, used map[string]bool) string {
	candidate := name
	ext := filepath.Ext(name)
	base := strings.TrimSuffix(name, ext)
	for n := 2; used[strings.ToLower(candidate)]; n++ {
		candidate = fmt.Sprintf("%s (%d)%s", base, n, ext)
	}
	used[strings.ToLower(candidate)] = true
	return candidate
}

// orderCellStyle builds a style combining a black border on all four sides (this
// export wants a visible grid, unlike purchase_summary.go's plain gridlines) with an
// optional fill color, alignment, bold weight, and number format.
func orderCellStyle(f *excelize.File, fill, align string, bold bool, numFmt string) (int, error) {
	style := &excelize.Style{
		Border: []excelize.Border{
			{Type: "left", Color: "#000000", Style: 1},
			{Type: "top", Color: "#000000", Style: 1},
			{Type: "bottom", Color: "#000000", Style: 1},
			{Type: "right", Color: "#000000", Style: 1},
		},
		Alignment: &excelize.Alignment{Horizontal: align, Vertical: "center"},
	}
	if fill != "" {
		style.Fill = excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{fill}}
	}
	if bold {
		style.Font = &excelize.Font{Bold: true}
	}
	if numFmt != "" {
		style.CustomNumFmt = &numFmt
	}
	return f.NewStyle(style)
}

func setOrderCell(f *excelize.File, col string, row int, value interface{}, styleID int) error {
	cell := fmt.Sprintf("%s%d", col, row)
	if err := f.SetCellValue(orderSheetName, cell, value); err != nil {
		return err
	}
	return f.SetCellStyle(orderSheetName, cell, cell, styleID)
}

// orderHeaderBarStyle builds a style for one half of the header bar: only the given
// border sides (so the two halves meet with no dividing line between them, reading as
// one continuous bar — Excel can't merge two independently-aligned text runs into a
// single cell the way an HTML flex layout can) plus the shared yellow fill and a bumped
// font size (13pt vs the sheet's default ~11pt elsewhere), matching
// ShareableOrderImage.tsx's slightly-larger header text.
func orderHeaderBarStyle(f *excelize.File, align string, sides []string) (int, error) {
	borders := make([]excelize.Border, len(sides))
	for i, s := range sides {
		borders[i] = excelize.Border{Type: s, Color: "#000000", Style: 1}
	}
	style := &excelize.Style{
		Border:    borders,
		Alignment: &excelize.Alignment{Horizontal: align, Vertical: "center"},
		Fill:      excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{headerYellowHex}},
		Font:      &excelize.Font{Bold: true, Size: 13},
	}
	return f.NewStyle(style)
}

func writeOrderHeaderBar(f *excelize.File, header OrderExportHeader) error {
	leftStyle, err := orderHeaderBarStyle(f, "left", []string{"left", "top", "bottom"})
	if err != nil {
		return err
	}
	rightStyle, err := orderHeaderBarStyle(f, "right", []string{"top", "bottom", "right"})
	if err != nil {
		return err
	}
	if err := f.SetCellValue(orderSheetName, "A1", header.CustomerLabel); err != nil {
		return err
	}
	if err := f.MergeCell(orderSheetName, "A1", "C1"); err != nil {
		return fmt.Errorf("merge header label: %w", err)
	}
	if err := f.SetCellStyle(orderSheetName, "A1", "C1", leftStyle); err != nil {
		return err
	}
	if err := f.SetCellValue(orderSheetName, "D1", header.Date); err != nil {
		return err
	}
	if err := f.MergeCell(orderSheetName, "D1", "E1"); err != nil {
		return fmt.Errorf("merge header date: %w", err)
	}
	return f.SetCellStyle(orderSheetName, "D1", "E1", rightStyle)
}

func writeOrderColumnHeaders(f *excelize.File) error {
	centerStyle, err := orderCellStyle(f, headerYellowHex, "center", true, "")
	if err != nil {
		return err
	}
	leftStyle, err := orderCellStyle(f, headerYellowHex, "left", true, "")
	if err != nil {
		return err
	}
	rightStyle, err := orderCellStyle(f, headerYellowHex, "right", true, "")
	if err != nil {
		return err
	}

	cells := []struct {
		cell  string
		value string
		style int
	}{
		{"A2", "Qty", centerStyle},
		{"B2", "Item", leftStyle},
		{"C2", "Unit", centerStyle},
		{"D2", "Rate", rightStyle},
		{"E2", "Amount", rightStyle},
	}
	for _, c := range cells {
		if err := f.SetCellValue(orderSheetName, c.cell, c.value); err != nil {
			return err
		}
		if err := f.SetCellStyle(orderSheetName, c.cell, c.cell, c.style); err != nil {
			return err
		}
	}
	return nil
}

// writeOrderRows writes one row per line item, starting at sheet row 3 (rows 1-2 are
// the header bar/column headers), and returns the row number the totals row occupies.
func writeOrderRows(f *excelize.File, rows []OrderExportRow) (int, error) {
	centerQtyStyle, err := orderCellStyle(f, "", "center", false, "0")
	if err != nil {
		return 0, err
	}
	leftStyle, err := orderCellStyle(f, "", "left", false, "")
	if err != nil {
		return 0, err
	}
	moneyStyle, err := orderCellStyle(f, "", "right", false, "#,##0.00")
	if err != nil {
		return 0, err
	}

	for i, r := range rows {
		row := i + 3
		if err := setOrderCell(f, "A", row, r.Qty, centerQtyStyle); err != nil {
			return 0, err
		}
		if err := setOrderCell(f, "B", row, r.ItemName, leftStyle); err != nil {
			return 0, err
		}
		if err := setOrderCell(f, "C", row, r.PackSize, centerQtyStyle); err != nil {
			return 0, err
		}
		if err := setOrderCell(f, "D", row, r.Rate, moneyStyle); err != nil {
			return 0, err
		}
		if err := setOrderCell(f, "E", row, r.FinalAmount, moneyStyle); err != nil {
			return 0, err
		}
	}
	return len(rows) + 3, nil
}

// writeOrderTotals writes the bold "Total" row (always the gross total — the same
// figure a net total starts from) and returns that amount for the caller to net
// deductions against.
func writeOrderTotals(f *excelize.File, rows []OrderExportRow, totalsRow int) (float64, error) {
	var qty, amount float64
	for _, r := range rows {
		qty += r.Qty
		amount += r.FinalAmount
	}

	qtyStyle, err := orderCellStyle(f, headerYellowHex, "center", true, "0")
	if err != nil {
		return 0, err
	}
	labelStyle, err := orderCellStyle(f, headerYellowHex, "right", true, "")
	if err != nil {
		return 0, err
	}
	amountStyle, err := orderCellStyle(f, headerYellowHex, "right", true, "#,##0.00")
	if err != nil {
		return 0, err
	}

	if err := setOrderCell(f, "A", totalsRow, qty, qtyStyle); err != nil {
		return 0, err
	}
	labelCell := fmt.Sprintf("B%d", totalsRow)
	lastCell := fmt.Sprintf("D%d", totalsRow)
	if err := f.SetCellValue(orderSheetName, labelCell, "Total"); err != nil {
		return 0, err
	}
	if err := f.MergeCell(orderSheetName, labelCell, lastCell); err != nil {
		return 0, fmt.Errorf("merge totals label: %w", err)
	}
	if err := f.SetCellStyle(orderSheetName, labelCell, lastCell, labelStyle); err != nil {
		return 0, err
	}
	if err := setOrderCell(f, "E", totalsRow, amount, amountStyle); err != nil {
		return 0, err
	}
	return amount, nil
}

// writeOrderDeductions writes one row per deduction, starting at startRow (plain text,
// no fill — matches the reference image's undecorated "Less: ..." lines), and returns
// the row number immediately after the last one, where the net Total goes.
func writeOrderDeductions(f *excelize.File, deductions []OrderExportDeduction, startRow int) (int, error) {
	labelStyle, err := orderCellStyle(f, "", "right", false, "")
	if err != nil {
		return 0, err
	}
	valueStyle, err := orderCellStyle(f, "", "right", false, "#,##0.00")
	if err != nil {
		return 0, err
	}

	for i, d := range deductions {
		row := startRow + i
		verb, units, value := "Less", d.Units, d.Value
		if units < 0 {
			verb, units, value = "Add", -units, -value
		}
		label := fmt.Sprintf("%s: %s — %s", verb, fmtOrderQty(units), d.ItemName)
		labelCell := fmt.Sprintf("B%d", row)
		lastCell := fmt.Sprintf("D%d", row)
		if err := f.SetCellValue(orderSheetName, labelCell, label); err != nil {
			return 0, err
		}
		if err := f.MergeCell(orderSheetName, labelCell, lastCell); err != nil {
			return 0, fmt.Errorf("merge deduction label: %w", err)
		}
		if err := f.SetCellStyle(orderSheetName, labelCell, lastCell, labelStyle); err != nil {
			return 0, err
		}
		if err := setOrderCell(f, "E", row, value, valueStyle); err != nil {
			return 0, err
		}
	}
	return startRow + len(deductions), nil
}

// writeOrderNetTotal writes the final bold "Total" row (gross minus every deduction).
// Unlike the gross totals row, this row's qty cell is already blank (net qty isn't
// shown), so the label merges across all four of qty/item/unit/rate.
func writeOrderNetTotal(f *excelize.File, amount float64, row int) error {
	labelStyle, err := orderCellStyle(f, headerYellowHex, "right", true, "")
	if err != nil {
		return err
	}
	amountStyle, err := orderCellStyle(f, headerYellowHex, "right", true, "#,##0.00")
	if err != nil {
		return err
	}

	labelCell := fmt.Sprintf("A%d", row)
	lastCell := fmt.Sprintf("D%d", row)
	if err := f.SetCellValue(orderSheetName, labelCell, "Total"); err != nil {
		return err
	}
	if err := f.MergeCell(orderSheetName, labelCell, lastCell); err != nil {
		return fmt.Errorf("merge net total label: %w", err)
	}
	if err := f.SetCellStyle(orderSheetName, labelCell, lastCell, labelStyle); err != nil {
		return err
	}
	return setOrderCell(f, "E", row, amount, amountStyle)
}

func finishOrderLayout(f *excelize.File) error {
	if err := f.SetColWidth(orderSheetName, "A", "A", 8); err != nil {
		return err
	}
	if err := f.SetColWidth(orderSheetName, "B", "B", 32); err != nil {
		return err
	}
	if err := f.SetColWidth(orderSheetName, "C", "C", 8); err != nil {
		return err
	}
	return f.SetColWidth(orderSheetName, "D", "E", 12)
}

// headerYellowHex is the Excel-style hex string form of headerYellow, for excelize's
// Fill.Color (which takes "#RRGGBB" strings rather than RGB bytes).
const headerYellowHex = "#FFD966"

// --- PDF ---

var pdfColWidths = []float64{45, 260, 55, 78, 85} // Qty, Item, Unit, Rate, Amount

const (
	pdfMarginPt        = 36.0
	pdfHeaderRowHeight = 22.0
	pdfRowHeight       = 18.0
	pdfFontSize        = 10
	// pdfHeaderFontSize is used only for the merged customer/date header bar — a step
	// larger than the body text, mirroring ShareableOrderImage.tsx's slightly-larger
	// header row.
	pdfHeaderFontSize = pdfFontSize + 2
	// pdfTitleFontSize/pdfTitleHeight are used only by Print Delivered Orders' "Order
	// #N" heading above each table — bigger than even the header bar, so it reads as a
	// distinct label rather than part of the table.
	pdfTitleFontSize = pdfFontSize + 6
	pdfTitleHeight   = 26.0
	// pdfBlockGapPt is the vertical gap between consecutive order tables sharing a page
	// in Print Delivered Orders.
	pdfBlockGapPt = 24.0
)

// WriteOrderPDF writes a single order to a new PDF at path, in the same visual style
// as WriteOrderExcel/ShareableOrderImage.tsx, using the bundled Nunito font (no
// built-in fonts exist in the gopdf library). Mirrors WriteOrderExcel's gross Total →
// deduction line(s) → net Total structure when deductions is non-empty.
func WriteOrderPDF(path string, header OrderExportHeader, rows []OrderExportRow, deductions []OrderExportDeduction) error {
	pdf := gopdf.GoPdf{}
	pdf.Start(gopdf.Config{PageSize: *gopdf.PageSizeA4})
	pdf.SetMargins(pdfMarginPt, pdfMarginPt, pdfMarginPt, pdfMarginPt)
	pdf.AddPage()

	if err := pdf.AddTTFFontData("Nunito", nunitoRegularTTF); err != nil {
		return fmt.Errorf("load regular font: %w", err)
	}
	if err := pdf.AddTTFFontDataWithOption("Nunito", nunitoBoldTTF, gopdf.TtfOption{Style: gopdf.Bold}); err != nil {
		return fmt.Errorf("load bold font: %w", err)
	}

	// SetTextColor must be called once, up front, before any fill/cell drawing: gopdf
	// shares its PDF color operator between SetFillColor and glyph color, so without
	// this, text silently renders in whatever color a background fill last used
	// (invisible yellow-on-yellow after the first header cell). See DECISIONS.md.
	pdf.SetTextColor(0, 0, 0)
	pdf.SetStrokeColor(0, 0, 0)
	pdf.SetLineWidth(0.75)

	if _, err := drawOrderBlock(&pdf, pdfColWidths, pdfMarginPt, pdfMarginPt, "", header, rows, deductions, &headerYellow); err != nil {
		return err
	}

	if err := pdf.WritePdf(path); err != nil {
		return fmt.Errorf("write pdf %q: %w", path, err)
	}
	return nil
}

// drawOrderBlock draws one order's full table at (x0, y): an optional bold title line
// (skipped entirely when title is ""), the customer/date header bar, column headers,
// line rows (falling back to a mid-table page break if a single order is taller than one
// page — the only case where a block isn't drawn atomically), a gross Total, and — when
// deductions is non-empty — deduction lines plus a final net Total. accent is nil for a
// plain (uncolored, border-only) table; WriteOrderPDF passes &headerYellow to keep its
// output exactly as before this function existed. Returns the y position immediately
// below the block, for the caller to continue from (e.g. the next order's title).
func drawOrderBlock(pdf *gopdf.GoPdf, cols []float64, x0, y float64, title string, header OrderExportHeader, rows []OrderExportRow, deductions []OrderExportDeduction, accent *[3]uint8) (float64, error) {
	if title != "" {
		if err := pdf.SetFont("Nunito", "B", pdfTitleFontSize); err != nil {
			return 0, fmt.Errorf("set font: %w", err)
		}
		tableWidth := cols[0] + cols[1] + cols[2] + cols[3] + cols[4]
		pdf.SetXY(x0, y)
		if err := pdf.CellWithOption(&gopdf.Rect{W: tableWidth, H: pdfTitleHeight}, title, gopdf.CellOption{Align: gopdf.Left | gopdf.Middle, Border: 0}); err != nil {
			return 0, err
		}
		y += pdfTitleHeight
	}

	if err := drawOrderHeaderBar(pdf, cols, x0, y, header.CustomerLabel, header.Date, accent); err != nil {
		return 0, err
	}
	y += pdfHeaderRowHeight

	if err := drawOrderColumnHeaderRow(pdf, cols, x0, y, accent); err != nil {
		return 0, err
	}
	y += pdfHeaderRowHeight

	aligns := []int{gopdf.Center, gopdf.Left, gopdf.Center, gopdf.Right, gopdf.Right}
	var totalQty, totalAmount float64
	for _, r := range rows {
		if y+pdfRowHeight > gopdf.PageSizeA4.H-pdf.MarginBottom() {
			pdf.AddPage()
			y = pdf.MarginTop()
			if err := drawOrderColumnHeaderRow(pdf, cols, x0, y, accent); err != nil {
				return 0, err
			}
			y += pdfHeaderRowHeight
		}
		cells := []string{fmtOrderQty(r.Qty), r.ItemName, fmtOrderQty(r.PackSize), fmtOrderMoney(r.Rate), fmtOrderMoney(r.FinalAmount)}
		for i, c := range cells {
			if err := drawOrderCell(pdf, pdfColX(cols, i, x0), y, cols[i], pdfRowHeight, c, aligns[i], false, nil); err != nil {
				return 0, err
			}
		}
		totalQty += r.Qty
		totalAmount += r.FinalAmount
		y += pdfRowHeight
	}

	if y+pdfRowHeight > gopdf.PageSizeA4.H-pdf.MarginBottom() {
		pdf.AddPage()
		y = pdf.MarginTop()
	}
	if err := drawOrderTotalRow(pdf, cols, x0, y, fmtOrderQty(totalQty), totalAmount, false, accent); err != nil {
		return 0, err
	}
	y += pdfRowHeight

	if len(deductions) > 0 {
		var deductionTotal float64
		for _, d := range deductions {
			if y+pdfRowHeight > gopdf.PageSizeA4.H-pdf.MarginBottom() {
				pdf.AddPage()
				y = pdf.MarginTop()
			}
			label, value := deductionLabelAndValue(d)
			labelWidth := cols[0] + cols[1] + cols[2] + cols[3]
			if err := drawOrderCell(pdf, x0, y, labelWidth, pdfRowHeight, label, gopdf.Right, false, nil); err != nil {
				return 0, err
			}
			if err := drawOrderCell(pdf, pdfColX(cols, 4, x0), y, cols[4], pdfRowHeight, fmtOrderMoney(value), gopdf.Right, false, nil); err != nil {
				return 0, err
			}
			deductionTotal += d.Value
			y += pdfRowHeight
		}

		if y+pdfRowHeight > gopdf.PageSizeA4.H-pdf.MarginBottom() {
			pdf.AddPage()
			y = pdf.MarginTop()
		}
		if err := drawOrderTotalRow(pdf, cols, x0, y, "", totalAmount-deductionTotal, true, accent); err != nil {
			return 0, err
		}
		y += pdfRowHeight
	}

	return y, nil
}

// deductionLabelAndValue returns a deduction line's printed label ("Less: 5 — Item" or,
// for a surplus, "Add: …") and its signed amount, shared by the drawing code and the
// column-width measurement so the two can never disagree.
func deductionLabelAndValue(d OrderExportDeduction) (string, float64) {
	verb, units, value := "Less", d.Units, d.Value
	if units < 0 {
		verb, units, value = "Add", -units, -value
	}
	return fmt.Sprintf("%s: %s — %s", verb, fmtOrderQty(units), d.ItemName), value
}

// DeliveredOrdersPrintEntry is one order's data for the Print Delivered Orders report —
// its delivery number (printed as the table's title) plus the same header/rows/
// deductions shape WriteOrderExcel/WriteOrderPDF already use.
type DeliveredOrdersPrintEntry struct {
	DeliveryNo int64                  `json:"deliveryNo"`
	Header     OrderExportHeader      `json:"header"`
	Rows       []OrderExportRow       `json:"rows"`
	Deductions []OrderExportDeduction `json:"deductions"`
}

// estimateOrderBlockHeight returns the exact height drawOrderBlock will consume for a
// titled block with this many rows/deductions, assuming it fits on one page (no mid-table
// page break) — used to decide whether the next table fits in the remaining space on the
// current page before drawing it. Must stay in lockstep with drawOrderBlock's layout.
func estimateOrderBlockHeight(rows []OrderExportRow, deductions []OrderExportDeduction) float64 {
	h := pdfTitleHeight + pdfHeaderRowHeight + pdfHeaderRowHeight // title + header bar + column headers
	h += float64(len(rows)) * pdfRowHeight
	h += pdfRowHeight // gross Total row
	if len(deductions) > 0 {
		h += float64(len(deductions)) * pdfRowHeight
		h += pdfRowHeight // net Total row
	}
	return h
}

// fitDeliveredOrdersCols returns pdfColWidths with the Item column shrunk to the widest
// text it must hold across every entry (item names and the "Item" header), so all tables
// in one PDF share a single, narrower width. The merged customer/date header bar and the
// merged "Less:/Add: …" deduction labels span other columns plus Item, so Item is never
// narrower than what those need either. Fonts must already be loaded on pdf.
func fitDeliveredOrdersCols(pdf *gopdf.GoPdf, entries []DeliveredOrdersPrintEntry) ([]float64, error) {
	measure := func(style string, size float64, text string) (float64, error) {
		if err := pdf.SetFont("Nunito", style, size); err != nil {
			return 0, fmt.Errorf("set font: %w", err)
		}
		return pdf.MeasureTextWidth(text)
	}

	cols := append([]float64(nil), pdfColWidths...)
	need, err := measure("B", pdfFontSize, "Item")
	if err != nil {
		return nil, err
	}
	// Merged spans, each needing text width + padding on both sides, minus the other
	// columns they already cover; slack of 1pt keeps text off the border's anti-aliasing.
	const slack = 1.0
	headerNeed, deductionNeed := 0.0, 0.0
	for _, e := range entries {
		for _, r := range e.Rows {
			w, err := measure("", pdfFontSize, r.ItemName)
			if err != nil {
				return nil, err
			}
			need = math.Max(need, w)
		}
		lw, err := measure("B", pdfHeaderFontSize, e.Header.CustomerLabel)
		if err != nil {
			return nil, err
		}
		dw, err := measure("B", pdfHeaderFontSize, e.Header.Date)
		if err != nil {
			return nil, err
		}
		headerNeed = math.Max(headerNeed, lw+dw+4*pdfCellPadX)
		for _, d := range e.Deductions {
			label, _ := deductionLabelAndValue(d)
			w, err := measure("", pdfFontSize, label)
			if err != nil {
				return nil, err
			}
			deductionNeed = math.Max(deductionNeed, w+2*pdfCellPadX)
		}
	}
	item := need + 2*pdfCellPadX + slack
	item = math.Max(item, headerNeed-(cols[0]+cols[2]+cols[3]+cols[4]))
	item = math.Max(item, deductionNeed-(cols[0]+cols[2]+cols[3]))
	cols[1] = math.Min(math.Ceil(item), pdfColWidths[1]) // never wider than before
	return cols, nil
}

// WriteDeliveredOrdersPDF writes every entry (already sorted by delivery number by the
// caller) as a sequence of plain, center-aligned tables onto A4 pages — packing as many
// as fit vertically per page, starting a new page before any table that wouldn't fully
// fit in the remaining space (tables are never split across a page break in the normal
// case; the only exception is a single order too tall for one whole page, which falls
// back to drawOrderBlock's own mid-table page-break safety net). The sequence itself is
// never reordered — a table simply starts the next page when it doesn't fit.
func WriteDeliveredOrdersPDF(path string, entries []DeliveredOrdersPrintEntry) error {
	pdf := gopdf.GoPdf{}
	pdf.Start(gopdf.Config{PageSize: *gopdf.PageSizeA4})
	pdf.SetMargins(pdfMarginPt, pdfMarginPt, pdfMarginPt, pdfMarginPt)
	pdf.AddPage()

	if err := pdf.AddTTFFontData("Nunito", nunitoRegularTTF); err != nil {
		return fmt.Errorf("load regular font: %w", err)
	}
	if err := pdf.AddTTFFontDataWithOption("Nunito", nunitoBoldTTF, gopdf.TtfOption{Style: gopdf.Bold}); err != nil {
		return fmt.Errorf("load bold font: %w", err)
	}

	// See WriteOrderPDF's identical comment: SetTextColor must be called up front.
	pdf.SetTextColor(0, 0, 0)
	pdf.SetStrokeColor(0, 0, 0)
	pdf.SetLineWidth(0.75)

	cols, err := fitDeliveredOrdersCols(&pdf, entries)
	if err != nil {
		return err
	}
	tableWidth := cols[0] + cols[1] + cols[2] + cols[3] + cols[4]
	x0 := (gopdf.PageSizeA4.W - tableWidth) / 2

	y := pdf.MarginTop()
	for i, e := range entries {
		blockHeight := estimateOrderBlockHeight(e.Rows, e.Deductions)
		gap := 0.0
		if i > 0 {
			gap = pdfBlockGapPt
		}
		if y+gap+blockHeight > gopdf.PageSizeA4.H-pdf.MarginBottom() && y > pdf.MarginTop() {
			pdf.AddPage()
			y = pdf.MarginTop()
		} else {
			y += gap
		}

		title := fmt.Sprintf("#%d", e.DeliveryNo)
		newY, err := drawOrderBlock(&pdf, cols, x0, y, title, e.Header, e.Rows, e.Deductions, nil)
		if err != nil {
			return err
		}
		y = newY
	}

	if err := pdf.WritePdf(path); err != nil {
		return fmt.Errorf("write pdf %q: %w", path, err)
	}
	return nil
}

// drawOrderTotalRow draws one bold yellow "Total" row, then the amount. When mergeQty
// is false (the gross total, which still shows a real qty sum), the qty cell is drawn
// on its own and "Total" merges across the Item/Unit/Rate cells. When mergeQty is true
// (the final net total, whose qty is already blank), "Total" merges across all four of
// Qty/Item/Unit/Rate instead.
func drawOrderTotalRow(pdf *gopdf.GoPdf, cols []float64, x0, y float64, qty string, amount float64, mergeQty bool, accent *[3]uint8) error {
	if mergeQty {
		labelWidth := cols[0] + cols[1] + cols[2] + cols[3]
		if err := drawOrderCell(pdf, pdfColX(cols, 0, x0), y, labelWidth, pdfRowHeight, "Total", gopdf.Right, true, accent); err != nil {
			return err
		}
	} else {
		if err := drawOrderCell(pdf, pdfColX(cols, 0, x0), y, cols[0], pdfRowHeight, qty, gopdf.Center, true, accent); err != nil {
			return err
		}
		labelWidth := cols[1] + cols[2] + cols[3]
		if err := drawOrderCell(pdf, pdfColX(cols, 1, x0), y, labelWidth, pdfRowHeight, "Total", gopdf.Right, true, accent); err != nil {
			return err
		}
	}
	return drawOrderCell(pdf, pdfColX(cols, 4, x0), y, cols[4], pdfRowHeight, fmtOrderMoney(amount), gopdf.Right, true, accent)
}

// drawOrderHeaderBar draws the customer-label/date header as a single bordered rect (no
// dividing line down the middle, unlike two separately-bordered cells) with the label
// left-aligned and the date right-aligned inside it, at pdfHeaderFontSize. accent is nil
// for a plain (border-only, unfilled) bar.
func drawOrderHeaderBar(pdf *gopdf.GoPdf, cols []float64, x0, y float64, label, date string, accent *[3]uint8) error {
	labelWidth := cols[0] + cols[1] + cols[2]
	totalWidth := labelWidth + cols[3] + cols[4]

	style := "D"
	if accent != nil {
		pdf.SetFillColor(accent[0], accent[1], accent[2])
		style = "FD"
	}
	pdf.RectFromUpperLeftWithStyle(x0, y, totalWidth, pdfHeaderRowHeight, style)

	if err := pdf.SetFont("Nunito", "B", pdfHeaderFontSize); err != nil {
		return fmt.Errorf("set font: %w", err)
	}
	pdf.SetXY(x0+pdfCellPadX, y)
	if err := pdf.CellWithOption(&gopdf.Rect{W: labelWidth - pdfCellPadX, H: pdfHeaderRowHeight}, label, gopdf.CellOption{Align: gopdf.Left | gopdf.Middle, Border: 0}); err != nil {
		return err
	}
	pdf.SetXY(x0, y)
	return pdf.CellWithOption(&gopdf.Rect{W: totalWidth - pdfCellPadX, H: pdfHeaderRowHeight}, date, gopdf.CellOption{Align: gopdf.Right | gopdf.Middle, Border: 0})
}

func drawOrderColumnHeaderRow(pdf *gopdf.GoPdf, cols []float64, x0, y float64, accent *[3]uint8) error {
	headers := []string{"Qty", "Item", "Unit", "Rate", "Amount"}
	aligns := []int{gopdf.Center, gopdf.Left, gopdf.Center, gopdf.Right, gopdf.Right}
	for i, h := range headers {
		if err := drawOrderCell(pdf, pdfColX(cols, i, x0), y, cols[i], pdfHeaderRowHeight, h, aligns[i], true, accent); err != nil {
			return err
		}
	}
	return nil
}

// pdfCellPadX keeps cell text from touching the border (CellWithOption has no built-in
// cell padding) — the border is drawn at the full cell rect, and the text is drawn
// separately, unbordered, inset by this much on each side.
const pdfCellPadX = 4.0

// drawOrderCell draws one bordered cell at (x, y): the border (plus an optional filled
// background) at the full cell rect, then the text inset by pdfCellPadX so it never
// touches the border. fill is nil for a plain white cell.
func drawOrderCell(pdf *gopdf.GoPdf, x, y, w, h float64, text string, align int, bold bool, fill *[3]uint8) error {
	style := "D"
	if fill != nil {
		pdf.SetFillColor(fill[0], fill[1], fill[2])
		style = "FD"
	}
	pdf.RectFromUpperLeftWithStyle(x, y, w, h, style)

	fontStyle := ""
	if bold {
		fontStyle = "B"
	}
	if err := pdf.SetFont("Nunito", fontStyle, pdfFontSize); err != nil {
		return fmt.Errorf("set font: %w", err)
	}
	pdf.SetXY(x+pdfCellPadX, y)
	return pdf.CellWithOption(&gopdf.Rect{W: w - 2*pdfCellPadX, H: h}, text, gopdf.CellOption{Align: align | gopdf.Middle, Border: 0})
}

func pdfColX(cols []float64, i int, startX float64) float64 {
	x := startX
	for j := 0; j < i; j++ {
		x += cols[j]
	}
	return x
}

// indianGrouped formats a non-negative whole-number digit string with Indian digit
// grouping (last 3 digits, then groups of 2): e.g. "1234567" -> "12,34,567" — matching
// the en-IN formatting used everywhere else in this app (frontend lib/purchaseBill.ts).
func indianGrouped(digits string) string {
	if len(digits) <= 3 {
		return digits
	}
	head := digits[:len(digits)-3]
	tail := digits[len(digits)-3:]
	var groups []string
	for len(head) > 2 {
		groups = append([]string{head[len(head)-2:]}, groups...)
		head = head[:len(head)-2]
	}
	if head != "" {
		groups = append([]string{head}, groups...)
	}
	groups = append(groups, tail)
	return strings.Join(groups, ",")
}

// fmtOrderMoney formats an amount as 2-decimal, Indian-grouped text, matching the
// frontend's fmt() (lib/purchaseBill.ts) — reimplemented in Go since the PDF's cell
// text is drawn directly, not rendered through a spreadsheet engine like Excel's cells.
func fmtOrderMoney(n float64) string {
	neg := n < 0
	if neg {
		n = -n
	}
	whole := int64(n)
	frac := int64((n-float64(whole))*100 + 0.5)
	if frac >= 100 {
		whole++
		frac -= 100
	}
	s := fmt.Sprintf("%s.%02d", indianGrouped(strconv.FormatInt(whole, 10)), frac)
	if neg {
		s = "-" + s
	}
	return s
}

// fmtOrderQty formats a quantity as a whole, Indian-grouped number, matching the
// frontend's fmtQty().
func fmtOrderQty(n float64) string {
	neg := n < 0
	if neg {
		n = -n
	}
	whole := int64(n + 0.5)
	s := indianGrouped(strconv.FormatInt(whole, 10))
	if neg {
		s = "-" + s
	}
	return s
}
