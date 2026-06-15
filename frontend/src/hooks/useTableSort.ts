import {useMemo, useState} from 'react';

// Lightweight, reusable client-side table sorting. Each sortable column supplies an
// accessor returning a comparable (string | number | Date); clicking the active
// column flips direction. Used by the list tables (Items, Companies, View/Edit Bills)
// so sorting behaves consistently without a table library. See docs/UI.md.
export type SortDir = 'asc' | 'desc';
export type SortValue = string | number | Date;
export type Accessors<T> = Record<string, (row: T) => SortValue>;

export interface SortState {
    key: string;
    dir: SortDir;
}

function compare(a: SortValue, b: SortValue): number {
    if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), undefined, {numeric: true, sensitivity: 'base'});
}

export function useTableSort<T>(rows: T[], accessors: Accessors<T>, initial: SortState) {
    const [sort, setSort] = useState<SortState>(initial);

    const sorted = useMemo(() => {
        const accessor = accessors[sort.key];
        if (!accessor) return rows;
        const factor = sort.dir === 'asc' ? 1 : -1;
        // Copy before sorting so we never mutate the caller's array.
        return [...rows].sort((a, b) => factor * compare(accessor(a), accessor(b)));
    }, [rows, accessors, sort]);

    // Toggle: clicking the active column flips direction; a new column starts ascending.
    function toggle(key: string) {
        setSort((cur) => (cur.key === key ? {key, dir: cur.dir === 'asc' ? 'desc' : 'asc'} : {key, dir: 'asc'}));
    }

    return {sorted, sortKey: sort.key, sortDir: sort.dir, toggle};
}
