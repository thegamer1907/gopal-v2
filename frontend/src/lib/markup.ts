// Optional markup % on Add Order's "Final Rate" column: the item's own markup overrides its
// company's; neither set → no markup. Kept pure (no React) so it can be unit-tested.

import {db} from '../../wailsjs/go/models';
import {calcLine} from '@/lib/purchaseBill';
import {latestLineByItem} from '@/lib/stockReport';

// effectiveMarkup: the item's own markup if set (0 counts — it cancels the company's), else
// the company's, else 0.
export function effectiveMarkup(item: {markupPercent?: number | null; companyMarkupPercent?: number | null}): number {
    return item.markupPercent ?? item.companyMarkupPercent ?? 0;
}

export function applyMarkup(finalRate: number, markupPercent: number): number {
    return finalRate + (finalRate * markupPercent) / 100;
}

// markupFromInput turns a form field into the value sent to Go: blank → null (not set).
export function markupFromInput(value: string): number | null {
    const t = value.trim();
    if (t === '') return null;
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : null;
}

// markupToInput seeds a form field from a stored value (null/undefined → blank).
export function markupToInput(value: number | null | undefined): string {
    return value == null ? '' : String(value);
}

// finalRateByItem: itemId → final rate of the item's latest purchase bill line (items with
// no bill are absent).
export function finalRateByItem(bills: db.PurchaseBill[]): Map<number, number> {
    const out = new Map<number, number>();
    for (const [itemId, {line}] of latestLineByItem(bills)) {
        out.set(
            itemId,
            calcLine({
                taxQty: line.taxQty,
                taxValue: line.taxValue,
                dQty: line.dQty,
                dValue: line.dValue,
                gstPercent: line.gstPercent,
                packSize: line.itemPackSize,
            }).finalRate,
        );
    }
    return out;
}
