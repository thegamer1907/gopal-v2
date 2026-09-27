// Shared date helpers. The app's canonical display/entry format is **dd-mmm-yy**
// (month in words, 2-digit year, e.g. 09-Jun-26). Use these everywhere a date is shown or
// typed so the format stays consistent. See docs/DECISIONS.md.
//
// parseDate also accepts a legacy 4-digit year (dd-mmm-yyyy) — bills saved before the
// 2026-09 switch to a 2-digit year are stored exactly as entered and never rewritten, so
// the parser stays permanently tolerant of both forms. Use displayDate to show any stored
// date string normalized to the current 2-digit form regardless of which way it's stored.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Format a Date as dd-mmm-yy (e.g. 09-Jun-26).
export function formatDate(d: Date): string {
    const dd = String(d.getDate()).padStart(2, '0');
    const yy = String(d.getFullYear() % 100).padStart(2, '0');
    return `${dd}-${MONTHS[d.getMonth()]}-${yy}`;
}

// Today as dd-mmm-yy.
export function todayDate(): string {
    return formatDate(new Date());
}

// Parse a dd-mmm-yy (or legacy dd-mmm-yyyy) string into a Date, or undefined if it isn't
// a real calendar date. Month match is case-insensitive (Jun/jun/JUN). A 2-digit year is
// expanded as 2000+yy — this app has no dates before 2026.
export function parseDate(s: string): Date | undefined {
    const m = s.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4}|\d{2})$/);
    if (!m) return undefined;
    const dd = Number(m[1]);
    const mi = MONTHS.findIndex((mo) => mo.toLowerCase() === m[2].toLowerCase());
    if (mi < 0) return undefined;
    const yyyy = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = new Date(yyyy, mi, dd);
    // Round-trip check rejects overflow like 32-Xxx-26.
    if (d.getFullYear() !== yyyy || d.getMonth() !== mi || d.getDate() !== dd) {
        return undefined;
    }
    return d;
}

// Normalize any stored date string to the current dd-mmm-yy display form. Falls back to
// the raw string if it doesn't parse, so bad/legacy data can never crash a render.
export function displayDate(raw: string): string {
    const d = parseDate(raw);
    return d ? formatDate(d) : raw;
}
