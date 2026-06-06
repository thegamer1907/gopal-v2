import {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Plus} from 'lucide-react';
import {db} from '../../wailsjs/go/models';
import {Input} from '@/components/ui/input';

// Lightweight item search. Filters the in-memory item cache as the user types and
// shows suggestions ("name · pack size"). The suggestion list is rendered in a portal
// (fixed-positioned under the input) so it isn't clipped by — and doesn't add a vertical
// scrollbar to — the horizontally-scrolling line-items table. If nothing matches it
// offers "add as new item".
interface Props {
    items: db.Item[];
    value: db.Item | null;
    onSelect: (item: db.Item) => void;
    onAddNew: (query: string) => void;
}

function label(it: db.Item): string {
    return `${it.name} · ${it.packSize}`;
}

export function ItemCombobox({items, value, onSelect, onAddNew}: Props) {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [rect, setRect] = useState<{left: number; top: number; width: number} | null>(null);
    const anchorRef = useRef<HTMLDivElement>(null);
    const blurTimer = useRef<number | undefined>(undefined);

    // Reflect an externally-set value (e.g. picked from the new-item dialog).
    useEffect(() => {
        if (value) setQuery(label(value));
    }, [value]);

    // Keep the portal anchored under the input while open (track scroll/resize, incl.
    // the inner horizontal scroll of the table — hence the capture-phase scroll listener).
    useEffect(() => {
        if (!open) return;
        function place() {
            const el = anchorRef.current;
            if (!el) return;
            const r = el.getBoundingClientRect();
            setRect({left: r.left, top: r.bottom, width: r.width});
        }
        place();
        window.addEventListener('scroll', place, true);
        window.addEventListener('resize', place);
        return () => {
            window.removeEventListener('scroll', place, true);
            window.removeEventListener('resize', place);
        };
    }, [open]);

    const q = query.trim().toLowerCase();
    const filtered = (q
        ? items.filter((it) => `${it.name} ${it.packSize}`.toLowerCase().includes(q))
        : items
    ).slice(0, 8);
    const exact = items.some((it) => label(it).toLowerCase() === q);

    function select(it: db.Item) {
        onSelect(it);
        setQuery(label(it));
        setOpen(false);
    }

    return (
        <div ref={anchorRef} className="relative w-56">
            <Input
                className="w-56"
                placeholder="Search item…"
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
            {open && rect &&
                createPortal(
                    <div
                        className="fixed z-50 max-h-64 overflow-auto rounded-md border bg-background p-1 shadow-md"
                        style={{
                            left: rect.left,
                            top: rect.top + 4,
                            width: Math.max(rect.width, 256),
                        }}
                        // Keep the input focused (so onBlur doesn't fire) when clicking inside.
                        onMouseDown={(e) => e.preventDefault()}
                    >
                        {filtered.map((it) => (
                            <button
                                type="button"
                                key={label(it)}
                                onClick={() => select(it)}
                                className="flex w-full items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                            >
                                <span className="font-medium">{it.name}</span>
                                <span className="shrink-0 text-muted-foreground tabular-nums">{it.packSize}</span>
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
                                Add “{query.trim()}” as new item
                            </button>
                        )}
                    </div>,
                    document.body,
                )}
        </div>
    );
}
