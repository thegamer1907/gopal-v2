package reports

import (
	_ "embed" // required by //go:embed even though we embed into []byte, not embed.FS
	"fmt"
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
	f := excelize.NewFile()
	defer f.Close()

	if _, err := f.NewSheet(orderSheetName); err != nil {
		return fmt.Errorf("create sheet: %w", err)
	}
	if err := f.DeleteSheet("Sheet1"); err != nil {
		return fmt.Errorf("delete default sheet: %w", err)
	}
	idx, err := f.GetSheetIndex(orderSheetName)
	if err != nil {
		return fmt.Errorf("sheet index: %w", err)
	}
	f.SetActiveSheet(idx)

	if err := writeOrderHeaderBar(f, header); err != nil {
		return err
	}
	if err := writeOrderColumnHeaders(f); err != nil {
		return err
	}
	totalsRow, err := writeOrderRows(f, rows)
	if err != nil {
		return err
	}
	grossAmount, err := writeOrderTotals(f, rows, totalsRow)
	if err != nil {
		return err
	}
	if len(deductions) > 0 {
		nextRow, err := writeOrderDeductions(f, deductions, totalsRow+1)
		if err != nil {
			return err
		}
		var deductionTotal float64
		for _, d := range deductions {
			deductionTotal += d.Value
		}
		if err := writeOrderNetTotal(f, grossAmount-deductionTotal, nextRow); err != nil {
			return err
		}
	}
	if err := finishOrderLayout(f); err != nil {
		return err
	}

	if err := f.SaveAs(path); err != nil {
		return fmt.Errorf("save %q: %w", path, err)
	}
	return nil
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

	x0 := pdfMarginPt
	y := pdfMarginPt

	if err := drawOrderHeaderBar(&pdf, x0, y, header.CustomerLabel, header.Date); err != nil {
		return err
	}
	y += pdfHeaderRowHeight

	if err := drawOrderColumnHeaderRow(&pdf, x0, y); err != nil {
		return err
	}
	y += pdfHeaderRowHeight

	aligns := []int{gopdf.Center, gopdf.Left, gopdf.Center, gopdf.Right, gopdf.Right}
	var totalQty, totalAmount float64
	for _, r := range rows {
		if y+pdfRowHeight > gopdf.PageSizeA4.H-pdf.MarginBottom() {
			pdf.AddPage()
			y = pdf.MarginTop()
			if err := drawOrderColumnHeaderRow(&pdf, x0, y); err != nil {
				return err
			}
			y += pdfHeaderRowHeight
		}
		cells := []string{fmtOrderQty(r.Qty), r.ItemName, fmtOrderQty(r.PackSize), fmtOrderMoney(r.Rate), fmtOrderMoney(r.FinalAmount)}
		for i, c := range cells {
			if err := drawOrderCell(&pdf, pdfColX(i, x0), y, pdfColWidths[i], pdfRowHeight, c, aligns[i], false, nil); err != nil {
				return err
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
	if err := drawOrderTotalRow(&pdf, x0, y, fmtOrderQty(totalQty), totalAmount, false); err != nil {
		return err
	}
	y += pdfRowHeight

	if len(deductions) > 0 {
		var deductionTotal float64
		for _, d := range deductions {
			if y+pdfRowHeight > gopdf.PageSizeA4.H-pdf.MarginBottom() {
				pdf.AddPage()
				y = pdf.MarginTop()
			}
			verb, units, value := "Less", d.Units, d.Value
			if units < 0 {
				verb, units, value = "Add", -units, -value
			}
			label := fmt.Sprintf("%s: %s — %s", verb, fmtOrderQty(units), d.ItemName)
			labelWidth := pdfColWidths[0] + pdfColWidths[1] + pdfColWidths[2] + pdfColWidths[3]
			if err := drawOrderCell(&pdf, x0, y, labelWidth, pdfRowHeight, label, gopdf.Right, false, nil); err != nil {
				return err
			}
			if err := drawOrderCell(&pdf, pdfColX(4, x0), y, pdfColWidths[4], pdfRowHeight, fmtOrderMoney(value), gopdf.Right, false, nil); err != nil {
				return err
			}
			deductionTotal += d.Value
			y += pdfRowHeight
		}

		if y+pdfRowHeight > gopdf.PageSizeA4.H-pdf.MarginBottom() {
			pdf.AddPage()
			y = pdf.MarginTop()
		}
		if err := drawOrderTotalRow(&pdf, x0, y, "", totalAmount-deductionTotal, true); err != nil {
			return err
		}
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
func drawOrderTotalRow(pdf *gopdf.GoPdf, x0, y float64, qty string, amount float64, mergeQty bool) error {
	if mergeQty {
		labelWidth := pdfColWidths[0] + pdfColWidths[1] + pdfColWidths[2] + pdfColWidths[3]
		if err := drawOrderCell(pdf, pdfColX(0, x0), y, labelWidth, pdfRowHeight, "Total", gopdf.Right, true, &headerYellow); err != nil {
			return err
		}
	} else {
		if err := drawOrderCell(pdf, pdfColX(0, x0), y, pdfColWidths[0], pdfRowHeight, qty, gopdf.Center, true, &headerYellow); err != nil {
			return err
		}
		labelWidth := pdfColWidths[1] + pdfColWidths[2] + pdfColWidths[3]
		if err := drawOrderCell(pdf, pdfColX(1, x0), y, labelWidth, pdfRowHeight, "Total", gopdf.Right, true, &headerYellow); err != nil {
			return err
		}
	}
	return drawOrderCell(pdf, pdfColX(4, x0), y, pdfColWidths[4], pdfRowHeight, fmtOrderMoney(amount), gopdf.Right, true, &headerYellow)
}

// drawOrderHeaderBar draws the customer-label/date header as a single bordered, filled
// rect (no dividing line down the middle, unlike two separately-bordered cells) with
// the label left-aligned and the date right-aligned inside it, at pdfHeaderFontSize.
func drawOrderHeaderBar(pdf *gopdf.GoPdf, x0, y float64, label, date string) error {
	labelWidth := pdfColWidths[0] + pdfColWidths[1] + pdfColWidths[2]
	totalWidth := labelWidth + pdfColWidths[3] + pdfColWidths[4]

	pdf.SetFillColor(headerYellow[0], headerYellow[1], headerYellow[2])
	pdf.RectFromUpperLeftWithStyle(x0, y, totalWidth, pdfHeaderRowHeight, "FD")

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

func drawOrderColumnHeaderRow(pdf *gopdf.GoPdf, x0, y float64) error {
	headers := []string{"Qty", "Item", "Unit", "Rate", "Amount"}
	aligns := []int{gopdf.Center, gopdf.Left, gopdf.Center, gopdf.Right, gopdf.Right}
	for i, h := range headers {
		if err := drawOrderCell(pdf, pdfColX(i, x0), y, pdfColWidths[i], pdfHeaderRowHeight, h, aligns[i], true, &headerYellow); err != nil {
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

func pdfColX(i int, startX float64) float64 {
	x := startX
	for j := 0; j < i; j++ {
		x += pdfColWidths[j]
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
