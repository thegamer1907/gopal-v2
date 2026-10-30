import {formatDate} from '@/lib/date';

// Backup file dates come from Go as ISO "YYYY-MM-DD"; the app shows dates as dd-mmm-yy.
// Returns that display form, or '' when the input isn't a real ISO date.
export function parseIsoDate(iso: string): string {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return '';
    return formatDate(d);
}
