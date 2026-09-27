import {useMemo} from 'react';
import {History} from 'lucide-react';
import {db} from '../../wailsjs/go/models';
import {parseDate} from '@/lib/date';
import {fmt} from '@/lib/purchaseBill';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';

// Read-only popup listing every past rate a customer has been charged for an item,
// newest first — the same history an order line's Rate field prefills from (see
// AddOrder.tsx). Sorts by parsed date since the stored date is free text, not a
// SQL-sortable value (same reason nothing else in this app sorts dates in SQL).
interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    itemName: string;
    customerName: string;
    history: db.RateHistoryEntry[];
}

export function RateHistoryDialog({open, onOpenChange, itemName, customerName, history}: Props) {
    const sorted = useMemo(
        () =>
            [...history].sort(
                (a, b) => (parseDate(b.date)?.getTime() ?? 0) - (parseDate(a.date)?.getTime() ?? 0),
            ),
        [history],
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        Rate history — {itemName} for {customerName}
                    </DialogTitle>
                    <DialogDescription>Every past order rate for this item and customer, newest first.</DialogDescription>
                </DialogHeader>

                {sorted.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
                        <History className="size-8 opacity-40"/>
                        <p className="text-sm">No previous orders for this item and customer yet.</p>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead className="text-right">Rate</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sorted.map((h, i) => (
                                <TableRow key={i}>
                                    <TableCell>{h.date}</TableCell>
                                    <TableCell className="text-right tabular-nums">{fmt(h.rate)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </DialogContent>
        </Dialog>
    );
}
