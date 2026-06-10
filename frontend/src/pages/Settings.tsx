import {useEffect, useState} from 'react';
import {Database, FolderOpen, FilePlus2, Trash2, AlertTriangle} from 'lucide-react';
import {
    GetDatabasePath,
    OpenExistingDatabase,
    CreateNewDatabase,
    WipeDatabase,
} from '../../wailsjs/go/main/App';
import {Button} from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Settings — currently a single Database section: shows where the DB is loaded
// from and lets the user switch files or wipe it. Switching/wiping reloads the
// app so every page re-fetches against the new database. See docs/UI.md.

// Split a path into directory + filename for a clearer display.
function splitPath(path: string): {dir: string; file: string} {
    const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    if (i < 0) return {dir: '', file: path};
    return {dir: path.slice(0, i + 1), file: path.slice(i + 1)};
}

export function Settings() {
    const [path, setPath] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [confirmWipe, setConfirmWipe] = useState(false);

    useEffect(() => {
        GetDatabasePath().then(setPath).catch((e) => setError(String(e)));
    }, []);

    // Run a DB action; on a non-empty/successful result, reload so all pages
    // re-read from the new database. `expectsPath` ops return '' when cancelled.
    async function run(fn: () => Promise<string | void>, expectsPath: boolean) {
        setError('');
        setBusy(true);
        try {
            const result = await fn();
            if (expectsPath && !result) return; // user cancelled the file dialog
            window.location.reload();
        } catch (e: any) {
            setError(String(e));
        } finally {
            setBusy(false);
        }
    }

    const {dir, file} = splitPath(path);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
                <p className="text-sm text-muted-foreground">Manage how the app stores its data.</p>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Database className="size-5 text-muted-foreground"/>
                        <CardTitle>Database</CardTitle>
                    </div>
                    <CardDescription>
                        All app data lives in a single SQLite file. You can switch which file is used or
                        start fresh.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-1.5">
                        <p className="text-sm font-medium">Current location</p>
                        <div className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm break-all">
                            <span className="text-muted-foreground">{dir}</span>
                            <span className="font-medium text-foreground">{file || '—'}</span>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => run(OpenExistingDatabase, true)}
                        >
                            <FolderOpen className="size-4"/>
                            Open existing database…
                        </Button>
                        <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => run(CreateNewDatabase, true)}
                        >
                            <FilePlus2 className="size-4"/>
                            Create new database…
                        </Button>
                    </div>

                    {error && <p className="text-sm text-destructive">{error}</p>}

                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive"/>
                            <div className="space-y-3">
                                <div>
                                    <p className="text-sm font-medium">Wipe database</p>
                                    <p className="text-sm text-muted-foreground">
                                        Permanently delete all data in the current database and recreate an
                                        empty one. This cannot be undone.
                                    </p>
                                </div>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    disabled={busy}
                                    onClick={() => setConfirmWipe(true)}
                                >
                                    <Trash2 className="size-4"/>
                                    Wipe database
                                </Button>
                                <AlertDialog open={confirmWipe} onOpenChange={setConfirmWipe}>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Wipe this database?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This permanently deletes all data in
                                                <span className="font-medium text-foreground"> {file} </span>
                                                and recreates an empty database. This cannot be undone.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction
                                                onClick={() => run(WipeDatabase, false)}
                                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                            >
                                                Wipe database
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
