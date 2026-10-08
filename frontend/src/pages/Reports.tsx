import {useEffect, useMemo, useState} from 'react';
import {FileSpreadsheet, Package, ClipboardList, Calendar as CalendarIcon} from 'lucide-react';
import type {DateRange} from 'react-day-picker';
import {
    ListPurchaseBills,
    ExportPurchaseSummary,
    ListItems,
    ListSalesOrders,
    ExportStockReport,
    ExportOrderReport,
} from '../../wailsjs/go/main/App';
import {db, reports} from '../../wailsjs/go/models';
import {Button, buttonVariants} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover';
import {Calendar} from '@/components/ui/calendar';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {DateRangeFilter} from '@/components/DateRangeFilter';
import {parseDate, formatDate, displayDate, todayDate} from '@/lib/date';
import {calcLine, fmt} from '@/lib/purchaseBill';
import {calcOrderLine, effectivePackSize} from '@/lib/salesOrder';
import {cn} from '@/lib/utils';

// Reports (/reports) — a grid of downloadable reports, one Card per report. A future
// report is just another card. See docs/UI.md.
//
// Report math is never re-derived here: every row is built from the same calcLine/
// calcOrderLine formulas the Add/View Bill and Add/View Order screens use, then handed
// to the Go side purely to lay out and save as an .xlsx file. Date filtering (a range,
// or a Stock Report "as of" cutoff) always happens here in the frontend too, via
// @/lib/date's parseDate — purchase_bills.date/sales_orders.date are free-text strings,
// never safely comparable in SQL (see docs/DECISIONS.md).

