import {useEffect, useMemo, useState} from 'react';
import {FileSpreadsheet} from 'lucide-react';
import type {DateRange} from 'react-day-picker';
import {ListPurchaseBills, ExportPurchaseSummary} from '../../wailsjs/go/main/App';
import {db, reports} from '../../wailsjs/go/models';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {DateRangeFilter} from '@/components/DateRangeFilter';
import {parseDate, formatDate} from '@/lib/date';
import {calcLine, fmt} from '@/lib/purchaseBill';

// Reports (/reports) — a grid of downloadable reports, one Card per report. Only
// Purchase Summary exists today; a future report is just another card. See docs/UI.md.
//
// The report's math is never re-derived here: every row is built from the same calcLine
// formulas the Add/View Bill screens use (lib/purchaseBill.ts), then handed to the Go
// side purely to lay out and save as an .xlsx file.

function inRange(bill: db.PurchaseBill, range: DateRange | undefined): boolean {
    const from = range?.from;
    const to = range?.to;
    if (!from && !to) return true;
    const d = parseDate(bill.date);
    if (!d) return false;
    if (from && d < from) return false;
    if (to && d > new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999)) return false;
    return true;
}

function toRows(bills: db.PurchaseBill[]): reports.PurchaseSummaryRow[] {
    const rows: reports.PurchaseSummaryRow[] = [];
    for (const bill of bills) {
        for (const it of bill.items) {
            const calc = calcLine({
                taxQty: it.taxQty,
                taxValue: it.taxValue,
                dQty: it.dQty,
                dValue: it.dValue,
                gstPercent: it.gstPercent,
                packSize: it.itemPackSize,
            });
            rows.push(
                reports.PurchaseSummaryRow.createFrom({
                    date: bill.date,
                    companyName: bill.companyName,
                    billNumber: bill.billNumber,
                    itemName: it.itemName,
                    hsn: it.hsn,
                    packSize: it.itemPackSize,
                    taxQty: it.taxQty,
                    taxValue: it.taxValue,
                    dQty: it.dQty,
                    dValue: it.dValue,
                    gstPercent: it.gstPercent,
                    gstAmount: calc.gstAmount,
                    taxBillAmount: calc.taxBillAmount,
                    billValue: calc.billValue,
                    billingRate: calc.billingRate,
                    finalRate: calc.finalRate,
                    discount: it.discount,
                    remarks: it.remarks,
                }),
            );
        }
    }
    // Chronological register: oldest first, ties broken by bill number.
    rows.sort((a, b) => {
        const da = parseDate(a.date) ?? new Date(0);
        const dbDate = parseDate(b.date) ?? new Date(0);
        if (da.getTime() !== dbDate.getTime()) return da.getTime() - dbDate.getTime();
        return a.billNumber.localeCompare(b.billNumber);
    });
    return rows;
}

function filenameFor(range: DateRange | undefined): string {
    if (range?.from) {
        const from = formatDate(range.from);
        const to = range.to ? formatDate(range.to) : from;
        return `Purchase Summary (${from} to ${to}).xlsx`;
    }
    return 'Purchase Summary (All).xlsx';
}

export function Reports() {
    const [bills, setBills] = useState<db.PurchaseBill[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [range, setRange] = useState<DateRange | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const [saved, setSaved] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        ListPurchaseBills()
            .then(setBills)
            .catch((e) => setLoadError(String(e)))
            .finally(() => setLoading(false));
    }, []);

    const filteredBills = useMemo(() => bills.filter((b) => inRange(b, range)), [bills, range]);
    const rows = useMemo(() => toRows(filteredBills), [filteredBills]);
    const totalValue = useMemo(() => rows.reduce((sum, r) => sum + r.billValue, 0), [rows]);

    async function download() {
        setSaved('');
        setError('');
        setBusy(true);
        try {
            const path = await ExportPurchaseSummary(rows, filenameFor(range));
            if (path) setSaved(`Saved to ${path}`);
        } catch (e: any) {
            setError(String(e));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
                <p className="text-sm text-muted-foreground">Download report data as Excel workbooks.</p>
            </div>

            {loadError && <p className="text-sm text-destructive">{loadError}</p>}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <FileSpreadsheet className="size-5 text-muted-foreground"/>
                            <CardTitle>Purchase Summary</CardTitle>
                        </div>
                        <CardDescription>Every purchase bill line, with GST and totals.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <DateRangeFilter value={range} onChange={setRange}/>

                        <p className="text-sm text-muted-foreground">
                            {loading
                                ? 'Loading…'
                                : rows.length === 0
                                  ? 'No purchase bills in this range.'
                                  : `${rows.length} line${rows.length === 1 ? '' : 's'} across ${filteredBills.length} bill${filteredBills.length === 1 ? '' : 's'} · ${fmt(totalValue)}`}
                        </p>

                        <Button onClick={download} disabled={busy || loading || rows.length === 0}>
                            {busy ? 'Preparing…' : 'Download Excel'}
                        </Button>

                        {saved && <p className="text-sm text-emerald-600">{saved}</p>}
                        {error && <p className="text-sm text-destructive">{error}</p>}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
