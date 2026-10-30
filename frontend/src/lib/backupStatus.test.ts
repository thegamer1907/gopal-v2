import {describe, expect, it} from 'vitest';
import {parseIsoDate} from '@/lib/backupStatus';

describe('parseIsoDate', () => {
    it('turns a backup file date into the app display format', () => {
        expect(parseIsoDate('2026-10-29')).toBe('29-Oct-26');
        expect(parseIsoDate('2027-01-01')).toBe('01-Jan-27');
    });
    it('returns empty for anything that is not a real ISO date', () => {
        expect(parseIsoDate('')).toBe('');
        expect(parseIsoDate('2026-13-45')).toBe('');
        expect(parseIsoDate('29-Oct-26')).toBe('');
    });
});
