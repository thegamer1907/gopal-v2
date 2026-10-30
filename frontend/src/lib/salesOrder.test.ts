import {describe, expect, it} from 'vitest';
import {buildOrderExportGroups} from '@/lib/salesOrder';

const line = (over: Partial<{itemId: number; itemName: string; itemPackSize: number; rate: number; qty: number; customPackSize: number}> = {}) => ({
    itemId: 1,
    itemName: 'Eclair - 32 PB',
    itemPackSize: 32,
    rate: 10,
    qty: 2,
    customPackSize: 0,
    ...over,
});

describe('buildOrderExportGroups', () => {
    it('groups same item+rate lines and shows the real item name', () => {
        const {groups, deductions} = buildOrderExportGroups({items: [line(), line({qty: 3})]});
        expect(groups).toHaveLength(1);
        expect(groups[0]).toMatchObject({itemName: 'Eclair - 32 PB', qty: 5, amount: 5 * 32 * 10});
        expect(deductions).toEqual([]);
    });

    it('turns a custom pack size into a Less (shortfall) or Add (surplus) deduction', () => {
        const less = buildOrderExportGroups({items: [line({customPackSize: 30})]});
        expect(less.deductions).toEqual([{itemName: 'Eclair - 32 PB', units: 4, rate: 10, value: 40}]);
        const add = buildOrderExportGroups({items: [line({customPackSize: 33})]});
        expect(add.deductions[0]).toMatchObject({units: -2, value: -20});
    });
});
