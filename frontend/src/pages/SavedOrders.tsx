import {useEffect, useMemo, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {toBlob} from 'html-to-image';
import {ArrowLeft, CheckCircle2, ClipboardList, FileSpreadsheet, FileText, ImageDown, Pencil, Search, Trash2} from 'lucide-react';
import type {DateRange} from 'react-day-picker';
import {
    ListSalesOrders,
    DeleteSalesOrder,
    MarkSalesOrderDelivered,
    SaveOrderShareImage,
    ExportOrderExcel,
    ExportOrderPDF,
} from '../../wailsjs/go/main/App';
import {db, reports} from '../../wailsjs/go/models';
import {MarkDeliveredDialog} from '@/components/MarkDeliveredDialog';
import {ShareableOrderImage} from '@/components/ShareableOrderImage';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Switch} from '@/components/ui/switch';
import {Label} from '@/components/ui/label';
import {Badge} from '@/components/ui/badge';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {SortableHeader} from '@/components/SortableHeader';
import {DateRangeFilter} from '@/components/DateRangeFilter';
import {useTableSort} from '@/hooks/useTableSort';
import {parseDate, displayDate} from '@/lib/date';
import {cn} from '@/lib/utils';
import {fmt, fmtQty} from '@/lib/purchaseBill';
import {
    buildOrderExportGroups,
    calcOrderLine,
    customerShareLabel,
    effectivePackSize,
    OrderLineCalc,
} from '@/lib/salesOrder';

// View/Edit Orders — a list of every saved order that opens a read-only detail, from
// which the order can be edited (full overwrite) or deleted. Mirrors View/Edit Bills
// (SavedBills.tsx). No order-number column — that field doesn't exist for orders.

function lineCalc(it: db.SalesOrderItem): OrderLineCalc {
    return calcOrderLine({rate: it.rate, qty: it.qty, packSize: effectivePackSize(it)});
}

// Per-order summaries used by the list columns/sort.
const finalAmountOf = (order: db.SalesOrder): number =>
    order.items.reduce((sum, it) => sum + lineCalc(it).finalAmount, 0);
const totalQtyOf = (order: db.SalesOrder): number =>
    order.items.reduce((sum, it) => sum + it.qty, 0);

// Sort accessors for the orders list. Unparseable dates fall back to the epoch so they
// sort to the bottom under the default newest-first order.
const orderSortAccessors = {
    customer: (o: db.SalesOrder) => o.customerName,
    date: (o: db.SalesOrder) => parseDate(o.date) ?? new Date(0),
    qty: totalQtyOf,
    amount: finalAmountOf,
    deliveryNo: (o: db.SalesOrder) => o.deliveryNo,
};

function DeliveredBadge({order}: {order: db.SalesOrder}) {
    return order.delivered ? (
        <Badge variant="default">Delivered #{order.deliveryNo}</Badge>
    ) : (
        <Badge variant="secondary">Pending</Badge>
    );
}

