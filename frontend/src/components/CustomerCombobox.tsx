import {useEffect, useRef, useState} from 'react';
import {Plus} from 'lucide-react';
import {db} from '../../wailsjs/go/models';
import {Input} from '@/components/ui/input';

// Customer picker for the Add Order header. Filters the in-memory customer cache by
// name, nickname, or city as the user types; if nothing matches it offers "add as new
// customer". Mirrors CompanyCombobox, but the composite label helps tell customers apart
// (several may share a name). Sits in a normal form (not a horizontally-scrolling table)
// so a simple absolute dropdown suffices — no portal needed.
interface Props {
    customers: db.Customer[];
    value: db.Customer | null;
    onSelect: (customer: db.Customer) => void;
    // When omitted, the "add … as new customer" option isn't offered (pick-only).
    onAddNew?: (query: string) => void;
    id?: string;
}

// "Name (Nickname)" — nickname parenthetical omitted when blank.
function nameLabel(c: db.Customer): string {
    return c.nickName ? `${c.name} (${c.nickName})` : c.name;
}

// Full composite label used to seed/sync the input text: "Name (Nickname) · City".
function label(c: db.Customer): string {
    return c.city ? `${nameLabel(c)} · ${c.city}` : nameLabel(c);
}

export function CustomerCombobox({customers, value, onSelect, onAddNew, id}: Props) {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const blurTimer = useRef<number | undefined>(undefined);

    // Reflect an externally-set value (e.g. picked from the new-customer dialog, or
    // cleared on form reset).
    useEffect(() => {
        setQuery(value ? label(value) : '');
    }, [value]);

    const q = query.trim().toLowerCase();
    const filtered = (q
        ? customers.filter(
              (c) =>
                  c.name.toLowerCase().includes(q) ||
                  c.nickName.toLowerCase().includes(q) ||
                  c.city.toLowerCase().includes(q),
          )
        : customers
    ).slice(0, 8);
    const exact = customers.some((c) => label(c).toLowerCase() === q);

    function select(customer: db.Customer) {
        onSelect(customer);
        setQuery(label(customer));
        setOpen(false);
    }

    return (
        <div className="relative">
            <Input
                id={id}
                placeholder="Search customer by name, nickname, or city…"
                autoComplete="off"
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value);
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
                    {filtered.map((c) => (
                        <button
                            type="button"
                            key={c.id}
                            onClick={() => select(c)}
                            className="flex w-full items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                        >
                            <span className="font-medium">{nameLabel(c)}</span>
                            {c.city && <span className="shrink-0 text-muted-foreground">{c.city}</span>}
                        </button>
                    ))}
                    {filtered.length === 0 && (
                        <p className="px-2 py-1.5 text-sm text-muted-foreground">No matches</p>
                    )}
                    {q && !exact && onAddNew && (
                        <button
                            type="button"
                            onClick={() => {
                                setOpen(false);
                                onAddNew(query.trim());
                            }}
                            className="mt-1 flex w-full items-center gap-2 rounded-sm border-t px-2 py-2 text-left text-sm font-medium text-primary hover:bg-accent"
                        >
                            <Plus className="size-3.5"/>
                            Add “{query.trim()}” as new customer
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
