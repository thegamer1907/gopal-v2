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

// Latest order = max parsed date (ties → higher id). Orders with an unparseable date are
// skipped; customers with no orders never appear. Sorted by days since last order, desc.
export function lapsedCustomers(orders: db.SalesOrder[], today: Date, limit = 10): LapsedCustomer[] {
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
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
