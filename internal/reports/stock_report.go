package reports

import (
	"fmt"

	"github.com/xuri/excelize/v2"
)

// StockReportRow is one item's stock as of a chosen date, fully computed by the caller
// (see Reports.tsx's computeStockRows, which sums purchase/sale lines up to the cutoff
// date — see docs/DECISIONS.md for why that math happens in the frontend, not SQL).
type StockReportRow struct {
	CompanyName string  `json:"companyName"`
	ItemName    string  `json:"itemName"`
	PackSize    float64 `json:"packSize"`
	HSN         int64   `json:"hsn"`
	Stock       float64 `json:"stock"`
}

const stockSheetName = "Stock Report"

// Column layout (1-based). Keep in sync with the header/style setup below.
const (
	colSRCompany = iota + 1
	colSRItem
	colSRPackSize
	colSRHSN
	colSRStock
	colSRCount = colSRStock
)

var stockHeaders = [colSRCount]string{
	colSRCompany - 1:  "Company",
	colSRItem - 1:     "Item",
	colSRPackSize - 1: "Pack Size",
	colSRHSN - 1:      "HSN",
	colSRStock - 1:    "Stock",
}

// WriteStockReport writes rows to a new "Stock Report" workbook at path: a merged title
// row naming the as-of date (there's no per-row date column to convey this otherwise),
// a bold header, and a frozen + auto-filtered header row. No Totals row — summing stock
// across different items/pack sizes isn't meaningful.
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
	if err := finishStockLayout(f, lastDataRow); err != nil {
		return err
	}

	if err := f.SaveAs(path); err != nil {
		return fmt.Errorf("save %q: %w", path, err)
	}
	return nil
}

func applyStockColumnStyles(f *excelize.File) error {
	qtyFmt := "0"
	qtyStyle, err := f.NewStyle(&excelize.Style{CustomNumFmt: &qtyFmt})
	if err != nil {
		return fmt.Errorf("qty style: %w", err)
	}
	return applyColStyleOn(f, stockSheetName, []int{colSRPackSize, colSRHSN, colSRStock}, qtyStyle)
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
	return f.SetCellStyle(stockSheetName, "A2", last, boldStyle)
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
		values[colSRStock-1] = r.Stock

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

func finishStockLayout(f *excelize.File, lastDataRow int) error {
	lastCol, err := excelize.ColumnNumberToName(colSRCount)
	if err != nil {
		return err
	}
	if err := f.SetColWidth(stockSheetName, "A", lastCol, 14); err != nil {
		return err
	}
	if err := f.SetColWidth(stockSheetName, "B", "B", 22); err != nil { // Item name, wider
		return err
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
