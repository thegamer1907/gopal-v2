import {useState} from 'react';
import {Calendar as CalendarIcon, X} from 'lucide-react';
import type {DateRange} from 'react-day-picker';
import {cn} from '@/lib/utils';
import {buttonVariants} from '@/components/ui/button';
import {Button} from '@/components/ui/button';
import {Calendar} from '@/components/ui/calendar';
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover';
import {formatDate} from '@/lib/date';

// A from/to date-range filter for list tables that have a date column. Reuses the
// app's Calendar/Popover primitives in range mode. The trigger summarizes the current
// range (or "All dates"); "Clear" resets it. Controlled by the parent. See docs/UI.md.
//
// Note (React-18 asChild footgun): PopoverTrigger renders its own button styled via
// buttonVariants rather than wrapping our <Button asChild>, so the ref isn't dropped.
interface Props {
    value: DateRange | undefined;
    onChange: (range: DateRange | undefined) => void;
}

function label(range: DateRange | undefined): string {
    if (!range?.from) return 'All dates';
    if (!range.to) return `From ${formatDate(range.from)}`;
    return `${formatDate(range.from)} – ${formatDate(range.to)}`;
}

export function DateRangeFilter({value, onChange}: Props) {
    const [open, setOpen] = useState(false);
    const active = Boolean(value?.from);

    return (
        <div className="flex items-center gap-1">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger
                    type="button"
                    className={cn(
                        buttonVariants({variant: 'outline', size: 'sm'}),
                        'gap-2 font-normal',
                        active && 'border-primary/40 text-foreground',
                    )}
                >
                    <CalendarIcon className="size-4 text-muted-foreground"/>
                    {label(value)}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                        mode="range"
                        selected={value}
                        defaultMonth={value?.from}
                        onSelect={onChange}
                        numberOfMonths={2}
                    />
                </PopoverContent>
            </Popover>
            {active && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground"
                    aria-label="Clear date filter"
                    onClick={() => onChange(undefined)}
                >
                    <X className="size-4"/>
                </Button>
            )}
        </div>
    );
}
