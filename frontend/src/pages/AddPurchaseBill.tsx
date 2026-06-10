import {useEffect, useState} from 'react';
import {useParams, useNavigate} from 'react-router-dom';
import {Plus, Trash2, Save, Calendar as CalendarIcon} from 'lucide-react';
import {
    ListItemsByCompany,
    ListCompanies,
    AddPurchaseBill as SavePurchaseBill,
    GetPurchaseBill,
    UpdatePurchaseBill,
} from '../../wailsjs/go/main/App';
import {db} from '../../wailsjs/go/models';
import {Button, buttonVariants} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
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
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {ItemCombobox} from '@/components/ItemCombobox';
import {NewItemDialog} from '@/components/NewItemDialog';
import {CompanyCombobox} from '@/components/CompanyCombobox';
import {NewCompanyDialog} from '@/components/NewCompanyDialog';
import {NumberInput} from '@/components/NumberInput';
import {useUnsavedChanges} from '@/components/UnsavedChanges';
import {Calendar} from '@/components/ui/calendar';
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover';
import {cn} from '@/lib/utils';
import {num, fmt, calcLine} from '@/lib/purchaseBill';
import {formatDate, todayDate, parseDate} from '@/lib/date';

// Add Purchase Bill — header (Company, Bill number, Date) plus searchable line items.
// Items are cached on load; each line is calculated live. New items can be added on the
// fly via a dialog. Saving persists the whole bill (see docs/UI.md, docs/DATA_MODEL.md).

interface Line {
    id: number;
    item: db.Item | null;
    taxQty: string;
    taxValue: string;
    dQty: string;
    dValue: string;
    discount: string;
    remarks: string;
}

function blankLine(id: number): Line {
    return {id, item: null, taxQty: '', taxValue: '', dQty: '', dValue: '', discount: '', remarks: ''};
}

// Mandatory line fields are the item plus the four numeric inputs; Discount and
// Remarks are optional. A line is "touched" once any field has content, and
// "complete" only when every mandatory field is filled.
function lineTouched(l: Line): boolean {
    return (
        l.item !== null ||
        [l.taxQty, l.taxValue, l.dQty, l.dValue, l.discount, l.remarks].some((v) => v.trim() !== '')
    );
}

function lineComplete(l: Line): boolean {
    return (
        l.item !== null &&
        [l.taxQty, l.taxValue, l.dQty, l.dValue].every((v) => v.trim() !== '')
    );
}

// Derived (display-only) values for an editable line — reads the string inputs and
// the selected item, then defers to the shared formula in @/lib/purchaseBill.
function calc(line: Line) {
    return calcLine({
        taxQty: num(line.taxQty),
        taxValue: num(line.taxValue),
        dQty: num(line.dQty),
        dValue: num(line.dValue),
        gstPercent: line.item?.gstPercent ?? 0,
        packSize: line.item?.packSize ?? 0,
    });
}

