import {useEffect, useMemo, useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {ListCustomerSnoozes, ListSalesOrders, SnoozeCustomer} from '../../wailsjs/go/main/App';
import {db} from '../../wailsjs/go/models';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {Label} from '@/components/ui/label';
import {NumberInput} from '@/components/NumberInput';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {displayDate, todayDate} from '@/lib/date';
import {lapsedCustomers, type LapsedCustomer, type SnoozeUnit} from '@/lib/lapsedCustomers';
import {fmt} from '@/lib/purchaseBill';
import {customerShareLabel} from '@/lib/salesOrder';

// Landing page: a greeting plus the "customers who haven't ordered lately" card — each
// customer's most recent order, oldest first, top 10; a row opens that order's detail.
// Each row has a "Don't remind me" button that snoozes the customer (persisted in
// customer_snoozes) for N days/weeks/months, after which they reappear on their own.
// More dashboard content (KPIs etc.) is still to be defined. See docs/UI.md.
export function Dashboard() {
    const navigate = useNavigate();
    const [orders, setOrders] = useState<db.SalesOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [snoozes, setSnoozes] = useState<db.CustomerSnooze[]>([]);
    const [error, setError] = useState('');

    // Snooze dialog: one controlled dialog for the page (kept out of the table rows so its
    // portal clicks can't bubble into a row's navigate handler).
    const [snoozeTarget, setSnoozeTarget] = useState<LapsedCustomer | null>(null);
    const [snoozeAmount, setSnoozeAmount] = useState('15');
    const [snoozeUnit, setSnoozeUnit] = useState<SnoozeUnit>('day');
    const [snoozeError, setSnoozeError] = useState('');
    const [snoozing, setSnoozing] = useState(false);

    useEffect(() => {
        Promise.all([ListSalesOrders(), ListCustomerSnoozes()])
            .then(([os, sn]) => {
                setOrders(os);
                setSnoozes(sn);
            })
            .catch((e) => setError(String(e)))
            .finally(() => setLoading(false));
    }, []);

    const lapsed = useMemo(() => lapsedCustomers(orders, new Date(), 10, snoozes), [orders, snoozes]);

    const amountNum = Number(snoozeAmount);
    const snoozeValid = Number.isInteger(amountNum) && amountNum >= 1;

    function openSnooze(c: LapsedCustomer) {
        setSnoozeTarget(c);
        setSnoozeAmount('15');
        setSnoozeUnit('day');
        setSnoozeError('');
    }

    async function saveSnooze() {
        if (!snoozeTarget || !snoozeValid) return;
        setSnoozing(true);
        try {
            const snoozedOn = todayDate();
            await SnoozeCustomer(snoozeTarget.customerId, snoozedOn, amountNum, snoozeUnit);
            const saved = db.CustomerSnooze.createFrom({
                customerId: snoozeTarget.customerId,
                snoozedOn,
                amount: amountNum,
                unit: snoozeUnit,
            });
            setSnoozes((cur) => [...cur.filter((s) => s.customerId !== saved.customerId), saved]);
            setSnoozeTarget(null);
        } catch (e: any) {
            setSnoozeError(String(e));
        } finally {
            setSnoozing(false);
        }
    }

    return (
        <div className="space-y-8">
            <p className="pt-6 text-center text-3xl font-semibold tracking-tight text-foreground">
                Hare Krishna
            </p>

            <Card>
                <CardHeader>
                    <CardTitle>Customers who haven't ordered lately</CardTitle>
                    <CardDescription>Longest since their last order first — click a row to open that order.</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <p className="text-sm text-muted-foreground">Loading…</p>
                    ) : error ? (
                        <p className="text-sm text-destructive">{error}</p>
                    ) : lapsed.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            {orders.length === 0 ? 'No orders yet.' : 'No customers to remind right now.'}
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Last order</TableHead>
                                    <TableHead className="text-right">Days ago</TableHead>
                                    <TableHead className="text-right">Order value</TableHead>
                                    <TableHead className="text-right">Reminder</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {lapsed.map((c) => (
                                    <TableRow
                                        key={c.customerId}
                                        // Whole row clickable like View/Edit Orders; the name is also a real <Link> so it stays keyboard-focusable. (No ::after-stretched link: WebKit, i.e. the desktop webview, doesn't treat <tr> as a positioning container, so every row's overlay covered the whole table.)
                                        onClick={(e) => {
                                            if (!(e.target as HTMLElement).closest('a, button')) navigate(`/orders/${c.orderId}`);
                                        }}
                                        className="cursor-pointer hover:bg-muted/50 focus-within:bg-muted/50"
                                    >
                                        <TableCell className="font-medium">
                                            <Link to={`/orders/${c.orderId}`} className="focus-visible:outline-none">
                                                {customerShareLabel(c)}
                                            </Link>
                                        </TableCell>
                                        <TableCell>{displayDate(c.date)}</TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {c.daysAgo} {c.daysAgo === 1 ? 'day' : 'days'}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">{fmt(c.value)}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="outline" size="sm" onClick={() => openSnooze(c)}>
                                                Don't remind me
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Dialog open={snoozeTarget !== null} onOpenChange={(o) => !o && setSnoozeTarget(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Don't remind me</DialogTitle>
                        <DialogDescription>
                            {snoozeTarget ? customerShareLabel(snoozeTarget) : ''} won't show here until this time is up.
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        className="grid gap-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            saveSnooze();
                        }}
                    >
                        <Label htmlFor="snooze-amount">Don't remind me for</Label>
                        <div className="flex items-center gap-2">
                            <NumberInput
                                id="snooze-amount"
                                className="w-24"
                                value={snoozeAmount}
                                onChange={(v) => setSnoozeAmount(v.replace('.', ''))}
                            />
                            <Select value={snoozeUnit} onValueChange={(v) => setSnoozeUnit(v as SnoozeUnit)}>
                                <SelectTrigger className="w-[130px]">
                                    <SelectValue/>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="day">days</SelectItem>
                                    <SelectItem value="week">weeks</SelectItem>
                                    <SelectItem value="month">months</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {snoozeError && <p className="text-sm text-destructive">{snoozeError}</p>}
                    </form>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setSnoozeTarget(null)}>
                            Cancel
                        </Button>
                        <Button type="button" onClick={saveSnooze} disabled={!snoozeValid || snoozing}>
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
