// Per-item history of past purchase final rates, for Add Purchase Bill's "Last Final Rate"
// column and its history dialog. Pure (no React) so it can be unit-tested. Derived on read
// from the saved bills, never stored.

import {db} from '../../wailsjs/go/models';
import {parseDate} from '@/lib/date';
import {calcLine} from '@/lib/purchaseBill';

export interface FinalRateEntry {
    date: string; // as stored on the bill
    billNumber: string;
    billId: number;
    finalRate: number;
}

// finalRateHistoryByItem maps itemId → that item's past final rates, newest first (greatest
// bill date, then highest bill id — the same "latest" rule as latestLineByItem in
// lib/stockReport.ts; lines of one item within a bill keep their reverse line order).
// `excludeBillId` leaves out the bill being edited, whose saved numbers may differ from what
// is on screen. Bills with an unparsable date are skipped.
export function finalRateHistoryByItem(
    bills: db.PurchaseBill[],
    excludeBillId?: number | null,
): Map<number, FinalRateEntry[]> {
    const rows = new Map<number, {time: number; seq: number; entry: FinalRateEntry}[]>();
    let seq = 0;
    for (const bill of bills) {
        if (excludeBillId != null && bill.id === excludeBillId) continue;
        const d = parseDate(bill.date);
        if (!d) continue;
        for (const line of bill.items) {
            const {finalRate} = calcLine({
                taxQty: line.taxQty,
                taxValue: line.taxValue,
                dQty: line.dQty,
                dValue: line.dValue,
                gstPercent: line.gstPercent,
                packSize: line.itemPackSize,
            });
            const list = rows.get(line.itemId) ?? [];
            list.push({
                time: d.getTime(),
                seq: seq++,
                entry: {date: bill.date, billNumber: bill.billNumber, billId: bill.id, finalRate},
            });
            rows.set(line.itemId, list);
        }
    }
    const out = new Map<number, FinalRateEntry[]>();
    for (const [itemId, list] of rows) {
        list.sort((a, b) => b.time - a.time || b.entry.billId - a.entry.billId || b.seq - a.seq);
        out.set(itemId, list.map((r) => r.entry));
    }
    return out;
}
