// Column definitions + Totals for the on-screen report views (Reports → View). They mirror the
// Excel exports in internal/reports (purchase_summary.go, stock_report.go, order_report.go)
// header-for-header and total-for-total, so what you see is what you download. The row data is
// the same already-computed rows that get handed to Go; nothing is re-derived here.

import {reports} from '../../wailsjs/go/models';
import {fmt, fmtQty} from '@/lib/purchaseBill';

export interface ReportColumn<R> {
    header: string;
    align?: 'left' | 'center' | 'right';
    cell: (row: R) => string;
    // Text for the bold Totals row: a fixed label, or a sum over the rows.
    total?: string | ((rows: R[]) => string);
}

const sum = <R,>(rows: R[], pick: (r: R) => number) => rows.reduce((s, r) => s + pick(r), 0);
const plain = (n: number) => String(n);
const pct = (n: number) => `${n}%`;

export const purchaseSummaryColumns: ReportColumn<reports.PurchaseSummaryRow>[] = [
    {header: 'Date', align: 'center', cell: (r) => r.date},
    {header: 'Company', cell: (r) => r.companyName},
    {header: 'Bill No.', align: 'center', cell: (r) => r.billNumber},
    {header: 'Item', cell: (r) => r.itemName, total: 'Totals'},
    {header: 'HSN', align: 'center', cell: (r) => plain(r.hsn)},
    {header: 'Pack Size', align: 'center', cell: (r) => plain(r.packSize)},
    {header: 'Tax Qty', align: 'center', cell: (r) => fmtQty(r.taxQty), total: (rs) => fmtQty(sum(rs, (r) => r.taxQty))},
    {header: 'Tax Value', align: 'right', cell: (r) => fmt(r.taxValue), total: (rs) => fmt(sum(rs, (r) => r.taxValue))},
    {header: 'D Qty', align: 'center', cell: (r) => fmtQty(r.dQty), total: (rs) => fmtQty(sum(rs, (r) => r.dQty))},
    {header: 'D Value', align: 'right', cell: (r) => fmt(r.dValue), total: (rs) => fmt(sum(rs, (r) => r.dValue))},
    {header: 'GST %', align: 'center', cell: (r) => pct(r.gstPercent)},
    {header: 'GST Amount', align: 'right', cell: (r) => fmt(r.gstAmount), total: (rs) => fmt(sum(rs, (r) => r.gstAmount))},
    {header: 'Tax Bill Amount', align: 'right', cell: (r) => fmt(r.taxBillAmount), total: (rs) => fmt(sum(rs, (r) => r.taxBillAmount))},
    {header: 'Bill Value', align: 'right', cell: (r) => fmt(r.billValue), total: (rs) => fmt(sum(rs, (r) => r.billValue))},
    {header: 'Billing Rate', align: 'right', cell: (r) => fmt(r.billingRate)},
    {header: 'Final Rate', align: 'right', cell: (r) => fmt(r.finalRate)},
    {header: 'Discount', align: 'right', cell: (r) => fmt(r.discount), total: (rs) => fmt(sum(rs, (r) => r.discount))},
    {header: 'Remarks', cell: (r) => r.remarks},
];

// Negative Quantity means negative stock: no value makes sense, so the four money cells are blank
// and left out of the P&L / GST Value totals (same rule as stock_report.go).
const hasValue = (r: reports.StockReportRow) => r.quantity >= 0;
const money = (r: reports.StockReportRow, v: number) => (hasValue(r) ? fmt(v) : '');

export const stockReportColumns: ReportColumn<reports.StockReportRow>[] = [
    {header: 'Company', cell: (r) => r.companyName},
    {header: 'Item', cell: (r) => r.itemName, total: 'Totals'},
    {header: 'Pack Size', align: 'center', cell: (r) => plain(r.packSize)},
    {header: 'HSN', align: 'center', cell: (r) => plain(r.hsn)},
    {header: 'GST %', align: 'center', cell: (r) => pct(r.gstPercent)},
    {header: 'Quantity', align: 'center', cell: (r) => fmtQty(r.quantity), total: (rs) => fmtQty(sum(rs, (r) => r.quantity))},
    {header: 'Final Rate', align: 'right', cell: (r) => money(r, r.finalRate)},
    {header: 'Billing Rate', align: 'right', cell: (r) => money(r, r.billingRate)},
    {
        header: 'P&L',
        align: 'right',
        cell: (r) => money(r, r.profitLoss),
        total: (rs) => fmt(sum(rs.filter(hasValue), (r) => r.profitLoss)),
    },
    {
        header: 'GST Value',
        align: 'right',
        cell: (r) => money(r, r.gstValue),
        total: (rs) => fmt(sum(rs.filter(hasValue), (r) => r.gstValue)),
    },
    {
        header: 'Quantity incl. Undelivered',
        align: 'center',
        cell: (r) => fmtQty(r.quantityInclUndelivered),
        total: (rs) => fmtQty(sum(rs, (r) => r.quantityInclUndelivered)),
    },
];

export const orderReportColumns: ReportColumn<reports.OrderReportRow>[] = [
    {header: 'Delivery #', align: 'center', cell: (r) => (r.deliveryNo > 0 ? plain(r.deliveryNo) : '')},
    {header: 'Date', align: 'center', cell: (r) => r.date},
    {header: 'Customer', cell: (r) => r.customerName},
    {header: 'City', cell: (r) => r.customerCity},
    {header: 'Qty', align: 'center', cell: (r) => fmtQty(r.qty), total: (rs) => fmtQty(sum(rs, (r) => r.qty))},
    {header: 'Item', cell: (r) => r.itemName, total: 'Totals'},
    {header: 'Pack Size', align: 'center', cell: (r) => plain(r.packSize)},
    {header: 'Rate', align: 'right', cell: (r) => fmt(r.rate)},
    {header: 'Final Amount', align: 'right', cell: (r) => fmt(r.finalAmount), total: (rs) => fmt(sum(rs, (r) => r.finalAmount))},
    {header: 'Company', cell: (r) => r.companyName},
    {header: 'GST %', align: 'center', cell: (r) => pct(r.gstPercent)},
    {header: 'HSN', align: 'center', cell: (r) => plain(r.hsn)},
    {header: 'Delivered?', align: 'center', cell: (r) => (r.delivered ? 'Yes' : 'No')},
];

// Resolves a column's Totals cell text ('' when the column has none).
export function totalCell<R>(col: ReportColumn<R>, rows: R[]): string {
    if (col.total === undefined) return '';
    return typeof col.total === 'string' ? col.total : col.total(rows);
}
