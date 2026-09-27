import {useEffect, useRef, useState} from 'react';
import {Input} from '@/components/ui/input';
import {INDIAN_STATES} from '@/lib/indianStates';

// State picker for the Customer master — type to filter the fixed Indian states/UTs
// list, same interaction as CompanyCombobox/ItemCombobox. No "add new" option since the
// list is closed, but unlike those comboboxes State isn't FK'd to anything — it's just a
// plain string column — so free text the user types without picking a suggestion is still
// accepted as-is (propagated on every keystroke, not only on select).
interface Props {
    value: string;
    onSelect: (state: string) => void;
    id?: string;
}

export function StateCombobox({value, onSelect, id}: Props) {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const blurTimer = useRef<number | undefined>(undefined);

    // Reflect an externally-set value (e.g. seeded when an edit dialog opens).
    useEffect(() => {
        setQuery(value);
    }, [value]);

    const q = query.trim().toLowerCase();
    const filtered = q ? INDIAN_STATES.filter((s) => s.toLowerCase().includes(q)) : INDIAN_STATES;

    function select(state: string) {
        onSelect(state);
        setQuery(state);
        setOpen(false);
    }

    return (
        <div className="relative">
            <Input
                id={id}
                placeholder="Search state…"
                autoComplete="off"
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value);
                    onSelect(e.target.value);
                    setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => {
                    blurTimer.current = window.setTimeout(() => setOpen(false), 150);
                }}
            />
            {open && (
                <div
                    className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-auto rounded-md border bg-background p-1 shadow-md"
                    // Keep the input focused (so onBlur doesn't fire) when clicking inside.
                    onMouseDown={(e) => e.preventDefault()}
                >
                    {filtered.map((s) => (
                        <button
                            type="button"
                            key={s}
                            onClick={() => select(s)}
                            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                        >
                            {s}
                        </button>
                    ))}
                    {filtered.length === 0 && (
                        <p className="px-2 py-1.5 text-sm text-muted-foreground">No matches</p>
                    )}
                </div>
            )}
        </div>
    );
}