// The bill form serves both adding (/purchase-bills/new) and editing
// (/purchase-bills/:id/edit). In edit mode it prefills from the saved bill and
// saving does a complete overwrite via UpdatePurchaseBill.
export function AddPurchaseBill() {
    const {id} = useParams();
    const editId = id ? Number(id) : null;
    const navigate = useNavigate();

    const [company, setCompany] = useState<db.Company | null>(null);
    const [billNumber, setBillNumber] = useState('');
    const [date, setDate] = useState(todayDate());
    const [dateOpen, setDateOpen] = useState(false);
    const [lines, setLines] = useState<Line[]>([blankLine(1)]);
    const [nextId, setNextId] = useState(2);

    // Items are company-scoped: fetched for the selected company, not cached globally.
    const [itemsForCompany, setItemsForCompany] = useState<db.Item[]>([]);
    const [companiesCache, setCompaniesCache] = useState<db.Company[]>([]);
    const [dialog, setDialog] = useState<{open: boolean; lineId: number | null; name: string}>({
        open: false,
        lineId: null,
        name: '',
    });
    const [companyDialog, setCompanyDialog] = useState<{open: boolean; name: string}>({
        open: false,
        name: '',
    });
    // A company switch the user has picked but not yet confirmed (would clear lines).
    const [pendingCompany, setPendingCompany] = useState<db.Company | null>(null);
    // Bumped to force the company combobox to re-sync its text to `company` after a
    // cancelled switch.
    const [companyComboKey, setCompanyComboKey] = useState(0);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState('');
    const {setDirty} = useUnsavedChanges();

    // Cache the company list once on load.
    useEffect(() => {
        ListCompanies()
            .then(setCompaniesCache)
            .catch((e) => setError(String(e)));
    }, []);

    // Fetch the selected company's items whenever the company changes.
    useEffect(() => {
        if (!company) {
            setItemsForCompany([]);
            return;
        }
        ListItemsByCompany(company.id)
            .then(setItemsForCompany)
            .catch((e) => setError(String(e)));
    }, [company]);

    // Edit mode: load the bill once and prefill the whole form (header + lines).
    useEffect(() => {
        if (editId == null) return;
        let cancelled = false;
        (async () => {
            try {
                const bill = await GetPurchaseBill(editId);
                const items = await ListItemsByCompany(bill.companyId);
                if (cancelled) return;
                const itemById = new Map(items.map((it) => [it.id, it]));
                setItemsForCompany(items);
                setCompany({id: bill.companyId, name: bill.companyName} as db.Company);
                setBillNumber(bill.billNumber);
                setDate(bill.date);
                const prefilled: Line[] = bill.items.map((bi, i) => ({
                    id: i + 1,
                    item: itemById.get(bi.itemId) ?? null,
                    taxQty: String(bi.taxQty),
                    taxValue: String(bi.taxValue),
                    dQty: String(bi.dQty),
                    dValue: String(bi.dValue),
                    discount: bi.discount ? String(bi.discount) : '',
                    remarks: bi.remarks,
                }));
                setLines(prefilled.length ? prefilled : [blankLine(1)]);
                setNextId(prefilled.length + 1);
            } catch (e: any) {
                if (!cancelled) setError(String(e));
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [editId]);

    // The form is valid (Save enabled) when the header is filled with a real date,
    // at least one line is complete, and no partially-filled line is left over.
    const headerComplete =
        company !== null &&
        billNumber.trim() !== '' &&
        parseDate(date) !== undefined;
    const isValid =
        headerComplete &&
        lines.some(lineComplete) &&
        lines.every((l) => !lineTouched(l) || lineComplete(l));

    // Has the user entered anything worth warning about before leaving the page?
    const isDirty =
        company !== null || billNumber.trim() !== '' || lines.some(lineTouched);

    useEffect(() => {
        setDirty(isDirty);
    }, [isDirty, setDirty]);

    // Clear the guard if we unmount (e.g. after confirming "switch anyway").
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
    }

    function openNewItem(lineId: number, name: string) {
        setDialog({open: true, lineId, name});
    }

    function onItemCreated(created: db.Item) {
        // Only attach/cache the new item if it belongs to the bill's company; an
        // item added under a different company is saved to the master only.
        if (company && created.companyId === company.id) {
            setItemsForCompany((prev) => [...prev, created]);
            if (dialog.lineId !== null) updateLine(dialog.lineId, {item: created});
        }
    }

    // Apply a company selection: switch and reset the line grid (items are
    // company-scoped, so any previously-picked items no longer apply).
    function applyCompany(next: db.Company) {
        setCompany(next);
        setLines([blankLine(nextId)]);
        setNextId((n) => n + 1);
    }

    // Route every company change here. If lines already have items and the company
    // actually changes, confirm first (it clears the lines); otherwise apply directly.
    function requestCompany(next: db.Company) {
        if (company && next.id !== company.id && lines.some((l) => l.item !== null)) {
            setPendingCompany(next);
        } else {
            applyCompany(next);
        }
    }

    function onCompanyCreated(created: db.Company) {
        setCompaniesCache((prev) => [...prev, created]);
        requestCompany(created);
    }

    // Running totals for every column except Pack Size, GST %, Billing Rate,
    // Final Rate and Remarks.
    const totals = lines.reduce(
        (acc, l) => {
            const c = calc(l);
            acc.taxQty += num(l.taxQty);
            acc.taxValue += num(l.taxValue);
            acc.dQty += num(l.dQty);
            acc.dValue += num(l.dValue);
            acc.gstAmount += c.gstAmount;
            acc.taxBillAmount += c.taxBillAmount;
            acc.billValue += c.billValue;
            acc.discount += num(l.discount);
            return acc;
        },
        {taxQty: 0, taxValue: 0, dQty: 0, dValue: 0, gstAmount: 0, taxBillAmount: 0, billValue: 0, discount: 0},
    );

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setSaved('');

        if (!company) {
            setError('Choose a company.');
            return;
        }

        const filled = lines.filter((l) => l.item !== null);
        if (filled.length === 0) {
            setError('Add at least one line item.');
            return;
        }

        const bill = {
            id: editId ?? 0,
            companyId: company.id,
            companyName: company.name,
            billNumber: billNumber.trim(),
            date: date.trim(),
            items: filled.map((l) => ({
                itemId: l.item!.id,
                taxQty: num(l.taxQty),
                taxValue: num(l.taxValue),
                dQty: num(l.dQty),
                dValue: num(l.dValue),
                discount: num(l.discount),
                remarks: l.remarks.trim(),
            })),
        };

        try {
            if (editId != null) {
                // Edit mode: complete overwrite, then return to the list.
                await UpdatePurchaseBill(bill as db.PurchaseBill);
                setDirty(false);
                navigate('/purchase-bills');
                return;
            }
            const result = await SavePurchaseBill(bill as db.PurchaseBill);
            setSaved(`Saved bill #${result.id} with ${result.items.length} item(s).`);
            setCompany(null);
            setBillNumber('');
            setDate(todayDate());
            setLines([blankLine(nextId)]);
            setNextId((n) => n + 1);
        } catch (err: any) {
            setError(String(err));
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {editId != null && (
                <h1 className="text-2xl font-semibold tracking-tight">Edit purchase bill</h1>
            )}
            <Card>
                <CardHeader>
                    <CardTitle>Purchase bill details</CardTitle>
                    <CardDescription>Who the bill is from and its bill number.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 sm:grid-cols-3">
                        <div className="grid gap-2">
                            <Label htmlFor="company">Company name</Label>
                            <CompanyCombobox
                                key={companyComboKey}
                                id="company"
                                companies={companiesCache}
                                value={company}
                                onSelect={requestCompany}
                                onAddNew={(name) => setCompanyDialog({open: true, name})}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="bill">Bill number</Label>
                            <Input
                                id="bill"
                                placeholder="e.g. INV-1042"
                                autoComplete="off"
                                value={billNumber}
                                onChange={(e) => setBillNumber(e.target.value)}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="date">Date</Label>
                            <div className="relative">
                                <Input
                                    id="date"
                                    placeholder="dd-mmm-yyyy"
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
                        Search an item to add a line. Calculated columns update automatically.
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
                                                    items={itemsForCompany}
                                                    value={line.item}
                                                    onSelect={(item) => updateLine(line.id, {item})}
                                                    onAddNew={(name) => openNewItem(line.id, name)}
                                                    disabled={!company}
                                                    placeholder={company ? 'Search item…' : 'Select a company first'}
                                                />
                                            </td>
                                            <td className="text-right tabular-nums text-muted-foreground">
                                                {line.item ? line.item.packSize : '—'}
                                            </td>
                                            <td className="text-right tabular-nums text-muted-foreground">
                                                {line.item ? line.item.gstPercent : '—'}
                                            </td>
                                            <td>
                                                <NumberInput
                                                    className="w-14 text-right"
                                                    value={line.taxQty}
                                                    onChange={(v) => updateLine(line.id, {taxQty: v})}
                                                />
                                            </td>
                                            <td>
                                                <NumberInput
                                                    className="w-20 text-right"
                                                    value={line.taxValue}
                                                    onChange={(v) => updateLine(line.id, {taxValue: v})}
                                                />
                                            </td>
                                            <td>
                                                <NumberInput
                                                    className="w-14 text-right"
                                                    value={line.dQty}
                                                    onChange={(v) => updateLine(line.id, {dQty: v})}
                                                />
                                            </td>
                                            <td>
                                                <NumberInput
                                                    className="w-20 text-right"
                                                    value={line.dValue}
                                                    onChange={(v) => updateLine(line.id, {dValue: v})}
                                                />
                                            </td>
                                            <td className="text-right tabular-nums bg-muted/50">{fmt(c.gstAmount)}</td>
                                            <td className="text-right tabular-nums bg-muted/50">{fmt(c.taxBillAmount)}</td>
                                            <td className="text-right tabular-nums bg-muted/50 font-medium">{fmt(c.billValue)}</td>
                                            <td className="text-right tabular-nums bg-muted/50">{fmt(c.billingRate)}</td>
                                            <td className="text-right tabular-nums bg-muted/50">{fmt(c.finalRate)}</td>
                                            <td>
                                                <NumberInput
                                                    className="w-16 text-right"
                                                    value={line.discount}
                                                    onChange={(v) => updateLine(line.id, {discount: v})}
                                                />
                                            </td>
                                            <td>
                                                <Input
                                                    className="w-32"
                                                    autoComplete="off"
                                                    value={line.remarks}
                                                    onChange={(e) => updateLine(line.id, {remarks: e.target.value})}
                                                />
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
                                    <td colSpan={3} className="text-right text-muted-foreground">Totals</td>
                                    <td className="text-right">{fmt(totals.taxQty)}</td>
                                    <td className="text-right">{fmt(totals.taxValue)}</td>
                                    <td className="text-right">{fmt(totals.dQty)}</td>
                                    <td className="text-right">{fmt(totals.dValue)}</td>
                                    <td className="text-right bg-muted/50">{fmt(totals.gstAmount)}</td>
                                    <td className="text-right bg-muted/50">{fmt(totals.taxBillAmount)}</td>
                                    <td className="text-right bg-muted/50">{fmt(totals.billValue)}</td>
                                    <td colSpan={2} className="bg-muted/50"/>
                                    <td className="text-right">{fmt(totals.discount)}</td>
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
                    {editId != null ? 'Update bill' : 'Save purchase bill'}
                </Button>
            </div>

            <NewItemDialog
                open={dialog.open}
                initialName={dialog.name}
                companies={companiesCache}
                defaultCompany={company}
                onOpenChange={(open) => setDialog((d) => ({...d, open}))}
                onCreated={onItemCreated}
            />

            <NewCompanyDialog
                open={companyDialog.open}
                initialName={companyDialog.name}
                onOpenChange={(open) => setCompanyDialog((d) => ({...d, open}))}
                onCreated={onCompanyCreated}
            />

            {/* Confirm switching company when lines already have items (clears them). */}
            <AlertDialog
                open={pendingCompany !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        // Cancelled: drop the pending switch and re-sync the combobox text.
                        setPendingCompany(null);
                        setCompanyComboKey((k) => k + 1);
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Switch company?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Items belong to a company, so switching clears the current line items.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (pendingCompany) applyCompany(pendingCompany);
                                setPendingCompany(null);
                            }}
                        >
                            Switch
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </form>
    );
}
