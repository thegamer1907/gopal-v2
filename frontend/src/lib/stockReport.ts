// Stock Report row math, kept pure (no React) so it can be unit-tested. Reports.tsx feeds it
// the already-loaded items/bills/orders and the as-of date.

import {db, reports} from '../../wailsjs/go/models';
import {parseDate} from '@/lib/date';
import {calcLine} from '@/lib/purchaseBill';

// computeStockRows sums every purchase/sale line up to (and including) the cutoff date
// — the same purchased-minus-sold formula items.go's itemSelect uses for the live
// "today" stock figure, just re-derived here per item so an arbitrary past date can be
// asked for too (dates can't be filtered in SQL — see the file header note).
export function computeStockRows(
    items: db.Item[],
    bills: db.PurchaseBill[],
    orders: db.SalesOrder[],
    cutoff: Date | undefined,
): reports.StockReportRow[] {
    if (!cutoff) return [];
    const cutoffEnd = new Date(cutoff.getFullYear(), cutoff.getMonth(), cutoff.getDate(), 23, 59, 59, 999);

    // Per item: total purchased, plus its LATEST purchase-bill line on/before the cutoff
    // (greatest date, then highest bill id; within a bill, the last line for that item) —
    // that line's rates drive the Final/Billing Rate columns.
    const purchasedByItem = new Map<number, number>();
    const latestLine = new Map<number, {date: Date; billId: number; line: db.PurchaseBillItem}>();
    for (const bill of bills) {
        const d = parseDate(bill.date);
        if (!d || d > cutoffEnd) continue;
        for (const it of bill.items) {
            purchasedByItem.set(it.itemId, (purchasedByItem.get(it.itemId) ?? 0) + it.taxQty + it.dQty);
            const prev = latestLine.get(it.itemId);
            if (!prev || d > prev.date || (d.getTime() === prev.date.getTime() && bill.id >= prev.billId)) {
                latestLine.set(it.itemId, {date: d, billId: bill.id, line: it});
            }
        }
    }

    // Main Quantity counts delivered orders only; the last column also counts undelivered
    // ones (a delivered order's date is its delivery date, so the cutoff applies as-is).
    const soldAllByItem = new Map<number, number>();
    const soldDeliveredByItem = new Map<number, number>();
    for (const order of orders) {
        const d = parseDate(order.date);
        if (!d || d > cutoffEnd) continue;
        for (const it of order.items) {
            soldAllByItem.set(it.itemId, (soldAllByItem.get(it.itemId) ?? 0) + it.qty);
            if (order.delivered) {
                soldDeliveredByItem.set(it.itemId, (soldDeliveredByItem.get(it.itemId) ?? 0) + it.qty);
            }
        }
    }

    return items
        .map((item) => {
            const purchased = purchasedByItem.get(item.id) ?? 0;
            return {
                item,
                quantity: purchased - (soldDeliveredByItem.get(item.id) ?? 0),
                quantityInclUndelivered: purchased - (soldAllByItem.get(item.id) ?? 0),
            };
        })
        .filter(({quantity, quantityInclUndelivered}) => quantity !== 0 || quantityInclUndelivered !== 0)
        .map(({item, quantity, quantityInclUndelivered}) => {
            const latest = latestLine.get(item.id)?.line;
            const {finalRate, billingRate} = latest
                ? calcLine({
                      taxQty: latest.taxQty,
                      taxValue: latest.taxValue,
                      dQty: latest.dQty,
                      dValue: latest.dValue,
                      gstPercent: latest.gstPercent,
                      packSize: latest.itemPackSize,
                  })
                : {finalRate: 0, billingRate: 0};
            return reports.StockReportRow.createFrom({
                companyName: item.companyName,
                itemName: item.name,
                packSize: item.packSize,
                hsn: item.hsn,
                gstPercent: item.gstPercent,
                quantity,
                quantityInclUndelivered,
                finalRate,
                billingRate,
                profitLoss: item.packSize * quantity * finalRate,
                gstValue: quantity * billingRate,
            });
        });
}

