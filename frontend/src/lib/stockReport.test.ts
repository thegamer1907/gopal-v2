import {describe, expect, it} from 'vitest';
import {db} from '../../wailsjs/go/models';
import {computeStockRows} from '@/lib/stockReport';

const item = (id: number, name: string) =>
    db.Item.createFrom({id, companyName: 'Acme', name, packSize: 10, gstPercent: 5, hsn: 1704});

const bill = (id: number, date: string, itemId: number, qty: number) =>
    db.PurchaseBill.createFrom({
        id,
        date,
        items: [
            db.PurchaseBillItem.createFrom({
                itemId,
                itemPackSize: 10,
                gstPercent: 5,
                taxQty: qty,
                taxValue: 100,
                dQty: 0,
                dValue: 0,
            }),
        ],
    });

const order = (id: number, date: string, delivered: boolean, itemId: number, qty: number) =>
    db.SalesOrder.createFrom({
        id,
        date,
        delivered,
        items: [db.SalesOrderItem.createFrom({itemId, qty})],
    });

const asOf = new Date(2026, 9, 29);

describe('computeStockRows', () => {
    it('counts delivered orders in Quantity and all orders in Quantity incl. Undelivered', () => {
        const rows = computeStockRows(
            [item(1, 'A')],
            [bill(1, '01-Oct-26', 1, 100)],
            [order(1, '05-Oct-26', true, 1, 10), order(2, '06-Oct-26', false, 1, 25)],
            asOf,
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].quantity).toBe(90);
        expect(rows[0].quantityInclUndelivered).toBe(65);
    });

    it('hides an item only when both quantities are 0', () => {
        const items = [item(1, 'A'), item(2, 'B'), item(3, 'C')];
        const bills = [bill(1, '01-Oct-26', 1, 5), bill(2, '01-Oct-26', 2, 5)];
        const orders = [
            order(1, '02-Oct-26', true, 1, 5), // A: 0 delivered, 0 all → hidden
            order(2, '02-Oct-26', false, 2, 5), // B: 5 delivered, 0 all → shown
        ];
        const rows = computeStockRows(items, bills, orders, asOf);
        expect(rows.map((r) => r.itemName)).toEqual(['B']);
        expect(rows[0].quantity).toBe(5);
        expect(rows[0].quantityInclUndelivered).toBe(0);
    });

    it('shows negative delivered stock', () => {
        const rows = computeStockRows(
            [item(1, 'A')],
            [bill(1, '01-Oct-26', 1, 3)],
            [order(1, '05-Oct-26', true, 1, 8)],
            asOf,
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].quantity).toBe(-5);
        expect(rows[0].quantityInclUndelivered).toBe(-5);
    });

    it('ignores bills and orders after the as-of date', () => {
        const rows = computeStockRows(
            [item(1, 'A')],
            [bill(1, '01-Oct-26', 1, 10), bill(2, '20-Oct-26', 1, 50)],
            [order(1, '25-Oct-26', true, 1, 4)],
            new Date(2026, 9, 10),
        );
        expect(rows[0].quantity).toBe(10);
    });

    it('is empty without a cutoff date', () => {
        expect(computeStockRows([item(1, 'A')], [], [], undefined)).toEqual([]);
    });
});
