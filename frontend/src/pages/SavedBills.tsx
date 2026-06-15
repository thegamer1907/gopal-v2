import {useEffect, useMemo, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {ArrowLeft, FileText, Pencil, Search, Trash2} from 'lucide-react';
import type {DateRange} from 'react-day-picker';
import {ListPurchaseBills, DeletePurchaseBill} from '../../wailsjs/go/main/App';
import {db} from '../../wailsjs/go/models';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
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
import {SortableHeader} from '@/components/SortableHeader';
import {DateRangeFilter} from '@/components/DateRangeFilter';
import {useTableSort} from '@/hooks/useTableSort';
import {parseDate} from '@/lib/date';
import {fmt, fmtQty, calcLine, LineCalc} from '@/lib/purchaseBill';

// View/Edit Bills — a list of every saved bill that opens a read-only detail, from
// which the bill can be edited (full overwrite) or deleted. The calculated columns
// aren't stored; they're recomputed from the saved raw fields plus the item's
// name/pack/GST, which the backend returns via a JOIN on the line's item_id
// (the current master value — see docs/DECISIONS.md).

function lineCalc(it: db.PurchaseBillItem): LineCalc {
    return calcLine({
        taxQty: it.taxQty,
        taxValue: it.taxValue,
        dQty: it.dQty,
        dValue: it.dValue,
        gstPercent: it.gstPercent,
        packSize: it.itemPackSize,
    });
}

// Per-bill summaries used by the list columns/sort.
const billValueOf = (bill: db.PurchaseBill): number =>
    bill.items.reduce((sum, it) => sum + lineCalc(it).billValue, 0);
const totalQtyOf = (bill: db.PurchaseBill): number =>
    bill.items.reduce((sum, it) => sum + it.taxQty + it.dQty, 0);

// Sort accessors for the bills list. Unparseable dates fall back to the epoch so they
// sort to the bottom under the default newest-first order.
const billSortAccessors = {
    company: (b: db.PurchaseBill) => b.companyName,
    date: (b: db.PurchaseBill) => parseDate(b.date) ?? new Date(0),
    billNumber: (b: db.PurchaseBill) => b.billNumber,
    qty: totalQtyOf,
    amount: billValueOf,
};

export function SavedBills() {
    const navigate = useNavigate();
    const [bills, setBills] = useState<db.PurchaseBill[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [range, setRange] = useState<DateRange | undefined>(undefined);

    function refresh() {
        return ListPurchaseBills()
            .then(setBills)
            .catch((e) => setError(String(e)))
            .finally(() => setLoading(false));
    }

    useEffect(() => {
        refresh();
    }, []);

    const selected = useMemo(
        () => bills.find((b) => b.id === selectedId) ?? null,
        [bills, selectedId],
    );

    // Filter by search (company or bill number) and by date range (inclusive, either
    // bound optional), then sort. The date range's `to` is taken as end-of-day.
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const from = range?.from;
        const to = range?.to;
        return bills.filter((b) => {
            if (q && !b.companyName.toLowerCase().includes(q) && !b.billNumber.toLowerCase().includes(q)) {
                return false;
            }
            if (from || to) {
                const d = parseDate(b.date);
                if (!d) return false;
                if (from && d < from) return false;
                if (to && d > new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999)) return false;
            }
            return true;
        });
    }, [bills, search, range]);

    const {sorted, sortKey, sortDir, toggle} = useTableSort(filtered, billSortAccessors, {
        key: 'date',
        dir: 'desc',
    });

    async function deleteBill(id: number) {
        try {
            await DeletePurchaseBill(id);
            setSelectedId(null);
            await refresh();
        } catch (e: any) {
            setError(String(e));
        }
    }

    if (loading) {
        return <p className="text-sm text-muted-foreground">Loading bills…</p>;
    }
    if (error) {
        return <p className="text-sm text-destructive">{error}</p>;
    }

    if (selected) {
        return (
            <BillDetail
                bill={selected}
                onBack={() => setSelectedId(null)}
                onEdit={() => navigate(`/purchase-bills/${selected.id}/edit`)}
                onDelete={() => deleteBill(selected.id)}
            />
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">View / Edit Bills</h1>
                <p className="text-sm text-muted-foreground">
                    {bills.length} saved bill{bills.length === 1 ? '' : 's'}. Click one to view, edit, or delete it.
                </p>
            </div>

            {bills.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                        <FileText className="size-8 text-muted-foreground"/>
                        <p className="text-sm text-muted-foreground">No purchase bills saved yet.</p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="relative w-64">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/>
                            <Input
                                className="pl-8"
                                placeholder="Search company or bill no.…"
                                autoComplete="off"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <DateRangeFilter value={range} onChange={setRange}/>
                    </div>

                    <Card>
                        <CardContent className="p-0">
                            {sorted.length === 0 ? (
                                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
                                    <Search className="size-8 opacity-40"/>
                                    <p className="text-sm">No bills match the current filters.</p>
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <SortableHeader label="Company" sortKey="company" activeKey={sortKey} dir={sortDir} onSort={toggle} className="pl-4"/>
                                            <SortableHeader label="Date" sortKey="date" activeKey={sortKey} dir={sortDir} onSort={toggle}/>
                                            <SortableHeader label="Bill number" sortKey="billNumber" activeKey={sortKey} dir={sortDir} onSort={toggle}/>
                                            <SortableHeader label="Qty" sortKey="qty" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right"/>
                                            <SortableHeader label="Amount" sortKey="amount" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" className="pr-4"/>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {sorted.map((bill) => (
                                            <TableRow
                                                key={bill.id}
                                                onClick={() => setSelectedId(bill.id)}
                                                className="cursor-pointer"
                                            >
                                                <TableCell className="pl-4 font-medium">{bill.companyName}</TableCell>
                                                <TableCell className="tabular-nums text-muted-foreground">{bill.date}</TableCell>
                                                <TableCell>{bill.billNumber}</TableCell>
                                                <TableCell className="text-right tabular-nums text-muted-foreground">{fmtQty(totalQtyOf(bill))}</TableCell>
                                                <TableCell className="pr-4 text-right tabular-nums font-medium">{fmt(billValueOf(bill))}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}

// Read-only detail for a single bill: header summary + the full line-items grid,
// using the same column layout as Add Purchase Bill. Offers Edit (opens the bill
// form) and Delete (with confirm).
function BillDetail({
    bill,
    onBack,
    onEdit,
    onDelete,
}: {
    bill: db.PurchaseBill;
    onBack: () => void;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const [confirmDelete, setConfirmDelete] = useState(false);
    const rows = bill.items.map((it) => ({it, c: lineCalc(it)}));
    // Running totals for every column except Pack Size, GST %, Billing Rate,
    // Final Rate and Remarks.
    const totals = rows.reduce(
        (acc, {it, c}) => {
            acc.taxQty += it.taxQty;
            acc.taxValue += it.taxValue;
            acc.dQty += it.dQty;
            acc.dValue += it.dValue;
            acc.gstAmount += c.gstAmount;
            acc.taxBillAmount += c.taxBillAmount;
            acc.billValue += c.billValue;
            acc.discount += it.discount;
            return acc;
        },
        {taxQty: 0, taxValue: 0, dQty: 0, dValue: 0, gstAmount: 0, taxBillAmount: 0, billValue: 0, discount: 0},
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
                <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
                    <ArrowLeft className="size-4"/>
                    Back to all bills
                </Button>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={onEdit}>
                        <Pencil className="size-4"/>
                        Edit bill
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setConfirmDelete(true)}
                    >
                        <Trash2 className="size-4"/>
                        Delete
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Bill {bill.billNumber}</CardTitle>
                    <CardDescription>
                        {bill.companyName} · {bill.date}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full border-separate border-spacing-0 text-sm">
                            <thead>
                                <tr className="text-center align-bottom text-muted-foreground [&>th]:px-1.5 [&>th]:pb-2 [&>th]:font-medium [&>th]:leading-tight">
                                    <th className="text-left">Item</th>
                                    <th className="w-12">Pack Size</th>
                                    <th className="w-10">GST %</th>
                                    <th className="w-14">Tax Qty</th>
                                    <th className="w-20">Tax Value</th>
                                    <th className="w-14">D Qty</th>
                                    <th className="w-20">D Value</th>
                                    <th className="w-16 bg-muted/50">GST Amount</th>
                                    <th className="w-16 bg-muted/50">Tax Bill Amount</th>
                                    <th className="w-16 bg-muted/50">Bill Value</th>
                                    <th className="w-16 bg-muted/50">Billing Rate</th>
                                    <th className="w-16 bg-muted/50">Final Rate</th>
                                    <th className="w-16">Discount</th>
                                    <th>Remarks</th>
                                </tr>
                            </thead>
                            <tbody className="[&>tr>td]:px-2 [&>tr>td]:py-1.5 [&>tr>td]:align-middle">
                                {rows.map(({it, c}, i) => (
                                    <tr key={i} className="border-t">
                                        <td className="font-medium">{it.itemName}</td>
                                        <td className="text-right tabular-nums text-muted-foreground">{it.itemPackSize}</td>
                                        <td className="text-right tabular-nums text-muted-foreground">{it.gstPercent}</td>
                                        <td className="text-right tabular-nums">{fmtQty(it.taxQty)}</td>
                                        <td className="text-right tabular-nums">{fmt(it.taxValue)}</td>
                                        <td className="text-right tabular-nums">{fmtQty(it.dQty)}</td>
                                        <td className="text-right tabular-nums">{fmt(it.dValue)}</td>
                                        <td className="text-right tabular-nums bg-muted/50">{fmt(c.gstAmount)}</td>
                                        <td className="text-right tabular-nums bg-muted/50">{fmt(c.taxBillAmount)}</td>
                                        <td className="text-right tabular-nums bg-muted/50 font-medium">{fmt(c.billValue)}</td>
                                        <td className="text-right tabular-nums bg-muted/50">{fmt(c.billingRate)}</td>
                                        <td className="text-right tabular-nums bg-muted/50">{fmt(c.finalRate)}</td>
                                        <td className="text-right tabular-nums">{it.discount ? fmt(it.discount) : '—'}</td>
                                        <td className="text-muted-foreground">{it.remarks || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 font-medium [&>td]:px-2 [&>td]:py-2 [&>td]:tabular-nums">
                                    <td colSpan={3} className="text-right text-muted-foreground">Totals</td>
                                    <td className="text-right">{fmtQty(totals.taxQty)}</td>
                                    <td className="text-right">{fmt(totals.taxValue)}</td>
                                    <td className="text-right">{fmtQty(totals.dQty)}</td>
                                    <td className="text-right">{fmt(totals.dValue)}</td>
                                    <td className="text-right bg-muted/50">{fmt(totals.gstAmount)}</td>
                                    <td className="text-right bg-muted/50">{fmt(totals.taxBillAmount)}</td>
                                    <td className="text-right bg-muted/50">{fmt(totals.billValue)}</td>
                                    <td colSpan={2} className="bg-muted/50"/>
                                    <td className="text-right">{fmt(totals.discount)}</td>
                                    <td/>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this bill?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Bill <span className="font-medium text-foreground">{bill.billNumber}</span> and all
                            its line items will be permanently deleted. This cannot be undone.
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
        </div>
    );
}
