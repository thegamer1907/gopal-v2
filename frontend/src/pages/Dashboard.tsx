import {useEffect, useMemo, useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {ListSalesOrders} from '../../wailsjs/go/main/App';
import {db} from '../../wailsjs/go/models';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {displayDate} from '@/lib/date';
import {lapsedCustomers} from '@/lib/lapsedCustomers';
import {fmt} from '@/lib/purchaseBill';
import {customerShareLabel} from '@/lib/salesOrder';

// Landing page: a greeting plus the "customers who haven't ordered lately" card — each
// customer's most recent order, oldest first, top 10; a row opens that order's detail.
// More dashboard content (KPIs etc.) is still to be defined. See docs/UI.md.
export function Dashboard() {
    const navigate = useNavigate();
    const [orders, setOrders] = useState<db.SalesOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        ListSalesOrders()
            .then(setOrders)
            .catch((e) => setError(String(e)))
            .finally(() => setLoading(false));
    }, []);

    const lapsed = useMemo(() => lapsedCustomers(orders, new Date(), 10), [orders]);

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
                        <p className="text-sm text-muted-foreground">No orders yet.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Last order</TableHead>
                                    <TableHead className="text-right">Days ago</TableHead>
                                    <TableHead className="text-right">Order value</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {lapsed.map((c) => (
                                    <TableRow
                                        key={c.customerId}
                                        // Whole row clickable like View/Edit Orders; the name is also a real <Link> so it stays keyboard-focusable. (No ::after-stretched link: WebKit, i.e. the desktop webview, doesn't treat <tr> as a positioning container, so every row's overlay covered the whole table.)
                                        onClick={(e) => {
                                            if (!(e.target as HTMLElement).closest('a')) navigate(`/orders/${c.orderId}`);
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
