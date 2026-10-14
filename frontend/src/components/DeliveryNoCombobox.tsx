import {useRef, useState} from 'react';
import {Input} from '@/components/ui/input';
import {cn} from '@/lib/utils';

// Type-or-pick delivery number. The dropdown lists every delivery number (scrollable)
// and narrows as the user types; the parent owns the raw text so it can validate it
// (blank is valid = open-ended; anything else must be an existing number). `error` shows
// the field red with a message beneath. Plain absolute dropdown — no portal needed, same
// as CustomerCombobox.
interface Props {
    options: number[];
    value: string;
    onChange: (text: string) => void;
    placeholder: string;
    error?: string;
    id?: string;
}

export function DeliveryNoCombobox({options, value, onChange, placeholder, error, id}: Props) {
    const [open, setOpen] = useState(false);
    const blurTimer = useRef<number | undefined>(undefined);

    const q = value.trim();
    const filtered = q ? options.filter((n) => String(n).includes(q)) : options;

    return (
        <div className="relative">
            <Input
                id={id}
                inputMode="numeric"
                placeholder={placeholder}
                autoComplete="off"
                aria-invalid={error ? true : undefined}
                className={cn('w-32', error && 'border-destructive')}
                value={value}
                onChange={(e) => {
                    onChange(e.target.value);
                    setOpen(true);
                }}
                onFocus={() => {
                    window.clearTimeout(blurTimer.current);
                    setOpen(true);
                }}
                onBlur={() => {
                    blurTimer.current = window.setTimeout(() => setOpen(false), 150);
                }}
            />
            {open && (
                <div
                    className="absolute left-0 z-50 mt-1 max-h-56 min-w-full overflow-auto rounded-md border bg-background p-1 shadow-md"
                    // Keep the input focused (so onBlur doesn't fire) when clicking inside.
                    onMouseDown={(e) => e.preventDefault()}
                >
                    {filtered.map((n) => (
                        <button
                            type="button"
                            key={n}
                            onClick={() => {
                                onChange(String(n));
                                setOpen(false);
                            }}
                            className="flex w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                        >
                            {n}
                        </button>
                    ))}
                    {filtered.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">No matches</p>}
                </div>
            )}
            {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
    );
}
