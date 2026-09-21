import {useState} from 'react';
import {NavLink, useLocation, useNavigate} from 'react-router-dom';
import {LayoutDashboard, FilePlus2, FileText, Package, Building2, FileSpreadsheet, Settings, LogOut, X} from 'lucide-react';
import {Quit} from '../../wailsjs/go/main/App';
import {useUnsavedChanges} from '@/components/UnsavedChanges';
import {Button, buttonVariants} from '@/components/ui/button';
import {cn} from '@/lib/utils';
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

// Top navigation bar. A flat, always-visible horizontal row of links (no collapse,
// nothing hidden) — replaces the old left sidebar. Page content scrolls vertically
// below it. To add a page: create it under src/pages, add a <Route> in App.tsx,
// then add an entry to `links` below. See docs/UI.md.
type NavItem = {to: string; label: string; icon: React.ComponentType<{className?: string}>};

const links: NavItem[] = [
    {to: '/', label: 'Dashboard', icon: LayoutDashboard},
    {to: '/purchase-bills/new', label: 'Add Purchase Bill', icon: FilePlus2},
    {to: '/purchase-bills', label: 'View/Edit Bills', icon: FileText},
    {to: '/items', label: 'Items', icon: Package},
    {to: '/companies', label: 'Companies', icon: Building2},
    {to: '/reports', label: 'Reports', icon: FileSpreadsheet},
];

export function TopNav() {
    const {dirty, setDirty} = useUnsavedChanges();
    const navigate = useNavigate();
    const location = useLocation();
    // Destination held while the unsaved-changes prompt is open.
    const [pending, setPending] = useState<string | null>(null);
    // Whether the "close the app?" confirmation is open.
    const [confirmQuit, setConfirmQuit] = useState(false);

    function isActive(to: string): boolean {
        // Exact match — '/purchase-bills' and '/purchase-bills/new' are siblings, so a
        // startsWith check would light both up at once.
        return location.pathname === to;
    }

    function handleClick(e: React.MouseEvent, to: string) {
        // If leaving a page with unsaved edits, intercept and confirm first.
        if (dirty && to !== location.pathname) {
            e.preventDefault();
            setPending(to);
        }
    }

    function confirmLeave() {
        if (pending) {
            setDirty(false);
            navigate(pending);
        }
        setPending(null);
    }

    // A nav link styled as a ghost button; active route gets a filled, emphasized look.
    function navLinkClass(to: string): string {
        return cn(
            buttonVariants({variant: 'ghost', size: 'sm'}),
            'gap-2 font-normal text-muted-foreground',
            isActive(to) && 'bg-muted font-medium text-foreground',
        );
    }

    return (
        <>
            <header className="flex h-14 items-center gap-2 border-b bg-background px-6">
                <span className="mr-2 text-base font-semibold tracking-tight">GopalOne</span>

                <nav className="flex flex-wrap items-center gap-1">
                    {links.map(({to, label, icon: Icon}) => (
                        <NavLink key={to} to={to} className={navLinkClass(to)} onClick={(e) => handleClick(e, to)}>
                            <Icon className="size-4"/>
                            <span>{label}</span>
                        </NavLink>
                    ))}
                </nav>

                <div className="ml-auto flex items-center gap-1">
                    <NavLink to="/settings" className={navLinkClass('/settings')} onClick={(e) => handleClick(e, '/settings')}>
                        <Settings className="size-4"/>
                        <span>Settings</span>
                    </NavLink>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2 font-normal text-muted-foreground"
                        onClick={() => setConfirmQuit(true)}
                    >
                        <LogOut className="size-4"/>
                        <span>Logout</span>
                    </Button>
                </div>
            </header>

            <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
                <AlertDialogContent>
                    {/* Top-right close = keep editing (same as Continue editing). */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-4 top-4 size-7 text-muted-foreground"
                        aria-label="Close"
                        onClick={() => setPending(null)}
                    >
                        <X className="size-4"/>
                    </Button>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Save your changes before leaving?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This page has changes you haven't saved. If you leave now, they'll be lost.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogAction variant="outline" onClick={confirmLeave}>
                            Discard changes
                        </AlertDialogAction>
                        <AlertDialogCancel variant="default">Continue editing</AlertDialogCancel>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={confirmQuit} onOpenChange={setConfirmQuit}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Close GopalOne?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will close the application.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => Quit()}>Close</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
