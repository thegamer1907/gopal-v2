import {ChevronDown, ChevronsUpDown, ChevronUp} from 'lucide-react';
import {cn} from '@/lib/utils';
import {TableHead} from '@/components/ui/table';
import type {SortDir} from '@/hooks/useTableSort';

// A clickable column header that drives `useTableSort`. Shows a neutral chevron until
// its column is the active sort, then an up/down arrow for the direction. Renders a
// shadcn <TableHead> so it drops straight into a <TableRow>. See docs/UI.md.
interface Props {
    label: string;
    sortKey: string;
    activeKey: string;
    dir: SortDir;
    onSort: (key: string) => void;
    align?: 'left' | 'right';
    className?: string;
}

export function SortableHeader({label, sortKey, activeKey, dir, onSort, align = 'left', className}: Props) {
    const active = activeKey === sortKey;
    const Icon = active ? (dir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
    return (
        <TableHead className={cn(align === 'right' && 'text-right', className)}>
            <button
                type="button"
                onClick={() => onSort(sortKey)}
                className={cn(
                    'inline-flex items-center gap-1 font-medium hover:text-foreground/80',
                    align === 'right' && 'flex-row-reverse',
                    active ? 'text-foreground' : 'text-muted-foreground',
                )}
            >
                {label}
                <Icon className={cn('size-3.5', !active && 'opacity-50')}/>
            </button>
        </TableHead>
    );
}
