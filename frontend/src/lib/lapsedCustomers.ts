// Dashboard "customers who haven't ordered lately": each customer's most recent order,
// oldest first. Pure — the Dashboard feeds it ListSalesOrders() and today's date.

import {db} from '../../wailsjs/go/models';
import {parseDate} from '@/lib/date';
import {finalAmountOf} from '@/lib/salesOrder';

export interface LapsedCustomer {
    customerId: number;
    customerName: string;
    customerNickName: string;
    customerCity: string;
    orderId: number; // the customer's latest order
    date: string; // that order's stored date
    daysAgo: number;
    value: number; // that order's Final Amount total
}

const DAY_MS = 24 * 60 * 60 * 1000;

export type SnoozeUnit = 'day' | 'week' | 'month';

// The first day the customer shows again: snoozedOn + amount × unit. Months are calendar
// months, clamped to the target month's last day (31-Jan + 1 month = 28/29-Feb). Returns
// undefined for an unparseable stored date, which callers treat as "not snoozed".
export function snoozeEnd(s: {snoozedOn: string; amount: number; unit: string}): Date | undefined {
    const start = parseDate(s.snoozedOn);
    if (!start) return undefined;
    if (s.unit === 'month') {
        const target = new Date(start.getFullYear(), start.getMonth() + s.amount, 1);
        const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
        return new Date(target.getFullYear(), target.getMonth(), Math.min(start.getDate(), lastDay));
    }
    const days = s.unit === 'week' ? s.amount * 7 : s.amount;
    return new Date(start.getFullYear(), start.getMonth(), start.getDate() + days);
}

// Latest order = max parsed date (ties → higher id). Orders with an unparseable date are
// skipped; customers with no orders never appear. Customers with an active snooze
// (today is before its end) are dropped before the limit, so the next one fills the slot.
// Sorted by days since last order, desc.
export function lapsedCustomers(
    orders: db.SalesOrder[],
    today: Date,
    limit = 10,
    snoozes: db.CustomerSnooze[] = [],
): LapsedCustomer[] {
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const snoozedIds = new Set<number>();
    for (const s of snoozes) {
        const end = snoozeEnd(s);
        if (end && startOfToday < end) snoozedIds.add(s.customerId);
    }
    const latest = new Map<number, {order: db.SalesOrder; when: Date}>();
    for (const order of orders) {
        const when = parseDate(order.date);
        if (!when) continue;
        const cur = latest.get(order.customerId);
        if (!cur || when > cur.when || (when.getTime() === cur.when.getTime() && order.id > cur.order.id)) {
            latest.set(order.customerId, {order, when});
        }
    }
    return [...latest.values()]
        .filter(({order}) => !snoozedIds.has(order.customerId))
        .map(({order, when}) => ({
            customerId: order.customerId,
            customerName: order.customerName,
            customerNickName: order.customerNickName,
            customerCity: order.customerCity,
            orderId: order.id,
            date: order.date,
            daysAgo: Math.max(0, Math.round((startOfToday.getTime() - when.getTime()) / DAY_MS)),
            value: finalAmountOf(order),
        }))
        .sort((a, b) => b.daysAgo - a.daysAgo || a.customerName.localeCompare(b.customerName))
        .slice(0, limit);
}
