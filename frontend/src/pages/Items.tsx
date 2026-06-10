import {useEffect, useState} from 'react';
import {Package, Plus} from 'lucide-react';
import {AddItem, ListItems, ListCompanies} from '../../wailsjs/go/main/App';
import {db} from '../../wailsjs/go/models';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {NumberInput} from '@/components/NumberInput';
import {CompanyCombobox} from '@/components/CompanyCombobox';
import {useUnsavedChanges} from '@/components/UnsavedChanges';
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

// Item master — maintains the list of products with their Pack Size, GST %, and HSN.
// See docs/DATA_MODEL.md (items table).
export function Items() {
    const [items, setItems] = useState<db.Item[]>([]);
    const [companies, setCompanies] = useState<db.Company[]>([]);
    const [company, setCompany] = useState<db.Company | null>(null);
    const [name, setName] = useState('');
    const [packSize, setPackSize] = useState('');
    const [gstPercent, setGstPercent] = useState('');
    const [hsn, setHsn] = useState('');
    const [error, setError] = useState('');
    const {setDirty} = useUnsavedChanges();

    // All fields are mandatory — Add is enabled only when a company is chosen and
    // every field is filled (filled = non-empty after trim; 0 is a valid value).
    const fields = [name, packSize, gstPercent, hsn];
    const isValid = company !== null && fields.every((v) => v.trim() !== '');
    // Dirty (warn before leaving) once any item field has content (company alone
    // isn't "unsaved work").
    const isDirty = fields.some((v) => v.trim() !== '');

    useEffect(() => {
        setDirty(isDirty);
    }, [isDirty, setDirty]);
    // Clear the guard if we unmount (e.g. after confirming "switch anyway").
    useEffect(() => () => setDirty(false), [setDirty]);

    async function refresh() {
        try {
            const [its, cos] = await Promise.all([ListItems(), ListCompanies()]);
            setItems(its);
            setCompanies(cos);
            setError('');
        } catch (e: any) {
            setError(String(e));
        }
    }

    useEffect(() => {
        refresh();
    }, []);

    async function add() {
        if (!isValid || !company) return;
        try {
            await AddItem(company.id, name.trim(), parseFloat(packSize) || 0, parseFloat(gstPercent) || 0, parseInt(hsn, 10) || 0);
            // Keep the company selected for quick consecutive adds; clear the rest.
            setName('');
            setPackSize('');
            setGstPercent('');
            setHsn('');
            await refresh();
        } catch (e: any) {
            setError(String(e));
        }
    }

    return (
        <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
                {items.length} {items.length === 1 ? 'item' : 'items'}
            </p>

            <Card>
                <CardHeader>
                    <CardTitle>Add item</CardTitle>
                    <CardDescription>Create a new item in the master list.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form
                        className="flex flex-wrap items-end gap-3"
                        onSubmit={(e) => {
                            e.preventDefault();
                            add();
                        }}
                    >
                        <div className="grid gap-2 w-56">
                            <Label htmlFor="company">Company</Label>
                            <CompanyCombobox
                                id="company"
                                companies={companies}
                                value={company}
                                onSelect={setCompany}
                            />
                        </div>
                        <div className="grid flex-1 gap-2 min-w-48">
                            <Label htmlFor="name">Item</Label>
                            <Input
                                id="name"
                                placeholder="e.g. Hand Wash"
                                autoComplete="off"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>
                        <div className="grid gap-2 w-32">
                            <Label htmlFor="packSize">Pack Size</Label>
                            <NumberInput
                                id="packSize"
                                placeholder="100"
                                value={packSize}
                                onChange={setPackSize}
                            />
                        </div>
                        <div className="grid gap-2 w-24">
                            <Label htmlFor="gstPercent">GST %</Label>
                            <NumberInput
                                id="gstPercent"
                                placeholder="18"
                                value={gstPercent}
                                onChange={setGstPercent}
                            />
                        </div>
                        <div className="grid gap-2 w-32">
                            <Label htmlFor="hsn">HSN</Label>
                            <NumberInput
                                id="hsn"
                                placeholder="3401"
                                value={hsn}
                                onChange={setHsn}
                            />
                        </div>
                        <Button type="submit" disabled={!isValid}>
                            <Plus className="size-4"/>
                            Add
                        </Button>
                    </form>
                    {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Items</CardTitle>
                </CardHeader>
                <CardContent>
                    {items.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                            <Package className="size-8 opacity-40"/>
                            <p className="text-sm">No items yet. Add one above to get started.</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Company</TableHead>
                                    <TableHead>Item</TableHead>
                                    <TableHead>Pack Size</TableHead>
                                    <TableHead className="text-right">GST %</TableHead>
                                    <TableHead>HSN</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {items.map((it) => (
                                    <TableRow key={it.id}>
                                        <TableCell className="text-muted-foreground">{it.companyName}</TableCell>
                                        <TableCell className="font-medium">{it.name}</TableCell>
                                        <TableCell>{it.packSize}</TableCell>
                                        <TableCell className="text-right tabular-nums">{it.gstPercent}</TableCell>
                                        <TableCell>{it.hsn}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
