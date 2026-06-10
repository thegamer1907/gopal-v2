import {useEffect, useRef, useState} from 'react';
import {Plus} from 'lucide-react';
import {db} from '../../wailsjs/go/models';
import {Input} from '@/components/ui/input';

// Company picker for the purchase-bill header. Filters the in-memory company cache
// as the user types and shows matching companies; if nothing matches it offers
// "add as new company". Mirrors ItemCombobox, but the field sits in a normal form
// (not a horizontally-scrolling table) so a simple absolute dropdown suffices — no
// portal needed. The selected value is the full company (id + name).
interface Props {
    companies: db.Company[];
    value: db.Company | null;
    onSelect: (company: db.Company) => void;
    onAddNew: (query: string) => void;
    id?: string;
}

export function CompanyCombobox({companies, value, onSelect, onAddNew, id}: Props) {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const blurTimer = useRef<number | undefined>(undefined);

    // Reflect an externally-set value (e.g. picked from the new-company dialog,
    // or cleared on form reset).
    useEffect(() => {
        setQuery(value ? value.name : '');
    }, [value]);

    const q = query.trim().toLowerCase();
    const filtered = (q
        ? companies.filter((c) => c.name.toLowerCase().includes(q))
        : companies
    ).slice(0, 8);
    const exact = companies.some((c) => c.name.toLowerCase() === q);

    function select(company: db.Company) {
        onSelect(company);
        setQuery(company.name);
        setOpen(false);
    }

    return (
        <div className="relative">
            <Input
                id={id}
                placeholder="Search company…"
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
                            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                        >
                            <span className="font-medium">{c.name}</span>
                        </button>
                    ))}
                    {filtered.length === 0 && (
                        <p className="px-2 py-1.5 text-sm text-muted-foreground">No matches</p>
                    )}
                    {q && !exact && (
                        <button
                            type="button"
                            onClick={() => {
                                setOpen(false);
                                onAddNew(query.trim());
                            }}
                            className="mt-1 flex w-full items-center gap-2 rounded-sm border-t px-2 py-2 text-left text-sm font-medium text-primary hover:bg-accent"
                        >
                            <Plus className="size-3.5"/>
                            Add “{query.trim()}” as new company
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
