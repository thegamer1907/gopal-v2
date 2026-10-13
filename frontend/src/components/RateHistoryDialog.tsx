import {useEffect, useMemo, useState} from 'react';
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
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';

const ALL = 'all';

// Read-only popup listing every past rate an item has sold for, across every customer —
// City/Customer/Date/Rate, newest first — filterable by City and Customer (each with an
// "All" option; picking a City narrows the Customer options to that city). Reused as one
// common dialog from Add/Edit Order (prefilled to the current line's customer),
// the Items master list (opens at All/All), and the order detail view (prefilled to that
// order's customer). Sorts by parsed date since the stored date is free text, not a
// SQL-sortable value (same reason nothing else in this app sorts dates in SQL).
interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    itemName: string;
    history: db.ItemRateHistoryEntry[]; // full, unfiltered, for this item
    initialCity?: string;
    initialCustomerId?: number;
}

export function RateHistoryDialog({open, onOpenChange, itemName, history, initialCity, initialCustomerId}: Props) {
    const [cityFilter, setCityFilter] = useState(ALL);
    const [customerFilter, setCustomerFilter] = useState(ALL);

    // Start from the caller's requested filters every time the dialog opens.
    useEffect(() => {
        if (!open) return;
        setCityFilter(initialCity && initialCity.trim() !== '' ? initialCity : ALL);
        setCustomerFilter(initialCustomerId != null ? String(initialCustomerId) : ALL);
    }, [open, initialCity, initialCustomerId]);

    const cities = useMemo(
        () => [...new Set(history.map((h) => h.city).filter((c) => c.trim() !== ''))].sort(),
        [history],
    );

    function customersForCity(city: string) {
        const seen = new Map<number, {id: number; name: string}>();
        for (const h of history) {
            if (city !== ALL && h.city !== city) continue;
            if (!seen.has(h.customerId)) seen.set(h.customerId, {id: h.customerId, name: h.customerName});
        }
        return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
    }

    const customersInScope = useMemo(() => customersForCity(cityFilter), [history, cityFilter]);

    // Changing City can orphan an already-selected Customer that isn't in the new city —
    // fall back to "All" rather than leaving the Select pointed at a no-longer-listed id.
    function handleCityChange(city: string) {
        setCityFilter(city);
        if (!customersForCity(city).some((c) => String(c.id) === customerFilter)) {
            setCustomerFilter(ALL);
        }
    }

    const sorted = useMemo(() => {
        const rows = history.filter(
            (h) =>
                (cityFilter === ALL || h.city === cityFilter) &&
                (customerFilter === ALL || String(h.customerId) === customerFilter),
        );
        return rows.sort((a, b) => (parseDate(b.date)?.getTime() ?? 0) - (parseDate(a.date)?.getTime() ?? 0));
    }, [history, cityFilter, customerFilter]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Rate history — {itemName}</DialogTitle>
                    <DialogDescription>Every past order for this item, filterable by city and customer.</DialogDescription>
                </DialogHeader>

                {history.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
                        <History className="size-8 opacity-40"/>
                        <p className="text-sm">No previous orders for this item yet.</p>
                    </div>
                ) : (
                    <>
                        <div className="flex flex-wrap items-center gap-2">
                            <Select value={cityFilter} onValueChange={handleCityChange}>
                                <SelectTrigger size="sm" className="w-[150px]">
                                    <SelectValue/>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL}>All cities</SelectItem>
                                    {cities.map((c) => (
                                        <SelectItem key={c} value={c}>{c}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={customerFilter} onValueChange={setCustomerFilter}>
                                <SelectTrigger size="sm" className="w-[180px]">
                                    <SelectValue/>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL}>All customers</SelectItem>
                                    {customersInScope.map((c) => (
                                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {sorted.length === 0 ? (
                            <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
                                <History className="size-8 opacity-40"/>
                                <p className="text-sm">No orders match the selected filters.</p>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>City</TableHead>
                                        <TableHead>Customer</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead className="text-right">Rate</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sorted.map((h, i) => (
                                        <TableRow key={i}>
                                            <TableCell className="text-muted-foreground">{h.city}</TableCell>
                                            <TableCell>{h.customerName}</TableCell>
                                            <TableCell>{h.date}</TableCell>
                                            <TableCell className="text-right tabular-nums">{fmt(h.rate)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