function inRange(x: {date: string}, range: DateRange | undefined): boolean {
    const from = range?.from;
    const to = range?.to;
    if (!from && !to) return true;
    const d = parseDate(x.date);
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
                    date: displayDate(bill.date),
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

// --- Stock Report ---

// computeStockRows sums every purchase/sale line up to (and including) the cutoff date
// — the same purchased-minus-sold formula items.go's itemSelect uses for the live
// "today" stock figure, just re-derived here per item so an arbitrary past date can be
// asked for too (dates can't be filtered in SQL — see the file header note).
function computeStockRows(
    items: db.Item[],
    bills: db.PurchaseBill[],
    orders: db.SalesOrder[],
    cutoff: Date | undefined,
): reports.StockReportRow[] {
    if (!cutoff) return [];
    const cutoffEnd = new Date(cutoff.getFullYear(), cutoff.getMonth(), cutoff.getDate(), 23, 59, 59, 999);

    const purchasedByItem = new Map<number, number>();
    for (const bill of bills) {
        const d = parseDate(bill.date);
        if (!d || d > cutoffEnd) continue;
        for (const it of bill.items) {
            purchasedByItem.set(it.itemId, (purchasedByItem.get(it.itemId) ?? 0) + it.taxQty + it.dQty);
        }
    }

    const soldByItem = new Map<number, number>();
    for (const order of orders) {
        const d = parseDate(order.date);
        if (!d || d > cutoffEnd) continue;
        for (const it of order.items) {
            soldByItem.set(it.itemId, (soldByItem.get(it.itemId) ?? 0) + it.qty);
        }
    }

    return items.map((item) =>
        reports.StockReportRow.createFrom({
            companyName: item.companyName,
            itemName: item.name,
            packSize: item.packSize,
            hsn: item.hsn,
            stock: (purchasedByItem.get(item.id) ?? 0) - (soldByItem.get(item.id) ?? 0),
        }),
    );
}

function stockFilenameFor(asOfDate: string): string {
    return `Stock Report (as of ${asOfDate}).xlsx`;
}

// --- Order Report ---

type DeliveryFilter = 'all' | 'delivered' | 'pending';

function matchesDelivery(order: db.SalesOrder, filter: DeliveryFilter): boolean {
    if (filter === 'all') return true;
    return filter === 'delivered' ? order.delivered : !order.delivered;
}

function toOrderReportRows(orders: db.SalesOrder[]): reports.OrderReportRow[] {
    // Sort orders (not the flattened rows) so each order's lines stay together — date
    // ascending, tie-broken by id since orders have no bill-number-style identifier.
    const sorted = [...orders].sort((a, b) => {
        const da = parseDate(a.date) ?? new Date(0);
        const db_ = parseDate(b.date) ?? new Date(0);
        if (da.getTime() !== db_.getTime()) return da.getTime() - db_.getTime();
        return a.id - b.id;
    });

    const rows: reports.OrderReportRow[] = [];
    for (const order of sorted) {
        for (const it of order.items) {
            const packSize = effectivePackSize({itemPackSize: it.itemPackSize, customPackSize: it.customPackSize});
            const {finalAmount} = calcOrderLine({rate: it.rate, qty: it.qty, packSize});
            rows.push(
                reports.OrderReportRow.createFrom({
                    date: displayDate(order.date),
                    customerName: order.customerName,
                    customerCity: order.customerCity,
                    itemName: it.itemName,
                    packSize,
                    gstPercent: it.gstPercent,
                    hsn: it.hsn,
                    qty: it.qty,
                    rate: it.rate,
                    finalAmount,
                    delivered: order.delivered,
                    deliveryNo: order.deliveryNo,
                }),
            );
        }
    }
    return rows;
}

function orderFilenameFor(range: DateRange | undefined, filter: DeliveryFilter): string {
    const suffix = filter === 'delivered' ? ' - Delivered' : filter === 'pending' ? ' - Pending' : '';
    if (range?.from) {
        const from = formatDate(range.from);
        const to = range.to ? formatDate(range.to) : from;
        return `Order Report${suffix} (${from} to ${to}).xlsx`;
    }
    return `Order Report${suffix} (All).xlsx`;
}

export function Reports() {
    const [bills, setBills] = useState<db.PurchaseBill[]>([]);
    const [items, setItems] = useState<db.Item[]>([]);
    const [orders, setOrders] = useState<db.SalesOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');

    useEffect(() => {
        Promise.all([ListPurchaseBills(), ListItems(), ListSalesOrders()])
            .then(([b, i, o]) => {
                setBills(b);
                setItems(i);
                setOrders(o);
            })
            .catch((e) => setLoadError(String(e)))
            .finally(() => setLoading(false));
    }, []);

    // --- Purchase Summary state ---
    const [range, setRange] = useState<DateRange | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const [saved, setSaved] = useState('');
    const [error, setError] = useState('');

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

    // --- Stock Report state ---
    const [asOfDate, setAsOfDate] = useState(todayDate());
    const [asOfOpen, setAsOfOpen] = useState(false);
    const [stockBusy, setStockBusy] = useState(false);
    const [stockSaved, setStockSaved] = useState('');
    const [stockError, setStockError] = useState('');

    const parsedAsOf = useMemo(() => parseDate(asOfDate), [asOfDate]);
    const stockRows = useMemo(
        () => computeStockRows(items, bills, orders, parsedAsOf),
        [items, bills, orders, parsedAsOf],
    );

    async function downloadStock() {
        setStockSaved('');
        setStockError('');
        setStockBusy(true);
        try {
            const path = await ExportStockReport(stockRows, asOfDate, stockFilenameFor(asOfDate));
            if (path) setStockSaved(`Saved to ${path}`);
        } catch (e: any) {
            setStockError(String(e));
        } finally {
            setStockBusy(false);
        }
    }

    // --- Order Report state ---
    const [orderRange, setOrderRange] = useState<DateRange | undefined>(undefined);
    const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>('all');
    const [orderBusy, setOrderBusy] = useState(false);
    const [orderSaved, setOrderSaved] = useState('');
    const [orderError, setOrderError] = useState('');

    const filteredOrders = useMemo(
        () => orders.filter((o) => inRange(o, orderRange) && matchesDelivery(o, deliveryFilter)),
        [orders, orderRange, deliveryFilter],
    );
    const orderRows = useMemo(() => toOrderReportRows(filteredOrders), [filteredOrders]);
    const orderTotalValue = useMemo(() => orderRows.reduce((sum, r) => sum + r.finalAmount, 0), [orderRows]);

    async function downloadOrderReport() {
        setOrderSaved('');
        setOrderError('');
        setOrderBusy(true);
        try {
            const path = await ExportOrderReport(orderRows, orderFilenameFor(orderRange, deliveryFilter));
            if (path) setOrderSaved(`Saved to ${path}`);
        } catch (e: any) {
            setOrderError(String(e));
        } finally {
            setOrderBusy(false);
        }
    }

    return (
        <div className="space-y-4">

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

                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Package className="size-5 text-muted-foreground"/>
                            <CardTitle>Stock Report</CardTitle>
                        </div>
                        <CardDescription>Every item's stock as of a chosen date.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="relative w-[180px]">
                            <Input
                                aria-label="As of date"
                                placeholder="dd-mmm-yy"
                                autoComplete="off"
                                className="pr-9"
                                value={asOfDate}
                                onChange={(e) => setAsOfDate(e.target.value)}
                            />
                            <Popover open={asOfOpen} onOpenChange={setAsOfOpen}>
                                <PopoverTrigger
                                    type="button"
                                    aria-label="Pick a date"
                                    className={cn(
                                        buttonVariants({variant: 'ghost', size: 'icon'}),
                                        'absolute right-1 top-1 size-7 text-muted-foreground',
                                    )}
                                >
                                    <CalendarIcon className="size-4"/>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="end">
                                    <Calendar
                                        mode="single"
                                        selected={parsedAsOf}
                                        defaultMonth={parsedAsOf}
                                        onSelect={(d) => {
                                            if (d) {
                                                setAsOfDate(formatDate(d));
                                                setAsOfOpen(false);
                                            }
                                        }}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        <p className="text-sm text-muted-foreground">
                            {loading
                                ? 'Loading…'
                                : !parsedAsOf
                                  ? 'Enter a valid date.'
                                  : `${stockRows.length} item${stockRows.length === 1 ? '' : 's'} · stock as of ${asOfDate}`}
                        </p>

                        <Button onClick={downloadStock} disabled={stockBusy || loading || !parsedAsOf || stockRows.length === 0}>
                            {stockBusy ? 'Preparing…' : 'Download Excel'}
                        </Button>

                        {stockSaved && <p className="text-sm text-emerald-600">{stockSaved}</p>}
                        {stockError && <p className="text-sm text-destructive">{stockError}</p>}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <ClipboardList className="size-5 text-muted-foreground"/>
                            <CardTitle>Order Report</CardTitle>
                        </div>
                        <CardDescription>Every sales order line, filterable by delivery status.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <Select value={deliveryFilter} onValueChange={(v) => setDeliveryFilter(v as DeliveryFilter)}>
                                <SelectTrigger size="sm" className="w-[150px]">
                                    <SelectValue/>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All orders</SelectItem>
                                    <SelectItem value="delivered">Delivered only</SelectItem>
                                    <SelectItem value="pending">Pending only</SelectItem>
                                </SelectContent>
                            </Select>
                            <DateRangeFilter value={orderRange} onChange={setOrderRange}/>
                        </div>

                        <p className="text-sm text-muted-foreground">
                            {loading
                                ? 'Loading…'
                                : orderRows.length === 0
                                  ? 'No orders match this filter.'
                                  : `${orderRows.length} line${orderRows.length === 1 ? '' : 's'} across ${filteredOrders.length} order${filteredOrders.length === 1 ? '' : 's'} · ${fmt(orderTotalValue)}`}
                        </p>

                        <Button onClick={downloadOrderReport} disabled={orderBusy || loading || orderRows.length === 0}>
                            {orderBusy ? 'Preparing…' : 'Download Excel'}
                        </Button>

                        {orderSaved && <p className="text-sm text-emerald-600">{orderSaved}</p>}
                        {orderError && <p className="text-sm text-destructive">{orderError}</p>}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
