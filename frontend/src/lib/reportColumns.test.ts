import {describe, expect, it} from 'vitest';
import {reports} from '../../wailsjs/go/models';
import {
    orderReportColumns,
    purchaseSummaryColumns,
    stockReportColumns,
    totalCell,
} from '@/lib/reportColumns';

const headers = (cols: {header: string}[]) => cols.map((c) => c.header);

describe('report view columns mirror the Excel headers', () => {
    it('Purchase Summary', () => {
        expect(headers(purchaseSummaryColumns)).toEqual([
            'Date', 'Company', 'Bill No.', 'Item', 'HSN', 'Pack Size', 'Tax Qty', 'Tax Value', 'D Qty', 'D Value',
            'GST %', 'GST Amount', 'Tax Bill Amount', 'Bill Value', 'Billing Rate', 'Final Rate', 'Discount', 'Remarks',
        ]);
    });
    it('Stock Report', () => {
        expect(headers(stockReportColumns)).toEqual([
            'Company', 'Item', 'Pack Size', 'HSN', 'GST %', 'Quantity', 'Final Rate', 'Billing Rate', 'P&L', 'GST Value',
            'Quantity incl. Undelivered',
        ]);
    });
    it('Sales Report', () => {
        expect(headers(orderReportColumns)).toEqual([
            'Date', 'Customer', 'City', 'Company', 'Item', 'Pack Size', 'GST %', 'HSN', 'Qty', 'Rate', 'Final Amount', 'Delivered?', 'Delivery #',
        ]);
    });
});

describe('Purchase Summary totals', () => {
    const rows = [
        reports.PurchaseSummaryRow.createFrom({taxQty: 2, taxValue: 100.5, dQty: 1, dValue: 10, gstAmount: 5, taxBillAmount: 105.5, billValue: 115.5, discount: 1, billingRate: 50, finalRate: 40}),
        reports.PurchaseSummaryRow.createFrom({taxQty: 3, taxValue: 200, dQty: 0, dValue: 0, gstAmount: 10, taxBillAmount: 210, billValue: 210, discount: 2, billingRate: 60, finalRate: 55}),
    ];
    const totals = Object.fromEntries(purchaseSummaryColumns.map((c) => [c.header, totalCell(c, rows)]));

    it('sums only the quantity and money columns the Excel sums, labels Item', () => {
        expect(totals).toMatchObject({
            Item: 'Totals', 'Tax Qty': '5', 'Tax Value': '300.50', 'D Qty': '1', 'D Value': '10.00',
            'GST Amount': '15.00', 'Tax Bill Amount': '315.50', 'Bill Value': '325.50', Discount: '3.00',
        });
        for (const h of ['Date', 'Company', 'HSN', 'Pack Size', 'GST %', 'Billing Rate', 'Final Rate', 'Remarks']) {
            expect(totals[h]).toBe('');
        }
    });
});

describe('Stock Report cells and totals', () => {
    const pos = reports.StockReportRow.createFrom({itemName: 'A', quantity: 5, quantityInclUndelivered: 3, finalRate: 2, billingRate: 3, profitLoss: 100, gstValue: 15, gstPercent: 5});
    const neg = reports.StockReportRow.createFrom({itemName: 'B', quantity: -2, quantityInclUndelivered: -4, finalRate: 2, billingRate: 3, profitLoss: -40, gstValue: -6, gstPercent: 5});
    const col = (h: string) => stockReportColumns.find((c) => c.header === h)!;

    it('blanks the money cells for negative quantity but still shows the quantities', () => {
        for (const h of ['Final Rate', 'Billing Rate', 'P&L', 'GST Value']) {
            expect(col(h).cell(neg)).toBe('');
            expect(col(h).cell(pos)).not.toBe('');
        }
        expect(col('Quantity').cell(neg)).toBe('-2');
        expect(col('Quantity incl. Undelivered').cell(neg)).toBe('-4');
    });

    it('sums quantities over all rows but P&L / GST Value over non-negative rows only', () => {
        expect(totalCell(col('Quantity'), [pos, neg])).toBe('3');
        expect(totalCell(col('Quantity incl. Undelivered'), [pos, neg])).toBe('-1');
        expect(totalCell(col('P&L'), [pos, neg])).toBe('100.00');
        expect(totalCell(col('GST Value'), [pos, neg])).toBe('15.00');
        expect(totalCell(col('Item'), [pos, neg])).toBe('Totals');
    });
});

describe('Sales Report cells and totals', () => {
    const a = reports.OrderReportRow.createFrom({qty: 4, rate: 10, finalAmount: 400, delivered: true, deliveryNo: 7});
    const b = reports.OrderReportRow.createFrom({qty: 6, rate: 12, finalAmount: 720, delivered: false, deliveryNo: 0});
    const col = (h: string) => orderReportColumns.find((c) => c.header === h)!;

    it('shows Yes/No and the delivery number only once delivered', () => {
        expect(col('Delivered?').cell(a)).toBe('Yes');
        expect(col('Delivered?').cell(b)).toBe('No');
        expect(col('Delivery #').cell(a)).toBe('7');
        expect(col('Delivery #').cell(b)).toBe('');
    });

    it('totals only Qty and Final Amount', () => {
        expect(totalCell(col('Qty'), [a, b])).toBe('10');
        expect(totalCell(col('Final Amount'), [a, b])).toBe('1,120.00');
        expect(totalCell(col('Rate'), [a, b])).toBe('');
    });
});
