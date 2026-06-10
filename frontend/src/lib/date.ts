// Shared date helpers. The app's canonical display/entry format is **dd-mmm-yyyy**
// (month in words, e.g. 09-Jun-2026). Use these everywhere a date is shown or typed
// so the format stays consistent. See docs/DECISIONS.md.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Format a Date as dd-mmm-yyyy (e.g. 09-Jun-2026).
export function formatDate(d: Date): string {
    const dd = String(d.getDate()).padStart(2, '0');
    return `${dd}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

// Today as dd-mmm-yyyy.
export function todayDate(): string {
    return formatDate(new Date());
}

// Parse a dd-mmm-yyyy string into a Date, or undefined if it isn't a real calendar
// date. Month match is case-insensitive (Jun/jun/JUN).
export function parseDate(s: string): Date | undefined {
    const m = s.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
    if (!m) return undefined;
    const dd = Number(m[1]);
    const mi = MONTHS.findIndex((mo) => mo.toLowerCase() === m[2].toLowerCase());
    const yyyy = Number(m[3]);
    if (mi < 0) return undefined;
    const d = new Date(yyyy, mi, dd);
    // Round-trip check rejects overflow like 32-Xxx-2026.
    if (d.getFullYear() !== yyyy || d.getMonth() !== mi || d.getDate() !== dd) {
        return undefined;
    }
    return d;
}
