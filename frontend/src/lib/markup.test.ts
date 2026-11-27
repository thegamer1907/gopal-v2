import {describe, expect, it} from 'vitest';
import {db} from '../../wailsjs/go/models';
import {applyMarkup, effectiveMarkup, finalRateByItem, markupFromInput, markupToInput} from './markup';

describe('effectiveMarkup', () => {
    it('item overrides company', () => expect(effectiveMarkup({markupPercent: 2.5, companyMarkupPercent: 3})).toBe(2.5));
    it('item 0 cancels company', () => expect(effectiveMarkup({markupPercent: 0, companyMarkupPercent: 3})).toBe(0));
    it('falls back to company', () => expect(effectiveMarkup({markupPercent: null, companyMarkupPercent: 3})).toBe(3));
    it('neither → 0', () => expect(effectiveMarkup({markupPercent: null, companyMarkupPercent: null})).toBe(0));
});

describe('applyMarkup', () => {
    it('20 + 2% = 20.4', () => expect(applyMarkup(20, 2)).toBeCloseTo(20.4));
    it('0% leaves the rate', () => expect(applyMarkup(20, 0)).toBe(20));
});

describe('markup form conversion', () => {
    it('blank → null, 0 → 0', () => {
        expect(markupFromInput('  ')).toBeNull();
        expect(markupFromInput('0')).toBe(0);
        expect(markupFromInput('2.5')).toBe(2.5);
    });
    it('null → blank', () => {
        expect(markupToInput(null)).toBe('');
        expect(markupToInput(0)).toBe('0');
    });
});

describe('finalRateByItem', () => {
    const line = (itemId: number, taxValue: number) =>
        db.PurchaseBillItem.createFrom({itemId, taxQty: 10, taxValue, dQty: 0, dValue: 0, gstPercent: 0, itemPackSize: 1});
    it('uses the latest bill (date, then id) and omits items with no bill', () => {
        const bills = [
            db.PurchaseBill.createFrom({id: 1, date: '01-Jan-26', items: [line(1, 100)]}),
            db.PurchaseBill.createFrom({id: 2, date: '05-Feb-26', items: [line(1, 200)]}),
            db.PurchaseBill.createFrom({id: 3, date: '01-Jan-26', items: [line(1, 999)]}),
        ];
        const m = finalRateByItem(bills);
        expect(m.get(1)).toBeCloseTo(20); // 200 / 10 / 1
        expect(m.has(2)).toBe(false);
    });
});
