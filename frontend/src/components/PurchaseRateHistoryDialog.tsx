import {ArrowDown, ArrowUp, History} from 'lucide-react';
import {displayDate} from '@/lib/date';
import {fmt} from '@/lib/purchaseBill';
import type {FinalRateEntry} from '@/lib/purchaseHistory';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';

// Read-only popup listing every earlier purchase of an item — Date / Bill No. / Final Rate,
// newest first — plus how each price moved against the purchase before it, so a rising or
// falling price is easy to see. Opened from the "i" button beside Last Final Rate on Add
// Purchase Bill. Controlled (open state lives in the page), like RateHistoryDialog.
interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    itemName: string;
    history: FinalRateEntry[]; // newest first
}

export function PurchaseRateHistoryDialog({open, onOpenChange, itemName, history}: Props) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[85vh] flex-col">
                <DialogHeader>
                    <DialogTitle>Final rate history — {itemName}</DialogTitle>
                    <DialogDescription>Every earlier purchase of this item, newest first.</DialogDescription>
                </DialogHeader>

                {history.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
                        <History className="size-8 opacity-40"/>
                        <p className="text-sm">This item hasn't been purchased before.</p>
                    </div>
                ) : (
                    <Table containerClassName="min-h-0 flex-1 overflow-y-auto">
                        <TableHeader className="sticky top-0 z-10 bg-background">
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Bill No.</TableHead>
                                <TableHead className="text-right">Final Rate</TableHead>
                                <TableHead className="text-right">Change</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {history.map((h, i) => {
                                const older = history[i + 1]; // the purchase just before this one
                                const diff = older ? h.finalRate - older.finalRate : null;
                                const pct = older && older.finalRate !== 0 ? (diff! / older.finalRate) * 100 : null;
                                return (
                                    <TableRow key={`${h.billId}-${i}`}>
                                        <TableCell>{displayDate(h.date)}</TableCell>
                                        <TableCell className="text-muted-foreground">{h.billNumber}</TableCell>
                                        <TableCell className="text-right tabular-nums">{fmt(h.finalRate)}</TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {diff === null || Math.abs(diff) < 0.005 ? (
                                                <span className="text-muted-foreground">{diff === null ? '—' : '0.00'}</span>
                                            ) : (
                                                <span
                                                    className={`inline-flex items-center justify-end gap-1 ${
                                                        diff > 0 ? 'text-red-600' : 'text-green-600'
                                                    }`}
                                                >
                                                    {diff > 0 ? <ArrowUp className="size-3"/> : <ArrowDown className="size-3"/>}
                                                    {fmt(Math.abs(diff))}
                                                    {pct !== null && ` (${Math.abs(pct).toFixed(1)}%)`}
                                                </span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
            </DialogContent>
        </Dialog>
    );
}
