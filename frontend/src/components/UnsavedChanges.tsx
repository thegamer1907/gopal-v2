import {createContext, useCallback, useContext, useRef, useState} from 'react';

// Tracks whether the current page has unsaved edits, so navigation can warn the
// user before discarding them. A page calls `setDirty(true)` while it holds
// unsaved data and `setDirty(false)` once saved or reset. Nav reads `dirty` to
// decide whether to prompt before switching pages.
interface UnsavedChangesValue {
    dirty: boolean;
    setDirty: (dirty: boolean) => void;
}

const Ctx = createContext<UnsavedChangesValue | null>(null);

export function UnsavedChangesProvider({children}: {children: React.ReactNode}) {
    const [dirty, setDirtyState] = useState(false);
    // Stable setter so pages can call it from effects without re-subscribing.
    const dirtyRef = useRef(false);
    const setDirty = useCallback((next: boolean) => {
        if (dirtyRef.current !== next) {
            dirtyRef.current = next;
            setDirtyState(next);
        }
    }, []);

    return <Ctx.Provider value={{dirty, setDirty}}>{children}</Ctx.Provider>;
}

export function useUnsavedChanges(): UnsavedChangesValue {
    const ctx = useContext(Ctx);
    if (!ctx) throw new Error('useUnsavedChanges must be used within UnsavedChangesProvider');
    return ctx;
}