export function SavedOrders() {
    const navigate = useNavigate();
    const [orders, setOrders] = useState<db.SalesOrder[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [range, setRange] = useState<DateRange | undefined>(undefined);
    const [showDelivered, setShowDelivered] = useState(false);
    const [confirmDeliver, setConfirmDeliver] = useState<db.SalesOrder | null>(null);

    function refresh() {
        return ListSalesOrders()
            .then(setOrders)
            .catch((e) => setError(String(e)))
            .finally(() => setLoading(false));
    }

    useEffect(() => {
        refresh();
    }, []);

    const selected = useMemo(
        () => orders.find((o) => o.id === selectedId) ?? null,
        [orders, selectedId],
    );

    // Filter by search (customer name), by date range (inclusive, either bound optional),
    // and by delivered status — the toggle is exclusive, showing delivered orders only when
    // on and undelivered only when off — then sort. The date range's `to` is end-of-day.
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const from = range?.from;
        const to = range?.to;
        return orders.filter((o) => {
            if (o.delivered !== showDelivered) {
                return false;
            }
            if (q && !o.customerName.toLowerCase().includes(q)) {
                return false;
            }
            if (from || to) {
                const d = parseDate(o.date);
                if (!d) return false;
                if (from && d < from) return false;
                if (to && d > new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999)) return false;
            }
            return true;
        });
    }, [orders, search, range, showDelivered]);

    const {sorted, sortKey, sortDir, toggle} = useTableSort(filtered, orderSortAccessors, {
        key: 'date',
        dir: 'desc',
    });

    async function deleteOrder(id: number) {
        try {
            await DeleteSalesOrder(id);
            setSelectedId(null);
            await refresh();
        } catch (e: any) {
            setError(String(e));
        }
    }

    // One-way, and the order leaves the (pending) view it was marked from, so refresh the
    // whole list rather than patching the row in place.
    async function markDelivered(id: number) {
        try {
            await MarkSalesOrderDelivered(id);
            await refresh();
        } catch (e: any) {
            setError(String(e));
        }
    }

    if (loading) {
        return <p className="text-sm text-muted-foreground">Loading orders…</p>;
    }
    if (error) {
        return <p className="text-sm text-destructive">{error}</p>;
    }

    if (selected) {
        return (
            <OrderDetail
                order={selected}
                onBack={() => setSelectedId(null)}
                onEdit={() => navigate(`/orders/${selected.id}/edit`)}
                onDelete={() => deleteOrder(selected.id)}
            />
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">View / Edit Orders</h1>
                <p className="text-sm text-muted-foreground">
                    {orders.length} saved order{orders.length === 1 ? '' : 's'}. Click one to view, edit, or delete it.
                </p>
            </div>

            {orders.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                        <ClipboardList className="size-8 text-muted-foreground"/>
                        <p className="text-sm text-muted-foreground">No orders saved yet.</p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative w-64">
                                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/>
                                <Input
                                    className="pl-8"
                                    placeholder="Search customer…"
                                    autoComplete="off"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <Switch
                                    id="show-delivered"
                                    checked={showDelivered}
                                    onCheckedChange={setShowDelivered}
                                />
                                <Label htmlFor="show-delivered" className="font-normal text-muted-foreground">
                                    Delivered only
                                </Label>
                            </div>
                        </div>
                        <DateRangeFilter value={range} onChange={setRange}/>
                    </div>

                    <Card>
                        <CardContent className="p-0">
                            {sorted.length === 0 ? (
                                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
                                    <Search className="size-8 opacity-40"/>
                                    <p className="text-sm">No orders match the current filters.</p>
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        {/* The filter is exclusive, so every visible row has the
                                            same status: no Status column. Delivered rows carry
                                            their number instead; pending rows get the mark action. */}
                                        <TableRow>
                                            {showDelivered && (
                                                <SortableHeader label="Delivery #" sortKey="deliveryNo" activeKey={sortKey} dir={sortDir} onSort={toggle} className="pl-4"/>
                                            )}
                                            <SortableHeader label="Customer" sortKey="customer" activeKey={sortKey} dir={sortDir} onSort={toggle} className={showDelivered ? undefined : 'pl-4'}/>
                                            <SortableHeader label="Date" sortKey="date" activeKey={sortKey} dir={sortDir} onSort={toggle}/>
                                            <SortableHeader label="Qty" sortKey="qty" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right"/>
                                            <SortableHeader label="Final Amount" sortKey="amount" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right"/>
                                            {!showDelivered && <TableHead className="w-10 pr-4"/>}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {sorted.map((order) => (
                                            <TableRow
                                                key={order.id}
                                                onClick={() => setSelectedId(order.id)}
                                                className="cursor-pointer"
                                            >
                                                {showDelivered && (
                                                    <TableCell className="pl-4 tabular-nums font-medium">#{order.deliveryNo}</TableCell>
                                                )}
                                                <TableCell className={cn('font-medium', !showDelivered && 'pl-4')}>{order.customerName}</TableCell>
                                                <TableCell className="tabular-nums text-muted-foreground">{displayDate(order.date)}</TableCell>
                                                <TableCell className="text-right tabular-nums text-muted-foreground">{fmtQty(totalQtyOf(order))}</TableCell>
                                                <TableCell className={cn('text-right tabular-nums font-medium', showDelivered && 'pr-4')}>{fmt(finalAmountOf(order))}</TableCell>
                                                {!showDelivered && (
                                                    <TableCell className="pr-4 text-right">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="size-8"
                                                            aria-label="Mark delivered"
                                                            title="Mark delivered"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setConfirmDeliver(order);
                                                            }}
                                                        >
                                                            <CheckCircle2 className="size-4"/>
                                                        </Button>
                                                    </TableCell>
                                                )}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}

            <MarkDeliveredDialog
                open={confirmDeliver !== null}
                onOpenChange={(open) => !open && setConfirmDeliver(null)}
                orderId={confirmDeliver?.id ?? 0}
                customerName={confirmDeliver?.customerName ?? ''}
                onConfirm={() => confirmDeliver && markDelivered(confirmDeliver.id)}
            />
        </div>
    );
}

// Read-only detail for a single order: header summary + the full line-items grid,
// display-only. Offers Edit (opens the order form) and Delete (with confirm). No Stock
// column here — Stock is a live figure for placing a new order, not a fact about a
// historical one.
function OrderDetail({
    order,
    onBack,
    onEdit,
    onDelete,
}: {
    order: db.SalesOrder;
    onBack: () => void;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const [confirmDelete, setConfirmDelete] = useState(false);
    // Only one export/share action can run at a time; all three share one feedback line
    // below the button row.
    const [busy, setBusy] = useState<'image' | 'excel' | 'pdf' | null>(null);
    const [notice, setNotice] = useState('');
    const [error, setError] = useState('');
    const [imagePreview, setImagePreview] = useState<{blob: Blob; url: string} | null>(null);
    const shareRef = useRef<HTMLDivElement>(null);
    const rows = order.items.map((it) => ({it, c: lineCalc(it)}));
    const totals = rows.reduce(
        (acc, {it, c}) => {
            acc.qty += it.qty;
            acc.finalAmount += c.finalAmount;
            return acc;
        },
        {qty: 0, finalAmount: 0},
    );

    // Renders the order as an image (ShareableOrderImage, off-screen) and opens a
    // preview dialog so the user can see exactly what will be shared before it's
    // copied. The actual clipboard write happens later, from the dialog's own Copy
    // button — a fresh user gesture, so (unlike the old single-click flow) it can just
    // call navigator.clipboard.write() directly with an already-resolved Blob, with no
    // special timing tricks needed to keep Safari/WebKit's "user activation" alive.
    async function generateOrderImage() {
        setBusy('image');
        setNotice('');
        setError('');
        try {
            const blob = await toBlob(shareRef.current!, {pixelRatio: 2, backgroundColor: '#ffffff'});
            if (!blob) throw new Error('Could not render the image.');
            setImagePreview({blob, url: URL.createObjectURL(blob)});
        } catch (e: any) {
            setError(String(e));
        } finally {
            setBusy(null);
        }
    }

    function closeImagePreview() {
        if (imagePreview) URL.revokeObjectURL(imagePreview.url);
        setImagePreview(null);
    }

    // Copies the previewed image to the clipboard so the user can paste it into
    // WhatsApp themselves — the app never opens WhatsApp or builds a message; a wa.me
    // link can only pre-fill text, never attach a file, so a manual paste is the only
    // thing worth building. Falls back to a native Save dialog only if the clipboard
    // write itself fails.
    async function copyPreviewedImage() {
        if (!imagePreview) return;
        const {blob} = imagePreview;
        try {
            await navigator.clipboard.write([new ClipboardItem({'image/png': blob})]);
            setNotice('Image copied — paste it into WhatsApp.');
            closeImagePreview();
        } catch (clipboardErr) {
            console.error('Clipboard write failed, falling back to Save dialog:', clipboardErr);
            try {
                const bytes = new Uint8Array(await blob.arrayBuffer());
                const path = await SaveOrderShareImage(Array.from(bytes), `Order-${order.id}.png`);
                setNotice(path ? `Couldn't copy to clipboard — saved to ${path} instead.` : '');
                closeImagePreview();
            } catch (e: any) {
                setError(String(e));
            }
        }
    }

    function toExportHeader(): reports.OrderExportHeader {
        return reports.OrderExportHeader.createFrom({
            orderId: order.id,
            customerLabel: customerShareLabel(order),
            date: displayDate(order.date),
        });
    }

    function toExportRowsAndDeductions(): {rows: reports.OrderExportRow[]; deductions: reports.OrderExportDeduction[]} {
        const {groups, deductions} = buildOrderExportGroups(order);
        return {
            rows: groups.map((g) =>
                reports.OrderExportRow.createFrom({
                    itemName: g.itemName,
                    packSize: g.packSize,
                    rate: g.rate,
                    qty: g.qty,
                    finalAmount: g.amount,
                }),
            ),
            deductions: deductions.map((d) =>
                reports.OrderExportDeduction.createFrom({
                    itemName: d.itemName,
                    units: d.units,
                    rate: d.rate,
                    value: d.value,
                }),
            ),
        };
    }

    async function downloadExcel() {
        setBusy('excel');
        setNotice('');
        setError('');
        try {
            const {rows, deductions} = toExportRowsAndDeductions();
            const path = await ExportOrderExcel(toExportHeader(), rows, deductions, `Order-${order.id}.xlsx`);
            if (path) setNotice(`Saved to ${path}`);
        } catch (e: any) {
            setError(String(e));
        } finally {
            setBusy(null);
        }
    }

    async function downloadPdf() {
        setBusy('pdf');
        setNotice('');
        setError('');
        try {
            const {rows, deductions} = toExportRowsAndDeductions();
            const path = await ExportOrderPDF(toExportHeader(), rows, deductions, `Order-${order.id}.pdf`);
            if (path) setNotice(`Saved to ${path}`);
        } catch (e: any) {
            setError(String(e));
        } finally {
            setBusy(null);
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
                <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
                    <ArrowLeft className="size-4"/>
                    Back to all orders
                </Button>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={generateOrderImage} disabled={busy !== null}>
                        <ImageDown className="size-4"/>
                        {busy === 'image' ? 'Preparing…' : 'Copy Order Image'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={downloadExcel} disabled={busy !== null}>
                        <FileSpreadsheet className="size-4"/>
                        {busy === 'excel' ? 'Preparing…' : 'Download Excel'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={downloadPdf} disabled={busy !== null}>
                        <FileText className="size-4"/>
                        {busy === 'pdf' ? 'Preparing…' : 'Download PDF'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={onEdit} disabled={busy !== null}>
                        <Pencil className="size-4"/>
                        Edit order
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setConfirmDelete(true)}
                        disabled={busy !== null}
                    >
                        <Trash2 className="size-4"/>
                        Delete
                    </Button>
                </div>
            </div>
            {(notice || error) && (
                <p className={cn('text-sm', error ? 'text-destructive' : 'text-muted-foreground')}>
                    {error || notice}
                </p>
            )}
            <div className="pointer-events-none fixed left-[-9999px] top-0">
                <ShareableOrderImage ref={shareRef} order={order}/>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <CardTitle>Order #{order.id}</CardTitle>
                        <DeliveredBadge order={order}/>
                    </div>
                    <CardDescription>
                        {order.customerName} · {displayDate(order.date)}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full border-separate border-spacing-0 text-sm">
                            <thead>
                                <tr className="text-center align-bottom text-muted-foreground [&>th]:px-1.5 [&>th]:pb-2 [&>th]:font-medium [&>th]:leading-tight">
                                    <th className="text-left">Item</th>
                                    <th className="w-14">Qty</th>
                                    <th className="w-12">Pack Size</th>
                                    <th className="w-10">GST %</th>
                                    <th className="w-14">HSN</th>
                                    <th className="w-20">Rate</th>
                                    <th className="w-24 bg-muted/50">Final Amount</th>
                                </tr>
                            </thead>
                            <tbody className="[&>tr>td]:px-2 [&>tr>td]:py-1.5 [&>tr>td]:align-middle">
                                {rows.map(({it, c}, i) => (
                                    <tr key={i} className="border-t">
                                        <td className="font-medium">{it.itemName}</td>
                                        <td className="text-right tabular-nums">{fmtQty(it.qty)}</td>
                                        <td className="text-right tabular-nums text-muted-foreground">
                                            <div className="flex items-center justify-end gap-1">
                                                {it.customPackSize !== 0 && (
                                                    <Badge variant="secondary" className="px-1 text-[10px]">
                                                        Custom
                                                    </Badge>
                                                )}
                                                {effectivePackSize(it)}
                                            </div>
                                        </td>
                                        <td className="text-right tabular-nums text-muted-foreground">{it.gstPercent}</td>
                                        <td className="text-right tabular-nums text-muted-foreground">{it.hsn}</td>
                                        <td className="text-right tabular-nums">{fmt(it.rate)}</td>
                                        <td className="text-right tabular-nums bg-muted/50 font-medium">{fmt(c.finalAmount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 font-medium [&>td]:px-2 [&>td]:py-2 [&>td]:tabular-nums">
                                    <td/>
                                    <td className="text-right">{fmtQty(totals.qty)}</td>
                                    <td colSpan={4} className="text-right text-muted-foreground">Totals</td>
                                    <td className="text-right bg-muted/50">{fmt(totals.finalAmount)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this order?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Order <span className="font-medium text-foreground">#{order.id}</span> and all its
                            line items will be permanently deleted. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={onDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={imagePreview !== null} onOpenChange={(open) => !open && closeImagePreview()}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Order image</DialogTitle>
                        <DialogDescription>
                            Copy this image to paste into WhatsApp, or cancel to discard it.
                        </DialogDescription>
                    </DialogHeader>
                    {imagePreview && (
                        <img src={imagePreview.url} alt={`Order #${order.id}`} className="w-full rounded border"/>
                    )}
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={closeImagePreview}>
                            Cancel
                        </Button>
                        <Button type="button" onClick={copyPreviewedImage}>
                            Copy
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
