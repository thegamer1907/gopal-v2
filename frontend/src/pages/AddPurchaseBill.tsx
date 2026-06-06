import {useEffect, useState} from 'react';
import {Plus, Trash2, Save} from 'lucide-react';
import {ListItems, AddPurchaseBill as SavePurchaseBill} from '../../wailsjs/go/main/App';
import {db} from '../../wailsjs/go/models';
import {Button} from '@/components/ui/button';
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

function num(v: string): number {
    return parseFloat(v) || 0;
}

function todayDDMMYYYY(): string {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
}

// Derived (display-only) values for a line, per the agreed formulas.
function calc(line: Line) {
    const taxQty = num(line.taxQty);
    const taxValue = num(line.taxValue);
    const dQty = num(line.dQty);
    const dValue = num(line.dValue);
    const gstPercent = line.item?.gstPercent ?? 0;
    const packSize = line.item?.packSize ?? 0;

    const gstAmount = (taxValue * gstPercent) / 100;
    const totalTaxBillAmount = taxValue + gstAmount;
    const totalBillValue = totalTaxBillAmount + dValue;
    const qty = taxQty + dQty;
    const finalRate = qty ? (totalBillValue / qty) * packSize : 0;
    const finalBillingRate = taxQty ? taxValue / taxQty : 0;

    return {gstAmount, totalTaxBillAmount, totalBillValue, finalRate, finalBillingRate};
}

function fmt(n: number): string {
    return n.toFixed(2);
}

export function AddPurchaseBill() {
    const [company, setCompany] = useState('');
    const [billNumber, setBillNumber] = useState('');
    const [date, setDate] = useState(todayDDMMYYYY());
    const [lines, setLines] = useState<Line[]>([blankLine(1)]);
    const [nextId, setNextId] = useState(2);

    const [itemsCache, setItemsCache] = useState<db.Item[]>([]);
    const [dialog, setDialog] = useState<{open: boolean; lineId: number | null; name: string}>({
        open: false,
        lineId: null,
        name: '',
    });
    const [error, setError] = useState('');
    const [saved, setSaved] = useState('');

    // Cache all items once on load.
    useEffect(() => {
        ListItems()
            .then(setItemsCache)
            .catch((e) => setError(String(e)));
    }, []);

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

    const grandTotal = lines.reduce((sum, l) => sum + calc(l).totalBillValue, 0);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setSaved('');

        const filled = lines.filter((l) => l.item !== null);
        if (filled.length === 0) {
            setError('Add at least one line item.');
            return;
        }

        const bill = {
            id: 0,
            company: company.trim(),
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
            setCompany('');
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
                            <Input
                                id="company"
                                placeholder="e.g. Acme Supplies"
                                autoComplete="off"
                                value={company}
                                onChange={(e) => setCompany(e.target.value)}
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
                            <Input
                                id="date"
                                placeholder="dd/mm/yyyy"
                                autoComplete="off"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                            />
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
                                <tr className="text-left text-muted-foreground [&>th]:px-2 [&>th]:pb-2 [&>th]:font-medium [&>th]:whitespace-nowrap">
                                    <th>Item</th>
                                    <th className="text-right">Pack Size</th>
                                    <th className="text-right">GST %</th>
                                    <th className="text-right">Tax Qty</th>
                                    <th className="text-right">Tax Value</th>
                                    <th className="text-right">D-Qty</th>
                                    <th className="text-right">D-Value</th>
                                    <th className="text-right">Discount</th>
                                    <th>Remarks</th>
                                    <th className="text-right bg-muted/50">GST Amt</th>
                                    <th className="text-right bg-muted/50">Total Tax Bill Amt</th>
                                    <th className="text-right bg-muted/50">Total Bill Value</th>
                                    <th className="text-right bg-muted/50">Final Rate</th>
                                    <th className="text-right bg-muted/50">Final Billing Rate</th>
                                    <th/>
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
                                                <Input
                                                    type="number" step="0.01" min="0"
                                                    className="w-24 text-right"
                                                    value={line.taxQty}
                                                    onChange={(e) => updateLine(line.id, {taxQty: e.target.value})}
                                                />
                                            </td>
                                            <td>
                                                <Input
                                                    type="number" step="0.01" min="0"
                                                    className="w-24 text-right"
                                                    value={line.taxValue}
                                                    onChange={(e) => updateLine(line.id, {taxValue: e.target.value})}
                                                />
                                            </td>
                                            <td>
                                                <Input
                                                    type="number" step="0.01" min="0"
                                                    className="w-24 text-right"
                                                    value={line.dQty}
                                                    onChange={(e) => updateLine(line.id, {dQty: e.target.value})}
                                                />
                                            </td>
                                            <td>
                                                <Input
                                                    type="number" step="0.01" min="0"
                                                    className="w-24 text-right"
                                                    value={line.dValue}
                                                    onChange={(e) => updateLine(line.id, {dValue: e.target.value})}
                                                />
                                            </td>
                                            <td>
                                                <Input
                                                    type="number" step="0.01" min="0"
                                                    className="w-24 text-right"
                                                    value={line.discount}
                                                    onChange={(e) => updateLine(line.id, {discount: e.target.value})}
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
                                            <td className="text-right tabular-nums bg-muted/50">{fmt(c.gstAmount)}</td>
                                            <td className="text-right tabular-nums bg-muted/50">{fmt(c.totalTaxBillAmount)}</td>
                                            <td className="text-right tabular-nums bg-muted/50 font-medium">{fmt(c.totalBillValue)}</td>
                                            <td className="text-right tabular-nums bg-muted/50">{fmt(c.finalRate)}</td>
                                            <td className="text-right tabular-nums bg-muted/50">{fmt(c.finalBillingRate)}</td>
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
                        </table>
                    </div>

                    <div className="flex items-center justify-between">
                        <Button type="button" variant="outline" size="sm" onClick={addLine}>
                            <Plus className="size-4"/>
                            Add row
                        </Button>
                        <div className="text-sm text-muted-foreground">
                            Bill total:{' '}
                            <span className="text-base font-semibold tabular-nums text-foreground">
                                {fmt(grandTotal)}
                            </span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="flex items-center justify-end gap-3">
                {error && <p className="text-sm text-destructive">{error}</p>}
                {saved && <p className="text-sm text-emerald-600">{saved}</p>}
                <Button type="submit">
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
        </form>
    );
}
