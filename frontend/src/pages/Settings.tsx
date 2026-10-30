import {useEffect, useState} from 'react';
import {Database, FolderOpen, FilePlus2, Trash2, AlertTriangle, Download, RefreshCw, ArchiveRestore} from 'lucide-react';
import {
    GetDatabasePath,
    GetBackupStatus,
    ChooseBackupFolder,
    ResetBackupFolder,
    OpenExistingDatabase,
    CreateNewDatabase,
    WipeDatabase,
    GetAppVersion,
    CheckForUpdate,
    DownloadAndInstallUpdate,
} from '../../wailsjs/go/main/App';
import {main, updater} from '../../wailsjs/go/models';
import {parseIsoDate} from '@/lib/backupStatus';
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

// Settings — Database (where the DB is loaded from; switch files or wipe it), Backups
// (daily automatic copies and their folder) and Updates. Switching/wiping reloads the
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

    const [backup, setBackup] = useState<main.BackupStatus | null>(null);
    const [backupBusy, setBackupBusy] = useState(false);
    const [backupError, setBackupError] = useState('');

    const [version, setVersion] = useState('');
    const [checking, setChecking] = useState(false);
    const [installing, setInstalling] = useState(false);
    const [updateInfo, setUpdateInfo] = useState<updater.Info | null>(null);
    const [updateError, setUpdateError] = useState('');
    const [installStatus, setInstallStatus] = useState('');

    useEffect(() => {
        GetDatabasePath().then(setPath).catch((e) => setError(String(e)));
        GetBackupStatus().then(setBackup).catch((e) => setBackupError(String(e)));
        GetAppVersion().then(setVersion);
    }, []);

    async function checkForUpdate() {
        setUpdateError('');
        setInstallStatus('');
        setChecking(true);
        try {
            setUpdateInfo(await CheckForUpdate());
        } catch (e: any) {
            setUpdateError(String(e));
        } finally {
            setChecking(false);
        }
    }

    async function installUpdate() {
        if (!updateInfo) return;
        setUpdateError('');
        setInstallStatus('Downloading and installing the update — the app will restart automatically…');
        setInstalling(true);
        try {
            await DownloadAndInstallUpdate(updateInfo.downloadUrl, updateInfo.checksumHex);
        } catch (e: any) {
            setInstallStatus('');
            setUpdateError(String(e));
        } finally {
            setInstalling(false);
        }
    }

    // Change/reset the backup folder (each also runs a backup check against the new folder),
    // then re-read the status. No page reload needed — nothing else depends on it.
    async function changeBackup(fn: () => Promise<string | void>) {
        setBackupError('');
        setBackupBusy(true);
        try {
            await fn();
            setBackup(await GetBackupStatus());
        } catch (e: any) {
            setBackupError(String(e));
        } finally {
            setBackupBusy(false);
        }
    }

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
        <div className="space-y-4">

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
                <CardContent className="space-y-4">
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

            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <ArchiveRestore className="size-5 text-muted-foreground"/>
                        <CardTitle>Backups</CardTitle>
                    </div>
                    <CardDescription>
                        A copy of the database is saved automatically the first time the app opens each
                        day (named for the previous day). The last 30 days are kept; older copies are
                        deleted.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                        <p className="flex items-center gap-2 text-sm font-medium">
                            Backup folder
                            {backup && !backup.isCustom && (
                                <span className="rounded-full border px-2 py-0.5 text-xs font-normal text-muted-foreground">
                                    Default
                                </span>
                            )}
                        </p>
                        <div className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm break-all">
                            {backup ? backup.dir : '—'}
                        </div>
                        {backup && (
                            <p className="text-sm text-muted-foreground">
                                {backup.count === 0
                                    ? 'No backups yet.'
                                    : `${backup.count} backup${backup.count === 1 ? '' : 's'} · latest ${backup.latestFile} (${
                                          parseIsoDate(backup.latestDate) || backup.latestDate
                                      })`}
                            </p>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Button variant="outline" disabled={backupBusy} onClick={() => changeBackup(ChooseBackupFolder)}>
                            <FolderOpen className="size-4"/>
                            Change folder…
                        </Button>
                        <Button
                            variant="outline"
                            disabled={backupBusy || !backup?.isCustom}
                            onClick={() => changeBackup(ResetBackupFolder)}
                        >
                            Use default
                        </Button>
                    </div>

                    {(backupError || backup?.lastError) && (
                        <p className="text-sm text-destructive">
                            Last backup attempt failed: {backupError || backup?.lastError}
                        </p>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Download className="size-5 text-muted-foreground"/>
                        <CardTitle>Updates</CardTitle>
                    </div>
                    <CardDescription>Current version: {version || '—'}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Button
                        variant="outline"
                        disabled={checking || installing}
                        onClick={checkForUpdate}
                    >
                        <RefreshCw className="size-4"/>
                        Check for Updates
                    </Button>

                    {updateInfo && !updateInfo.available && (
                        <p className="text-sm text-muted-foreground">
                            You're up to date ({updateInfo.currentVersion}).
                        </p>
                    )}

                    {updateInfo?.available && (
                        <div className="space-y-3 rounded-md border bg-muted/40 p-4">
                            <div className="space-y-1">
                                <p className="text-sm font-medium">
                                    Update available: {updateInfo.latestVersion}
                                </p>
                                {updateInfo.releaseNotes && (
                                    <p className="max-h-40 overflow-y-auto whitespace-pre-line text-sm text-muted-foreground">
                                        {updateInfo.releaseNotes}
                                    </p>
                                )}
                            </div>
                            <Button disabled={installing} onClick={installUpdate}>
                                <Download className="size-4"/>
                                {installing ? 'Installing…' : 'Download & Install'}
                            </Button>
                        </div>
                    )}

                    {installStatus && <p className="text-sm text-emerald-600">{installStatus}</p>}
                    {updateError && <p className="text-sm text-destructive">{updateError}</p>}
                </CardContent>
            </Card>
        </div>
    );
}
