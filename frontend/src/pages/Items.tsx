import {useEffect, useMemo, useState} from 'react';
import {Package, Pencil, Plus, Search, Trash2} from 'lucide-react';
import {AddItem, DeleteItem, ListItems, ListCompanies} from '../../wailsjs/go/main/App';
import {db} from '../../wailsjs/go/models';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {NumberInput} from '@/components/NumberInput';
import {CompanyCombobox} from '@/components/CompanyCombobox';
import {EditItemDialog} from '@/components/EditItemDialog';
import {SortableHeader} from '@/components/SortableHeader';
import {useTableSort} from '@/hooks/useTableSort';
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
    const [search, setSearch] = useState('');
    const [editing, setEditing] = useState<db.Item | null>(null);
    const [deleting, setDeleting] = useState<db.Item | null>(null);
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

    // Search filters by item name or company name (so the box doubles as a
    // filter-by-company). Matches the company-then-item order from ListItems.
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return items;
        return items.filter(
            (it) => it.name.toLowerCase().includes(q) || it.companyName.toLowerCase().includes(q),
        );
    }, [items, search]);

    // Sortable columns; default grouped by company then item (matches ListItems order).
    const {sorted, sortKey, sortDir, toggle} = useTableSort(
        filtered,
        {
            company: (it) => it.companyName,
            name: (it) => it.name,
            packSize: (it) => it.packSize,
            gstPercent: (it) => it.gstPercent,
            hsn: (it) => it.hsn,
        },
        {key: 'company', dir: 'asc'},
    );

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

    async function remove() {
        if (!deleting) return;
        try {
            await DeleteItem(deleting.id);
            setDeleting(null);
            await refresh();
        } catch (e: any) {
            setDeleting(null);
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
                <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
                    <CardTitle>Items</CardTitle>
                    {items.length > 0 && (
                        <div className="relative w-64">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/>
                            <Input
                                className="pl-8"
                                placeholder="Search item or company…"
                                autoComplete="off"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    )}
                </CardHeader>
                <CardContent>
                    {items.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                            <Package className="size-8 opacity-40"/>
                            <p className="text-sm">No items yet. Add one above to get started.</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                            <Search className="size-8 opacity-40"/>
                            <p className="text-sm">No items match "{search}".</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <SortableHeader label="Company" sortKey="company" activeKey={sortKey} dir={sortDir} onSort={toggle}/>
                                    <SortableHeader label="Item" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={toggle}/>
                                    <SortableHeader label="Pack Size" sortKey="packSize" activeKey={sortKey} dir={sortDir} onSort={toggle}/>
                                    <SortableHeader label="GST %" sortKey="gstPercent" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right"/>
                                    <SortableHeader label="HSN" sortKey="hsn" activeKey={sortKey} dir={sortDir} onSort={toggle}/>
                                    <TableHead className="w-24 text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sorted.map((it) => (
                                    <TableRow key={it.id}>
                                        <TableCell className="text-muted-foreground">{it.companyName}</TableCell>
                                        <TableCell className="font-medium">{it.name}</TableCell>
                                        <TableCell>{it.packSize}</TableCell>
                                        <TableCell className="text-right tabular-nums">{it.gstPercent}</TableCell>
                                        <TableCell>{it.hsn}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="size-8"
                                                    aria-label={`Edit ${it.name}`}
                                                    onClick={() => setEditing(it)}
                                                >
                                                    <Pencil className="size-4"/>
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="size-8 text-destructive hover:text-destructive"
                                                    aria-label={`Delete ${it.name}`}
                                                    onClick={() => setDeleting(it)}
                                                >
                                                    <Trash2 className="size-4"/>
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <EditItemDialog
                open={editing !== null}
                onOpenChange={(o) => !o && setEditing(null)}
                item={editing}
                companies={companies}
                onUpdated={() => {
                    setEditing(null);
                    refresh();
                }}
            />

            <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this item?</AlertDialogTitle>
                        <AlertDialogDescription>
                            <span className="font-medium text-foreground">{deleting?.name}</span>
                            {deleting ? ` (${deleting.companyName})` : ''} will be permanently deleted.
                            This is blocked if any bills still use it.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={remove}
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
