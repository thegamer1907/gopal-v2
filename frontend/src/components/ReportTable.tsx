import {Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {cn} from '@/lib/utils';
import {totalCell, type ReportColumn} from '@/lib/reportColumns';

const alignClass = {left: 'text-left', center: 'text-center', right: 'text-right'} as const;

// Read-only table for the on-screen report views: sticky header inside a scrolling area
// (wide reports scroll sideways too) and a bold Totals row when any column defines one.
// Columns/totals come from @/lib/reportColumns, which mirror the Excel exports.
export function ReportTable<R>({columns, rows}: {columns: ReportColumn<R>[]; rows: R[]}) {
    const hasTotals = columns.some((c) => c.total !== undefined);
    return (
        <div className="rounded-lg border">
            <Table containerClassName="max-h-[calc(100vh-14rem)] overflow-auto">
                <TableHeader className="sticky top-0 z-10 bg-background shadow-[0_1px_0_var(--border)]">
                    <TableRow>
                        {columns.map((c) => (
                            <TableHead key={c.header} className={cn('whitespace-nowrap', alignClass[c.align ?? 'left'])}>
                                {c.header}
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((r, i) => (
                        <TableRow key={i}>
                            {columns.map((c) => (
                                <TableCell
                                    key={c.header}
                                    className={cn('whitespace-nowrap tabular-nums', alignClass[c.align ?? 'left'])}
                                >
                                    {c.cell(r)}
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
                {hasTotals && (
                    <TableFooter className="sticky bottom-0 z-10 bg-background font-semibold">
                        <TableRow>
                            {columns.map((c) => (
                                <TableCell
                                    key={c.header}
                                    className={cn('whitespace-nowrap tabular-nums', alignClass[c.align ?? 'left'])}
                                >
                                    {totalCell(c, rows)}
                                </TableCell>
                            ))}
                        </TableRow>
                    </TableFooter>
                )}
            </Table>
        </div>
    );
}
