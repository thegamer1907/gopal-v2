import {useEffect, useState} from 'react';
import {Plus, Trash2, Save, Calendar as CalendarIcon} from 'lucide-react';
import {ListItems, ListCompanies, AddPurchaseBill as SavePurchaseBill} from '../../wailsjs/go/main/App';
import {db} from '../../wailsjs/go/models';
import {Button, buttonVariants} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
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

function fmtDDMMYYYY(d: Date): string {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
}

function todayDDMMYYYY(): string {
    return fmtDDMMYYYY(new Date());
}

// Parse a dd/mm/yyyy string into a Date, or undefined if it isn't a real calendar date.
function parseDDMMYYYY(s: string): Date | undefined {
    const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return undefined;
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    const d = new Date(yyyy, mm - 1, dd);
    // Round-trip check rejects overflow like 32/13/2026.
    if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) {
        return undefined;
    }
    return d;
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

export function AddPurchaseBill() {
    const [company, setCompany] = useState<db.Company | null>(null);
    const [billNumber, setBillNumber] = useState('');
    const [date, setDate] = useState(todayDDMMYYYY());
    const [dateOpen, setDateOpen] = useState(false);
    const [lines, setLines] = useState<Line[]>([blankLine(1)]);
    const [nextId, setNextId] = useState(2);

    const [itemsCache, setItemsCache] = useState<db.Item[]>([]);
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
    const [error, setError] = useState('');
    const [saved, setSaved] = useState('');
    const {setDirty} = useUnsavedChanges();

    // Cache all items and companies once on load.
    useEffect(() => {
        ListItems()
            .then(setItemsCache)
            .catch((e) => setError(String(e)));
        ListCompanies()
            .then(setCompaniesCache)
            .catch((e) => setError(String(e)));
    }, []);

    // The form is valid (Save enabled) when the header is filled with a real date,
    // at least one line is complete, and no partially-filled line is left over.
    const headerComplete =
        company !== null &&
        billNumber.trim() !== '' &&
        parseDDMMYYYY(date) !== undefined;
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

    function onItemCreated(item: db.Item) {
        setItemsCache((prev) => [...prev, item]);
        if (dialog.lineId !== null) updateLine(dialog.lineId, {item});
    }

    function onCompanyCreated(created: db.Company) {
        setCompaniesCache((prev) => [...prev, created]);
        setCompany(created);
    }

    const totals = lines.reduce(
        (acc, l) => {
            const c = calc(l);
            acc.taxBillAmount += c.taxBillAmount;
            acc.billValue += c.billValue;
            return acc;
        },
        {taxBillAmount: 0, billValue: 0},
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
            id: 0,
            companyId: company.id,
            companyName: company.name,
            billNumber: billNumber.trim(),
            date: date.trim(),
            items: filled.map((l) => ({
                itemName: l.item!.name,
                itemPackSize: l.item!.packSize,
                taxQty: num(l.taxQty),
                taxValue: num(l.taxValue),
                dQty: num(l.dQty),
                dValue: num(l.dValue),
                discount: num(l.discount),
                remarks: l.remarks.trim(),
            })),
        };

        try {
            const result = await SavePurchaseBill(bill as db.PurchaseBill);
            setSaved(`Saved bill #${result.id} with ${result.items.length} item(s).`);
            setCompany(null);
            setBillNumber('');
            setDate(todayDDMMYYYY());
            setLines([blankLine(nextId)]);
            setNextId((n) => n + 1);
        } catch (err: any) {
            setError(String(err));
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
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
                                id="company"
                                companies={companiesCache}
                                value={company}
                                onSelect={setCompany}
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
                                    placeholder="dd/mm/yyyy"
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
                                            selected={parseDDMMYYYY(date)}
                                            defaultMonth={parseDDMMYYYY(date)}
                                            onSelect={(d) => {
                                                if (d) {
                                                    setDate(fmtDDMMYYYY(d));
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
                                                    items={itemsCache}
                                                    value={line.item}
                                                    onSelect={(item) => updateLine(line.id, {item})}
                                                    onAddNew={(name) => openNewItem(line.id, name)}
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
                                <tr className="border-t-2 font-medium [&>td]:px-1.5 [&>td]:py-2">
                                    <td colSpan={7} className="text-right text-muted-foreground">
                                        Totals
                                    </td>
                                    <td className="bg-muted/50"/>
                                    <td className="text-right tabular-nums bg-muted/50">
                                        {fmt(totals.taxBillAmount)}
                                    </td>
                                    <td className="text-right tabular-nums bg-muted/50">
                                        {fmt(totals.billValue)}
                                    </td>
                                    <td colSpan={5} className="bg-muted/50"/>
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

            <div className="flex items-center justify-end gap-3">
                {error && <p className="text-sm text-destructive">{error}</p>}
                {saved && <p className="text-sm text-emerald-600">{saved}</p>}
                <Button type="submit" disabled={!isValid}>
                    <Save className="size-4"/>
                    Save purchase bill
                </Button>
            </div>

            <NewItemDialog
                open={dialog.open}
                initialName={dialog.name}
                onOpenChange={(open) => setDialog((d) => ({...d, open}))}
                onCreated={onItemCreated}
            />

            <NewCompanyDialog
                open={companyDialog.open}
                initialName={companyDialog.name}
                onOpenChange={(open) => setCompanyDialog((d) => ({...d, open}))}
                onCreated={onCompanyCreated}
            />
        </form>
    );
}
