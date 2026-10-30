import {describe, expect, it} from 'vitest';
import {db} from '../../wailsjs/go/models';
import {lapsedCustomers, snoozeEnd} from '@/lib/lapsedCustomers';

const order = (id: number, customerId: number, date: string) =>
    db.SalesOrder.createFrom({
        id,
        customerId,
        customerName: `Cust ${customerId}`,
        customerNickName: '',
        customerCity: 'Meerut',
        date,
        items: [db.SalesOrderItem.createFrom({itemId: 1, itemPackSize: 10, rate: 2, qty: 3, customPackSize: 0})],
    });

const snooze = (customerId: number, snoozedOn: string, amount: number, unit: string) =>
    db.CustomerSnooze.createFrom({customerId, snoozedOn, amount, unit});

const ymd = (d: Date | undefined) => d && [d.getFullYear(), d.getMonth() + 1, d.getDate()];

describe('snoozeEnd', () => {
    it('adds days, weeks and calendar months', () => {
        expect(ymd(snoozeEnd({snoozedOn: '29-Oct-26', amount: 15, unit: 'day'}))).toEqual([2026, 11, 13]);
        expect(ymd(snoozeEnd({snoozedOn: '29-Oct-26', amount: 2, unit: 'week'}))).toEqual([2026, 11, 12]);
        expect(ymd(snoozeEnd({snoozedOn: '29-Oct-26', amount: 2, unit: 'month'}))).toEqual([2026, 12, 29]);
    });

    it('clamps months to the end of a shorter month and rolls the year', () => {
        expect(ymd(snoozeEnd({snoozedOn: '31-Jan-26', amount: 1, unit: 'month'}))).toEqual([2026, 2, 28]);
        expect(ymd(snoozeEnd({snoozedOn: '31-Jan-28', amount: 1, unit: 'month'}))).toEqual([2028, 2, 29]);
        expect(ymd(snoozeEnd({snoozedOn: '15-Nov-26', amount: 3, unit: 'month'}))).toEqual([2027, 2, 15]);
    });

    it('is undefined for an unparseable stored date', () => {
        expect(snoozeEnd({snoozedOn: 'nonsense', amount: 1, unit: 'day'})).toBeUndefined();
    });
});

describe('lapsedCustomers with snoozes', () => {
    const today = new Date(2026, 9, 29); // 29-Oct-26
    const orders = [order(1, 1, '01-Sep-26'), order(2, 2, '10-Sep-26'), order(3, 3, '20-Sep-26')];

    it('lists oldest-first with no snoozes', () => {
        expect(lapsedCustomers(orders, today).map((c) => c.customerId)).toEqual([1, 2, 3]);
    });

    it('hides a customer while snoozed and shows them again on the end date', () => {
        const s = [snooze(1, '29-Oct-26', 15, 'day')]; // ends 13-Nov-26
        expect(lapsedCustomers(orders, today, 10, s).map((c) => c.customerId)).toEqual([2, 3]);
        expect(lapsedCustomers(orders, new Date(2026, 10, 12), 10, s).map((c) => c.customerId)).toEqual([2, 3]);
        expect(lapsedCustomers(orders, new Date(2026, 10, 13), 10, s).map((c) => c.customerId)).toEqual([1, 2, 3]);
    });

    it('ignores an expired or unparseable snooze', () => {
        const s = [snooze(1, '01-Oct-26', 15, 'day'), snooze(2, 'garbage', 5, 'day')];
        expect(lapsedCustomers(orders, today, 10, s).map((c) => c.customerId)).toEqual([1, 2, 3]);
    });

    it('drops snoozed customers before the limit so the next one fills the slot', () => {
        const s = [snooze(1, '29-Oct-26', 1, 'month')];
        expect(lapsedCustomers(orders, today, 2, s).map((c) => c.customerId)).toEqual([2, 3]);
    });

    it('returns nothing when everyone is snoozed', () => {
        const s = [1, 2, 3].map((id) => snooze(id, '29-Oct-26', 1, 'week'));
        expect(lapsedCustomers(orders, today, 10, s)).toEqual([]);
    });
});
