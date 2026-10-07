import {useEffect, useMemo, useState} from 'react';
import {Building2, Pencil, Plus, Search, Trash2} from 'lucide-react';
import {AddCompany, DeleteCompany, ListCompanies} from '../../wailsjs/go/main/App';
import {db} from '../../wailsjs/go/models';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {EditCompanyDialog} from '@/components/EditCompanyDialog';
import {SortableHeader} from '@/components/SortableHeader';
import {useTableSort} from '@/hooks/useTableSort';
import {useUnsavedChanges} from '@/components/UnsavedChanges';
import {Card, CardContent, CardHeader} from '@/components/ui/card';
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

// Company master — maintains the list of companies bills can be raised against.
// Just a name for now; more columns to follow. See docs/DATA_MODEL.md (companies).
export function Companies() {
    const [companies, setCompanies] = useState<db.Company[]>([]);
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [editing, setEditing] = useState<db.Company | null>(null);
    const [deleting, setDeleting] = useState<db.Company | null>(null);
    const [search, setSearch] = useState('');
    const {setDirty} = useUnsavedChanges();

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return q ? companies.filter((c) => c.name.toLowerCase().includes(q)) : companies;
    }, [companies, search]);

    const {sorted, sortKey, sortDir, toggle} = useTableSort(
        filtered,
        {company: (c) => c.name},
        {key: 'company', dir: 'asc'},
    );

    // Name is mandatory — Add is enabled only when it's filled; dirty (warn before
    // leaving) once it has content.
    const isValid = name.trim() !== '';
    const isDirty = isValid;

    useEffect(() => {
        setDirty(isDirty);
    }, [isDirty, setDirty]);
    // Clear the guard if we unmount (e.g. after confirming "switch anyway").
    useEffect(() => () => setDirty(false), [setDirty]);

    async function refresh() {
        try {
            setCompanies(await ListCompanies());
            setError('');
        } catch (e: any) {
            setError(String(e));
        }
    }

    useEffect(() => {
        refresh();
    }, []);

    async function add() {
        if (!isValid) return;
        try {
            await AddCompany(name.trim());
            setName('');
            await refresh();
        } catch (e: any) {
            setError(String(e));
        }
    }

    async function remove() {
        if (!deleting) return;
        try {
            await DeleteCompany(deleting.id);
            setDeleting(null);
            await refresh();
        } catch (e: any) {
            // Keep the dialog open isn't useful here; surface the reason on the page.
            setDeleting(null);
            setError(String(e));
        }
    }

    return (
        <div className="space-y-4">
            <Card>
                <CardContent>
                    <form
                        className="flex flex-wrap items-end gap-3"
                        onSubmit={(e) => {
                            e.preventDefault();
                            add();
                        }}
                    >
                        <div className="grid flex-1 gap-2 min-w-48">
                            <Label htmlFor="name" className="sr-only">Company name</Label>
                            <Input
                                id="name"
                                placeholder="e.g. Acme Supplies"
                                autoComplete="off"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
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
                {companies.length > 0 && (
                    <CardHeader className="flex items-center justify-between gap-4">
                        <div className="relative w-64">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/>
                            <Input
                                className="pl-8"
                                placeholder="Search company…"
                                autoComplete="off"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <span className="text-sm text-muted-foreground">
                            {sorted.length} {sorted.length === 1 ? 'company' : 'companies'}
                        </span>
                    </CardHeader>
                )}
                <CardContent className="p-0">
                    {companies.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                            <Building2 className="size-8 opacity-40"/>
                            <p className="text-sm">No companies yet. Add one above to get started.</p>
                        </div>
                    ) : sorted.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                            <Search className="size-8 opacity-40"/>
                            <p className="text-sm">No companies match "{search}".</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <SortableHeader label="Company" sortKey="company" activeKey={sortKey} dir={sortDir} onSort={toggle} className="pl-4"/>
                                    <TableHead className="w-24 pr-4 text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sorted.map((c) => (
                                    <TableRow key={c.id}>
                                        <TableCell className="pl-4 font-medium">{c.name}</TableCell>
                                        <TableCell className="pr-4 text-right">
                                            <div className="flex justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="size-8"
                                                    aria-label={`Edit ${c.name}`}
                                                    onClick={() => setEditing(c)}
                                                >
                                                    <Pencil className="size-4"/>
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="size-8 text-destructive hover:text-destructive"
                                                    aria-label={`Delete ${c.name}`}
                                                    onClick={() => setDeleting(c)}
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

            <EditCompanyDialog
                open={editing !== null}
                onOpenChange={(o) => !o && setEditing(null)}
                company={editing}
                onUpdated={() => {
                    setEditing(null);
                    refresh();
                }}
            />

            <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this company?</AlertDialogTitle>
                        <AlertDialogDescription>
                            <span className="font-medium text-foreground">{deleting?.name}</span> will be
                            permanently deleted. This is blocked if any items or bills still use it.
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
