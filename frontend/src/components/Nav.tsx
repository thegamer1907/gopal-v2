import {useState} from 'react';
import {NavLink, useLocation, useNavigate} from 'react-router-dom';
import {LayoutDashboard, FilePlus2, Package} from 'lucide-react';
import {cn} from '@/lib/utils';
import {useUnsavedChanges} from '@/components/UnsavedChanges';
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

// Top navigation chips. Each chip routes to a page; the active route is highlighted.
// Add a new page by adding an entry here and a matching <Route> in App.tsx.
const links = [
    {to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true},
    {to: '/purchase-bills/new', label: 'Add Purchase Bill', icon: FilePlus2, end: false},
    {to: '/items', label: 'Items', icon: Package, end: false},
];

export function Nav() {
    const {dirty, setDirty} = useUnsavedChanges();
    const navigate = useNavigate();
    const location = useLocation();
    // Destination held while the "discard unsaved changes?" prompt is open.
    const [pending, setPending] = useState<string | null>(null);

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

    return (
        <>
            <nav className="flex flex-wrap items-center gap-2">
                {links.map(({to, label, icon: Icon, end}) => (
                    <NavLink
                        key={to}
                        to={to}
                        end={end}
                        onClick={(e) => handleClick(e, to)}
                        className={({isActive}) =>
                            cn(
                                'inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                                isActive
                                    ? 'border-transparent bg-primary text-primary-foreground'
                                    : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
                            )
                        }
                    >
                        <Icon className="size-4"/>
                        {label}
                    </NavLink>
                ))}
            </nav>

            <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This page has data you haven't saved. Leaving now will lose it.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Stay and save</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmLeave}>Switch anyway</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
