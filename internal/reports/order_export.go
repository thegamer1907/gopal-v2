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

// headerYellow is #FFD966 — the shared brand color for the customer-facing export
// header/footer bars, matching ShareableOrderImage.tsx exactly.
var headerYellow = [3]uint8{0xFF, 0xD9, 0x66}

const orderSheetName = "Order"

// WriteOrderExcel writes a single order to a new workbook at path, styled to match
// ShareableOrderImage.tsx: a merged yellow customer/date header bar, a yellow bold
// column-header row, black-bordered white data rows, and a bold yellow totals row.
func WriteOrderExcel(path string, header OrderExportHeader, rows []OrderExportRow) error {
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
	if err := writeOrderTotals(f, rows, totalsRow); err != nil {
		return err
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

func writeOrderHeaderBar(f *excelize.File, header OrderExportHeader) error {
	leftStyle, err := orderCellStyle(f, headerYellowHex, "left", true, "")
	if err != nil {
		return err
	}
	rightStyle, err := orderCellStyle(f, headerYellowHex, "right", true, "")
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

func writeOrderTotals(f *excelize.File, rows []OrderExportRow, totalsRow int) error {
	var qty, amount float64
	for _, r := range rows {
		qty += r.Qty
		amount += r.FinalAmount
	}

	qtyStyle, err := orderCellStyle(f, headerYellowHex, "center", true, "0")
	if err != nil {
		return err
	}
	blankStyle, err := orderCellStyle(f, headerYellowHex, "left", false, "")
	if err != nil {
		return err
	}
	labelStyle, err := orderCellStyle(f, headerYellowHex, "right", true, "")
	if err != nil {
		return err
	}
	amountStyle, err := orderCellStyle(f, headerYellowHex, "right", true, "#,##0.00")
	if err != nil {
		return err
	}

	if err := setOrderCell(f, "A", totalsRow, qty, qtyStyle); err != nil {
		return err
	}
	if err := setOrderCell(f, "B", totalsRow, "", blankStyle); err != nil {
		return err
	}
	if err := setOrderCell(f, "C", totalsRow, "", blankStyle); err != nil {
		return err
	}
	if err := setOrderCell(f, "D", totalsRow, "Total", labelStyle); err != nil {
		return err
	}
	return setOrderCell(f, "E", totalsRow, amount, amountStyle)
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
)

// WriteOrderPDF writes a single order to a new PDF at path, in the same visual style
// as WriteOrderExcel/ShareableOrderImage.tsx, using the bundled Nunito font (no
// built-in fonts exist in the gopdf library).
func WriteOrderPDF(path string, header OrderExportHeader, rows []OrderExportRow) error {
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

	labelWidth := pdfColWidths[0] + pdfColWidths[1] + pdfColWidths[2]
	dateWidth := pdfColWidths[3] + pdfColWidths[4]
	if err := drawOrderCell(&pdf, x0, y, labelWidth, pdfHeaderRowHeight, header.CustomerLabel, gopdf.Left, true, &headerYellow); err != nil {
		return err
	}
	if err := drawOrderCell(&pdf, x0+labelWidth, y, dateWidth, pdfHeaderRowHeight, header.Date, gopdf.Right, true, &headerYellow); err != nil {
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
		cells := []string{fmtPdfQty(r.Qty), r.ItemName, fmtPdfQty(r.PackSize), fmtPdfMoney(r.Rate), fmtPdfMoney(r.FinalAmount)}
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
	if err := drawOrderCell(&pdf, pdfColX(0, x0), y, pdfColWidths[0], pdfRowHeight, fmtPdfQty(totalQty), gopdf.Center, true, &headerYellow); err != nil {
		return err
	}
	if err := drawOrderCell(&pdf, pdfColX(1, x0), y, pdfColWidths[1], pdfRowHeight, "", gopdf.Left, false, &headerYellow); err != nil {
		return err
	}
	if err := drawOrderCell(&pdf, pdfColX(2, x0), y, pdfColWidths[2], pdfRowHeight, "", gopdf.Left, false, &headerYellow); err != nil {
		return err
	}
	if err := drawOrderCell(&pdf, pdfColX(3, x0), y, pdfColWidths[3], pdfRowHeight, "Total", gopdf.Right, true, &headerYellow); err != nil {
		return err
	}
	if err := drawOrderCell(&pdf, pdfColX(4, x0), y, pdfColWidths[4], pdfRowHeight, fmtPdfMoney(totalAmount), gopdf.Right, true, &headerYellow); err != nil {
		return err
	}

	if err := pdf.WritePdf(path); err != nil {
		return fmt.Errorf("write pdf %q: %w", path, err)
	}
	return nil
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

// fmtPdfMoney formats an amount as 2-decimal, Indian-grouped text, matching the
// frontend's fmt() (lib/purchaseBill.ts) — reimplemented in Go since the PDF's cell
// text is drawn directly, not rendered through a spreadsheet engine like Excel's cells.
func fmtPdfMoney(n float64) string {
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

// fmtPdfQty formats a quantity as a whole, Indian-grouped number, matching the
// frontend's fmtQty().
func fmtPdfQty(n float64) string {
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
