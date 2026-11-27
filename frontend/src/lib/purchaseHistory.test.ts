import {describe, expect, it} from 'vitest';
import {db} from '../../wailsjs/go/models';
import {finalRateHistoryByItem} from './purchaseHistory';

// Final rate = taxValue / taxQty with 0% GST, no D lines and pack size 1.
const line = (itemId: number, taxValue: number) =>
    db.PurchaseBillItem.createFrom({itemId, taxQty: 10, taxValue, dQty: 0, dValue: 0, gstPercent: 0, itemPackSize: 1});
const bill = (id: number, date: string, billNumber: string, items: db.PurchaseBillItem[]) =>
    db.PurchaseBill.createFrom({id, date, billNumber, items});

describe('finalRateHistoryByItem', () => {
    it('orders newest first by date, then bill id', () => {
        const h = finalRateHistoryByItem([
            bill(1, '15-Jul-26', 'A', [line(1, 100)]),
            bill(3, '14-Aug-26', 'C', [line(1, 300)]),
            bill(2, '29-Aug-26', 'B', [line(1, 200)]),
            bill(4, '14-Aug-26', 'D', [line(1, 400)]),
        ]).get(1)!;
        expect(h.map((e) => e.billNumber)).toEqual(['B', 'D', 'C', 'A']);
        expect(h.map((e) => e.finalRate)).toEqual([20, 40, 30, 10]);
    });

    it('excludes the bill being edited', () => {
        const bills = [bill(1, '01-Jan-26', 'A', [line(1, 100)]), bill(2, '02-Jan-26', 'B', [line(1, 200)])];
        expect(finalRateHistoryByItem(bills, 2).get(1)!.map((e) => e.billNumber)).toEqual(['A']);
        expect(finalRateHistoryByItem(bills, null).get(1)!).toHaveLength(2);
    });

    it('keeps each line when an item appears twice in one bill; later line first', () => {
        const h = finalRateHistoryByItem([bill(1, '01-Jan-26', 'A', [line(1, 100), line(1, 200)])]).get(1)!;
        expect(h.map((e) => e.finalRate)).toEqual([20, 10]);
    });

    it('skips unparsable dates and omits items with no history', () => {
        const m = finalRateHistoryByItem([bill(1, 'garbage', 'A', [line(1, 100)]), bill(2, '01-Jan-26', 'B', [line(2, 100)])]);
        expect(m.has(1)).toBe(false);
        expect(m.get(2)).toHaveLength(1);
        expect(m.has(3)).toBe(false);
    });
});
