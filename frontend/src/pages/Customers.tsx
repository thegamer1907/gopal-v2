import {useEffect, useMemo, useState} from 'react';
import {Users, Pencil, Plus, Search, Trash2} from 'lucide-react';
import {AddCustomer, DeleteCustomer, ListCustomers} from '../../wailsjs/go/main/App';
import {db} from '../../wailsjs/go/models';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {StateCombobox} from '@/components/StateCombobox';
import {MobileInput} from '@/components/MobileInput';
import {EditCustomerDialog} from '@/components/EditCustomerDialog';
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

// Customer master — first piece of the Sales feature. Only Name and City are required;
// every other field can be filled in later via Edit. See docs/DATA_MODEL.md (customers).

// address1 + address2 render as one merged column in the list (see docs/UI.md).
function addressOf(c: db.Customer): string {
    return [c.address1, c.address2].filter((s) => s.trim() !== '').join(', ');
}

export function Customers() {
    const [customers, setCustomers] = useState<db.Customer[]>([]);
    const [name, setName] = useState('');
    const [nickName, setNickName] = useState('');
    const [mobile, setMobile] = useState('');
    const [address1, setAddress1] = useState('');
    const [address2, setAddress2] = useState('');
    const [city, setCity] = useState('');
    const [state, setState] = useState('');
    const [pincode, setPincode] = useState('');
    const [gstin, setGstin] = useState('');
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [editing, setEditing] = useState<db.Customer | null>(null);
    const [deleting, setDeleting] = useState<db.Customer | null>(null);
    const {setDirty} = useUnsavedChanges();

    // Mobile is optional, but if any digits are entered they must form a full 10-digit
    // number (MobileInput already blocks non-digit characters and anything past 10).
    const mobileValid = mobile === '' || mobile.length === 10;

    // Only Name and City are required; the rest may be filled in later via Edit.
    const isValid = name.trim() !== '' && city.trim() !== '' && mobileValid;
    // Dirty (warn before leaving) once any field has content.
    const fields = [name, nickName, mobile, address1, address2, city, state, pincode, gstin];
    const isDirty = fields.some((v) => v.trim() !== '');

    useEffect(() => {
        setDirty(isDirty);
    }, [isDirty, setDirty]);
    // Clear the guard if we unmount (e.g. after confirming "switch anyway").
    useEffect(() => () => setDirty(false), [setDirty]);

    async function refresh() {
        try {
            setCustomers(await ListCustomers());
            setError('');
        } catch (e: any) {
            setError(String(e));
        }
    }

    useEffect(() => {
        refresh();
    }, []);

    // Search across every identifying field, not just name.
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return customers;
        return customers.filter(
            (c) =>
                c.name.toLowerCase().includes(q) ||
                c.nickName.toLowerCase().includes(q) ||
                c.city.toLowerCase().includes(q) ||
                c.mobile.toLowerCase().includes(q) ||
                c.gstin.toLowerCase().includes(q),
        );
    }, [customers, search]);

    const {sorted, sortKey, sortDir, toggle} = useTableSort(
        filtered,
        {
            name: (c) => c.name,
            nickName: (c) => c.nickName,
            city: (c) => c.city,
            state: (c) => c.state,
            pincode: (c) => c.pincode,
            gstin: (c) => c.gstin,
            mobile: (c) => c.mobile,
        },
        {key: 'name', dir: 'asc'},
    );

    async function add() {
        if (!isValid) return;
        try {
            const customer = {
                id: 0,
                name: name.trim(),
                nickName: nickName.trim(),
                address1: address1.trim(),
                address2: address2.trim(),
                city: city.trim(),
                state,
                pincode: pincode.trim(),
                gstin: gstin.trim(),
                mobile: mobile.trim(),
            };
            await AddCustomer(customer as db.Customer);
            setName('');
            setNickName('');
            setMobile('');
            setAddress1('');
            setAddress2('');
            setCity('');
            setState('');
            setPincode('');
            setGstin('');
            await refresh();
        } catch (e: any) {
            setError(String(e));
        }
    }

    async function remove() {
        if (!deleting) return;
        try {
            await DeleteCustomer(deleting.id);
            setDeleting(null);
            await refresh();
        } catch (e: any) {
            setDeleting(null);
            setError(String(e));
        }
    }

    return (
        <div className="space-y-4">
            <Card>
                <CardContent>
                    <form
                        className="space-y-4"
                        onSubmit={(e) => {
                            e.preventDefault();
                            add();
                        }}
                    >
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <div className="grid gap-2">
                                <Label htmlFor="name">Name</Label>
                                <Input
                                    id="name"
                                    placeholder="e.g. Sharma Traders"
                                    autoComplete="off"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="nickName">Nick Name</Label>
                                <Input
                                    id="nickName"
                                    autoComplete="off"
                                    value={nickName}
                                    onChange={(e) => setNickName(e.target.value)}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="mobile">Mobile</Label>
                                <MobileInput id="mobile" value={mobile} onChange={setMobile}/>
                                {!mobileValid && (
                                    <p className="text-xs text-destructive">Mobile number must be 10 digits.</p>
                                )}
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="address1">Address 1</Label>
                                <Input
                                    id="address1"
                                    autoComplete="off"
                                    value={address1}
                                    onChange={(e) => setAddress1(e.target.value)}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="address2">Address 2</Label>
                                <Input
                                    id="address2"
                                    autoComplete="off"
                                    value={address2}
                                    onChange={(e) => setAddress2(e.target.value)}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="city">City</Label>
                                <Input
                                    id="city"
                                    autoComplete="off"
                                    value={city}
                                    onChange={(e) => setCity(e.target.value)}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="state">State</Label>
                                <StateCombobox id="state" value={state} onSelect={setState}/>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="pincode">Pincode</Label>
                                <Input
                                    id="pincode"
                                    autoComplete="off"
                                    value={pincode}
                                    onChange={(e) => setPincode(e.target.value)}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="gstin">GSTIN</Label>
                                <Input
                                    id="gstin"
                                    autoComplete="off"
                                    value={gstin}
                                    onChange={(e) => setGstin(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Button type="submit" disabled={!isValid}>
                                <Plus className="size-4"/>
                                Add
                            </Button>
                            <p className="text-xs text-muted-foreground">
                                Only Name and City are required.
                            </p>
                        </div>
                    </form>
                    {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
                </CardContent>
            </Card>

            <Card>
                {customers.length > 0 && (
                    <CardHeader className="flex items-center justify-between gap-4">
                        <div className="relative w-64">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/>
                            <Input
                                className="pl-8"
                                placeholder="Search customers…"
                                autoComplete="off"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <span className="text-sm text-muted-foreground">
                            {sorted.length} {sorted.length === 1 ? 'customer' : 'customers'}
                        </span>
                    </CardHeader>
                )}
                <CardContent className="p-0">
                    {customers.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                            <Users className="size-8 opacity-40"/>
                            <p className="text-sm">No customers yet. Add one above to get started.</p>
                        </div>
                    ) : sorted.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                            <Search className="size-8 opacity-40"/>
                            <p className="text-sm">No customers match "{search}".</p>
                        </div>
                    ) : (
                        <Table>
                                <TableHeader>
                                    <TableRow>
                                        <SortableHeader label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={toggle} className="pl-4"/>
                                        <SortableHeader label="Nick Name" sortKey="nickName" activeKey={sortKey} dir={sortDir} onSort={toggle}/>
                                        <TableHead>Address</TableHead>
                                        <SortableHeader label="City" sortKey="city" activeKey={sortKey} dir={sortDir} onSort={toggle}/>
                                        <SortableHeader label="State" sortKey="state" activeKey={sortKey} dir={sortDir} onSort={toggle}/>
                                        <SortableHeader label="Pincode" sortKey="pincode" activeKey={sortKey} dir={sortDir} onSort={toggle}/>
                                        <SortableHeader label="GSTIN" sortKey="gstin" activeKey={sortKey} dir={sortDir} onSort={toggle}/>
                                        <SortableHeader label="Mobile" sortKey="mobile" activeKey={sortKey} dir={sortDir} onSort={toggle}/>
                                        <TableHead className="w-24 pr-4 text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sorted.map((c) => (
                                        <TableRow key={c.id}>
                                            <TableCell className="pl-4 font-medium">{c.name}</TableCell>
                                            <TableCell className="text-muted-foreground">{c.nickName}</TableCell>
                                            <TableCell className="text-muted-foreground">{addressOf(c)}</TableCell>
                                            <TableCell>{c.city}</TableCell>
                                            <TableCell>{c.state}</TableCell>
                                            <TableCell>{c.pincode}</TableCell>
                                            <TableCell>{c.gstin}</TableCell>
                                            <TableCell>{c.mobile}</TableCell>
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

            <EditCustomerDialog
                open={editing !== null}
                onOpenChange={(o) => !o && setEditing(null)}
                customer={editing}
                onSaved={() => {
                    setEditing(null);
                    refresh();
                }}
            />

            <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this customer?</AlertDialogTitle>
                        <AlertDialogDescription>
                            <span className="font-medium text-foreground">{deleting?.name}</span> will be
                            permanently deleted. This is blocked if any orders still use it.
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
