import {useEffect, useState} from 'react';
import {useParams, useNavigate} from 'react-router-dom';
import {Plus, Trash2, Save, Info, Calendar as CalendarIcon} from 'lucide-react';
import {
    ListCustomers,
    ListItems,
    ListCompanies,
    AddSalesOrder,
    GetSalesOrder,
    UpdateSalesOrder,
    GetRateHistory,
} from '../../wailsjs/go/main/App';
import {db} from '../../wailsjs/go/models';
import {Button, buttonVariants} from '@/components/ui/button';
import {Label} from '@/components/ui/label';
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
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {ItemCombobox} from '@/components/ItemCombobox';
import {NewItemDialog} from '@/components/NewItemDialog';
import {CustomerCombobox} from '@/components/CustomerCombobox';
import {EditCustomerDialog} from '@/components/EditCustomerDialog';
import {RateHistoryDialog} from '@/components/RateHistoryDialog';
import {NumberInput} from '@/components/NumberInput';
import {useUnsavedChanges} from '@/components/UnsavedChanges';
import {Calendar} from '@/components/ui/calendar';
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover';
import {Input} from '@/components/ui/input';
import {cn} from '@/lib/utils';
import {num, fmt, fmtQty} from '@/lib/purchaseBill';
import {calcOrderLine} from '@/lib/salesOrder';
import {formatDate, todayDate, parseDate, displayDate} from '@/lib/date';

// Add Order — first piece of the Order Book / Sales feature. Header (Customer, Date)
// plus searchable line items; closely mirrors Add Purchase Bill, adapted since items
// aren't scoped to anything here (a sales order has no "company" the way a purchase bill
// does) and a line's Rate prefills from the customer's own rate history for that item.
// Also serves as the order editor (/orders/:id/edit), same dual-purpose pattern as
// AddPurchaseBill.tsx.

interface Line {
    id: number;
    item: db.Item | null;
    rate: string;
    qty: string;
    // Cached at item-selection time so the info button doesn't need to re-fetch.
    rateHistory: db.RateHistoryEntry[];
}

function blankLine(id: number): Line {
    return {id, item: null, rate: '', qty: '', rateHistory: []};
}

// Mandatory line fields are the item plus Rate and Qty. A line is "touched" once any
// field has content, and "complete" only when every mandatory field is filled.
function lineTouched(l: Line): boolean {
    return l.item !== null || [l.rate, l.qty].some((v) => v.trim() !== '');
}

function lineComplete(l: Line): boolean {
    return l.item !== null && [l.rate, l.qty].every((v) => v.trim() !== '');
}

function calc(line: Line) {
    return calcOrderLine({
        rate: num(line.rate),
        qty: num(line.qty),
        packSize: line.item?.packSize ?? 0,
    });
}

function sortByDateDesc(history: db.RateHistoryEntry[]): db.RateHistoryEntry[] {
    return [...history].sort(
        (a, b) => (parseDate(b.date)?.getTime() ?? 0) - (parseDate(a.date)?.getTime() ?? 0),
    );
}

