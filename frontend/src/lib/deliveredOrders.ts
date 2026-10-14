import type {DateRange} from 'react-day-picker';
import {parseDate, formatDate} from '@/lib/date';

// Which delivered orders a report covers: either by order date range (the original
// behavior) or by an inclusive delivery-number range. One mode applies at a time — they
// are not AND-ed. Shared by the Print Delivered Orders (PDF) and Export Delivered Orders
// (Excel zip) cards on /reports so both always select identically.
export interface DeliveredSelection {
    mode: 'date' | 'number';
    range: DateRange | undefined;
    // Typed text from the delivery-number comboboxes; blank = open-ended on that side.
    from: string;
    to: string;
}

export const emptySelection: DeliveredSelection = {mode: 'date', range: undefined, from: '', to: ''};

export function inDateRange(x: {date: string}, range: DateRange | undefined): boolean {
    const from = range?.from;
    const to = range?.to;
    if (!from && !to) return true;
    const d = parseDate(x.date);
    if (!d) return false;
    if (from && d < from) return false;
    if (to && d > new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999)) return false;
    return true;
}

// Every delivery number that exists, ascending — the combobox options.
export function deliveryNumbers(orders: {deliveryNo: number; delivered: boolean}[]): number[] {
    return orders
        .filter((o) => o.delivered)
        .map((o) => o.deliveryNo)
        .sort((a, b) => a - b);
}

// A delivery-number field is valid when blank or exactly an existing delivery number.
export function isKnownDeliveryNo(text: string, options: number[]): boolean {
    const t = text.trim();
    if (t === '') return true;
    return /^\d+$/.test(t) && options.includes(Number(t));
}

// Returns an error message for the From/To fields (each blank-or-valid, and From <= To),
// or '' when the selection is usable. Date mode has nothing to validate.
export function selectionErrors(sel: DeliveredSelection, options: number[]): {from: string; to: string} {
    if (sel.mode !== 'number') return {from: '', to: ''};
    const errors = {from: '', to: ''};
    if (!isKnownDeliveryNo(sel.from, options)) errors.from = 'No such delivery number';
    if (!isKnownDeliveryNo(sel.to, options)) errors.to = 'No such delivery number';
    if (!errors.from && !errors.to && sel.from.trim() && sel.to.trim() && Number(sel.from) > Number(sel.to)) {
        errors.to = 'End is before start';
    }
    return errors;
}

export function selectionValid(sel: DeliveredSelection, options: number[]): boolean {
    const e = selectionErrors(sel, options);
    return !e.from && !e.to;
}

// Delivered orders matching the selection, sorted by delivery number ascending.
export function selectDeliveredOrders<T extends {date: string; deliveryNo: number; delivered: boolean}>(
    orders: T[],
    sel: DeliveredSelection,
    options: number[],
): T[] {
    if (!selectionValid(sel, options)) return [];
    const from = sel.from.trim() ? Number(sel.from) : -Infinity;
    const to = sel.to.trim() ? Number(sel.to) : Infinity;
    return orders
        .filter((o) => {
            if (!o.delivered) return false;
            if (sel.mode === 'number') return o.deliveryNo >= from && o.deliveryNo <= to;
            return inDateRange(o, sel.range);
        })
        .sort((a, b) => a.deliveryNo - b.deliveryNo);
}

// "(12-Oct-26 to 14-Oct-26)" / "(#12 to #40)" / "(All)" — the filename suffix.
export function selectionLabel(sel: DeliveredSelection): string {
    if (sel.mode === 'number') {
        const from = sel.from.trim();
        const to = sel.to.trim();
        if (!from && !to) return 'All';
        return `${from ? `#${from}` : 'start'} to ${to ? `#${to}` : 'end'}`;
    }
    if (sel.range?.from) {
        const from = formatDate(sel.range.from);
        const to = sel.range.to ? formatDate(sel.range.to) : from;
        return `${from} to ${to}`;
    }
    return 'All';
}