export function AddOrder() {
    const {id} = useParams();
    const editId = id ? Number(id) : null;
    const navigate = useNavigate();

    const [customer, setCustomer] = useState<db.Customer | null>(null);
    const [date, setDate] = useState(todayDate());
    const [dateOpen, setDateOpen] = useState(false);
    const [lines, setLines] = useState<Line[]>([blankLine(1)]);
    const [nextId, setNextId] = useState(2);

    // Items are global here (not scoped to anything), unlike Add Purchase Bill.
    const [customersCache, setCustomersCache] = useState<db.Customer[]>([]);
    const [items, setItems] = useState<db.Item[]>([]);
    const [companies, setCompanies] = useState<db.Company[]>([]);

    const [itemDialog, setItemDialog] = useState<{open: boolean; lineId: number | null; name: string}>({
        open: false,
        lineId: null,
        name: '',
    });
    const [customerDialog, setCustomerDialog] = useState<{open: boolean; name: string}>({
        open: false,
        name: '',
    });
    const [historyLineId, setHistoryLineId] = useState<number | null>(null);
    // A customer switch the user has picked but not yet resolved (lines already have
    // items, so we ask whether to recalculate their rates or leave them as-is).
    const [pendingCustomer, setPendingCustomer] = useState<db.Customer | null>(null);
    // Bumped to force the customer combobox to re-sync its text to `customer` after a
    // cancelled switch.
    const [customerComboKey, setCustomerComboKey] = useState(0);

    const [error, setError] = useState('');
    const [saved, setSaved] = useState('');
    const {setDirty} = useUnsavedChanges();

    // Cache customers/items/companies once on load.
    useEffect(() => {
        ListCustomers().then(setCustomersCache).catch((e) => setError(String(e)));
        ListItems().then(setItems).catch((e) => setError(String(e)));
        ListCompanies().then(setCompanies).catch((e) => setError(String(e)));
    }, []);

    // Edit mode: load the order once and prefill the whole form (header + lines). Fetches
    // its own customers/items rather than relying on the cache effect above (avoids a
    // load-order race) — Customer must be resolved from a *real* db.Customer here, not a
    // partial reconstruction, since CustomerCombobox dereferences nickName/city directly.
    useEffect(() => {
        if (editId == null) return;
        let cancelled = false;
        (async () => {
            try {
                const order = await GetSalesOrder(editId);
                const [custs, its] = await Promise.all([ListCustomers(), ListItems()]);
                if (cancelled) return;
                setCustomersCache(custs);
                setItems(its);
                const itemById = new Map(its.map((it) => [it.id, it]));
                setCustomer(
                    custs.find((c) => c.id === order.customerId) ??
                        ({
                            id: order.customerId,
                            name: order.customerName,
                            nickName: '',
                            address1: '',
                            address2: '',
                            city: '',
                            state: '',
                            pincode: '',
                            gstin: '',
                            mobile: '',
                        } as db.Customer),
                );
                setDate(displayDate(order.date));
                const prefilled: Line[] = order.items.map((oi, i) => ({
                    id: i + 1,
                    item: itemById.get(oi.itemId) ?? null,
                    rate: String(oi.rate),
                    qty: String(oi.qty),
                    rateHistory: [],
                }));
                setLines(prefilled.length ? prefilled : [blankLine(1)]);
                setNextId(prefilled.length + 1);

                // Fetch (but don't use to re-prefill) rate history for each line, so the
                // info button works immediately without needing to reselect the item.
                prefilled.forEach((l) => {
                    if (!l.item) return;
                    GetRateHistory(order.customerId, l.item.id)
                        .then((h) => updateLine(l.id, {rateHistory: sortByDateDesc(h)}))
                        .catch((e) => setError(String(e)));
                });
            } catch (e: any) {
                if (!cancelled) setError(String(e));
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [editId]);

    // The form is valid (Save enabled) when a customer is chosen, the date is real, at
    // least one line is complete, and no partially-filled line is left over.
    const headerComplete = customer !== null && parseDate(date) !== undefined;
    const isValid =
        headerComplete &&
        lines.some(lineComplete) &&
        lines.every((l) => !lineTouched(l) || lineComplete(l));

    // Has the user entered anything worth warning about before leaving the page?
    const isDirty = customer !== null || lines.some(lineTouched);

    useEffect(() => {
        setDirty(isDirty);
    }, [isDirty, setDirty]);

    // Clear the guard if we unmount.
    useEffect(() => () => setDirty(false), [setDirty]);

    function updateLine(id: number, patch: Partial<Line>) {
        setLines((prev) => prev.map((l) => (l.id === id ? {...l, ...patch} : l)));
    }

    function addLine() {
        setLines((prev) => [...prev, blankLine(nextId)]);
        setNextId((n) => n + 1);
    }

    function removeLine(id: number) {
        setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));
        if (historyLineId === id) setHistoryLineId(null);
    }

    // Selecting an item prefills Rate from the customer's latest past rate for it (if
    // any) and caches the full history for the info button. Fires once, using whichever
    // customer is selected right now — doesn't retroactively refresh if the customer is
    // changed afterward.
    async function selectItem(lineId: number, item: db.Item) {
        updateLine(lineId, {item, rateHistory: []});
        if (!customer) return;
        try {
            const history = sortByDateDesc(await GetRateHistory(customer.id, item.id));
            updateLine(lineId, {
                rateHistory: history,
                rate: history.length ? String(history[0].rate) : '',
            });
        } catch (e: any) {
            setError(String(e));
        }
    }

    function openNewItem(lineId: number, name: string) {
        setItemDialog({open: true, lineId, name});
    }

    function onItemCreated(created: db.Item) {
        setItems((prev) => [...prev, created]);
        if (itemDialog.lineId !== null) selectItem(itemDialog.lineId, created);
    }

    function onCustomerCreated(created: db.Customer) {
        setCustomersCache((prev) => [...prev, created]);
        requestCustomer(created);
    }

    // Route every customer change here. If lines already have items and the customer
    // actually changes, ask whether to recalculate rates for the new customer or leave
    // them as-is; otherwise apply directly.
    function requestCustomer(next: db.Customer) {
        if (customer && next.id !== customer.id && lines.some((l) => l.item !== null)) {
            setPendingCustomer(next);
        } else {
            setCustomer(next);
        }
    }

    function keepRates() {
        if (pendingCustomer) setCustomer(pendingCustomer);
        setPendingCustomer(null);
    }

    async function recalculateRates() {
        const next = pendingCustomer;
        if (!next) return;
        setCustomer(next);
        setPendingCustomer(null);
        try {
            await Promise.all(
                lines
                    .filter((l) => l.item !== null)
                    .map(async (l) => {
                        const history = sortByDateDesc(await GetRateHistory(next.id, l.item!.id));
                        updateLine(l.id, {
                            rateHistory: history,
                            rate: history.length ? String(history[0].rate) : '',
                        });
                    }),
            );
        } catch (e: any) {
            setError(String(e));
        }
    }

    // Totals: just Qty and Final Amount, per the client's ask.
    const totals = lines.reduce(
        (acc, l) => {
            acc.qty += num(l.qty);
            acc.finalAmount += calc(l).finalAmount;
            return acc;
        },
        {qty: 0, finalAmount: 0},
    );

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setSaved('');

        if (!customer) {
            setError('Choose a customer.');
            return;
        }

        const filled = lines.filter((l) => l.item !== null);
        if (filled.length === 0) {
            setError('Add at least one line item.');
            return;
        }

        const order = {
            id: editId ?? 0,
            customerId: customer.id,
            customerName: customer.name,
            date: date.trim(),
            items: filled.map((l) => ({
                itemId: l.item!.id,
                rate: num(l.rate),
                qty: num(l.qty),
            })),
        };

        try {
            if (editId != null) {
                // Edit mode: complete overwrite, then return to the list.
                await UpdateSalesOrder(order as db.SalesOrder);
                setDirty(false);
                navigate('/orders');
                return;
            }
            const result = await AddSalesOrder(order as db.SalesOrder);
            setSaved(`Saved order #${result.id} with ${result.items.length} item(s).`);
            setCustomer(null);
            setDate(todayDate());
            setLines([blankLine(nextId)]);
            setNextId((n) => n + 1);
            // Refresh cached items so their Stock reflects the order just saved.
            ListItems().then(setItems).catch((e) => setError(String(e)));
        } catch (err: any) {
            setError(String(err));
        }
    }

    const historyLine = lines.find((l) => l.id === historyLineId) ?? null;

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {editId != null && (
                <h1 className="text-2xl font-semibold tracking-tight">Edit order</h1>
            )}
            <Card>
                <CardHeader>
                    <CardTitle>Order details</CardTitle>
                    <CardDescription>Who the order is for and its date.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-2">
                            <Label htmlFor="customer">Customer</Label>
                            <CustomerCombobox
                                key={customerComboKey}
                                id="customer"
                                customers={customersCache}
                                value={customer}
                                onSelect={requestCustomer}
                                onAddNew={(name) => setCustomerDialog({open: true, name})}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="date">Date</Label>
                            <div className="relative">
                                <Input
                                    id="date"
                                    placeholder="dd-mmm-yy"
                                    autoComplete="off"
                                    className="pr-9"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                />
                                <Popover open={dateOpen} onOpenChange={setDateOpen}>
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
                                            selected={parseDate(date)}
                                            defaultMonth={parseDate(date)}
                                            onSelect={(d) => {
                                                if (d) {
                                                    setDate(formatDate(d));
                                                    setDateOpen(false);
                                                }
                                            }}
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Line items</CardTitle>
                    <CardDescription>
                        Search an item to add a line. Rate prefills from this customer's last order for
                        it, if any.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="overflow-x-auto">
                        <table className="w-full border-separate border-spacing-0 text-sm">
                            <thead>
                                <tr className="text-center align-bottom text-muted-foreground [&>th]:px-1.5 [&>th]:pb-2 [&>th]:font-medium [&>th]:leading-tight">
                                    <th className="text-left">Item</th>
                                    <th className="w-12">Pack Size</th>
                                    <th className="w-10">GST %</th>
                                    <th className="w-14">HSN</th>
                                    <th className="w-16">Stock</th>
                                    <th className="w-20">Rate</th>
                                    <th className="w-14">Qty</th>
                                    <th className="w-24 bg-muted/50">Final Amount</th>
                                    <th className="w-8"/>
                                    <th className="w-8"/>
                                </tr>
                            </thead>
                            <tbody className="[&>tr>td]:px-2 [&>tr>td]:py-1.5 [&>tr>td]:align-middle">
                                {lines.map((line) => {
                                    const c = calc(line);
                                    return (
                                        <tr key={line.id} className="border-t">
                                            <td>
                                                <ItemCombobox
                                                    items={items}
                                                    value={line.item}
                                                    onSelect={(item) => selectItem(line.id, item)}
                                                    onAddNew={(name) => openNewItem(line.id, name)}
                                                    disabled={!customer}
                                                    placeholder={customer ? 'Search item…' : 'Select a customer first'}
                                                    showCompany
                                                />
                                            </td>
                                            <td className="text-right tabular-nums text-muted-foreground">
                                                {line.item ? line.item.packSize : '—'}
                                            </td>
                                            <td className="text-right tabular-nums text-muted-foreground">
                                                {line.item ? line.item.gstPercent : '—'}
                                            </td>
                                            <td className="text-right tabular-nums text-muted-foreground">
                                                {line.item ? line.item.hsn : '—'}
                                            </td>
                                            <td className="text-right tabular-nums text-muted-foreground">
                                                {line.item ? fmtQty(line.item.stock) : '—'}
                                            </td>
                                            <td>
                                                <NumberInput
                                                    className="w-20 text-right"
                                                    value={line.rate}
                                                    onChange={(v) => updateLine(line.id, {rate: v})}
                                                />
                                            </td>
                                            <td>
                                                <NumberInput
                                                    className="w-14 text-right"
                                                    value={line.qty}
                                                    onChange={(v) => updateLine(line.id, {qty: v})}
                                                />
                                            </td>
                                            <td className="text-right tabular-nums bg-muted/50 font-medium">
                                                {fmt(c.finalAmount)}
                                            </td>
                                            <td>
                                                <Button
                                                    type="button" variant="ghost" size="icon"
                                                    className="text-muted-foreground"
                                                    disabled={!line.item}
                                                    aria-label="Rate history"
                                                    onClick={() => setHistoryLineId(line.id)}
                                                >
                                                    <Info className="size-4"/>
                                                </Button>
                                            </td>
                                            <td>
                                                <Button
                                                    type="button" variant="ghost" size="icon"
                                                    className="text-muted-foreground hover:text-destructive"
                                                    disabled={lines.length === 1}
                                                    onClick={() => removeLine(line.id)}
                                                >
                                                    <Trash2 className="size-4"/>
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 font-medium [&>td]:px-2 [&>td]:py-2 [&>td]:tabular-nums">
                                    <td colSpan={6} className="text-right text-muted-foreground">Totals</td>
                                    <td className="text-right">{fmtQty(totals.qty)}</td>
                                    <td className="text-right bg-muted/50">{fmt(totals.finalAmount)}</td>
                                    <td colSpan={2}/>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    <div>
                        <Button type="button" variant="outline" size="sm" onClick={addLine}>
                            <Plus className="size-4"/>
                            Add row
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <div className="flex items-center justify-center gap-3">
                {error && <p className="text-sm text-destructive">{error}</p>}
                {saved && <p className="text-sm text-emerald-600">{saved}</p>}
                <Button type="submit" disabled={!isValid}>
                    <Save className="size-4"/>
                    {editId != null ? 'Update order' : 'Save order'}
                </Button>
            </div>

            <NewItemDialog
                open={itemDialog.open}
                initialName={itemDialog.name}
                companies={companies}
                defaultCompany={null}
                onOpenChange={(open) => setItemDialog((d) => ({...d, open}))}
                onCreated={onItemCreated}
            />

            <EditCustomerDialog
                open={customerDialog.open}
                customer={null}
                initialName={customerDialog.name}
                onOpenChange={(open) => setCustomerDialog((d) => ({...d, open, name: open ? d.name : ''}))}
                onSaved={onCustomerCreated}
            />

            <RateHistoryDialog
                open={historyLineId !== null}
                onOpenChange={(open) => !open && setHistoryLineId(null)}
                itemName={historyLine?.item?.name ?? ''}
                customerName={customer?.name ?? ''}
                history={historyLine?.rateHistory ?? []}
            />

            {/* Changing customer with items already on the order: offer to refresh rates
                from the new customer's history, or leave them as entered. */}
            <AlertDialog
                open={pendingCustomer !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        // Cancelled: drop the pending switch and re-sync the combobox text.
                        setPendingCustomer(null);
                        setCustomerComboKey((k) => k + 1);
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Change customer?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This order already has rates filled in. Recalculate them for{' '}
                            <span className="font-medium text-foreground">{pendingCustomer?.name}</span>{' '}
                            using their rate history, or keep the current rates as they are?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="outline" onClick={keepRates}>
                            Keep current rates
                        </AlertDialogAction>
                        <AlertDialogAction onClick={recalculateRates}>
                            Recalculate rates
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </form>
    );
}
