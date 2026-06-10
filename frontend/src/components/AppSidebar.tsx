import {useState} from 'react';
import {NavLink, useLocation, useNavigate} from 'react-router-dom';
import {LayoutDashboard, FilePlus2, FileText, Package, Building2, Settings, Menu} from 'lucide-react';
import {useUnsavedChanges} from '@/components/UnsavedChanges';
import {Button} from '@/components/ui/button';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from '@/components/ui/sidebar';
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

// Sidebar navigation. Items are grouped; each routes to a page and highlights
// when its route is active. To add a page: create it under src/pages, add a
// <Route> in App.tsx, then add an entry to one of the groups below.
type NavItem = {to: string; label: string; icon: React.ComponentType<{className?: string}>};

const groups: {label?: string; items: NavItem[]}[] = [
    {items: [{to: '/', label: 'Dashboard', icon: LayoutDashboard}]},
    {
        label: 'Purchases',
        items: [
            {to: '/purchase-bills/new', label: 'Add Purchase Bill', icon: FilePlus2},
            {to: '/purchase-bills', label: 'Saved Bills', icon: FileText},
        ],
    },
    {
        label: 'Masters',
        items: [
            {to: '/items', label: 'Items', icon: Package},
            {to: '/companies', label: 'Companies', icon: Building2},
        ],
    },
];

export function AppSidebar() {
    const {dirty, setDirty} = useUnsavedChanges();
    const {toggleSidebar} = useSidebar();
    const navigate = useNavigate();
    const location = useLocation();
    // Destination held while the "discard unsaved changes?" prompt is open.
    const [pending, setPending] = useState<string | null>(null);

    function isActive(to: string): boolean {
        // Exact match for all routes — '/purchase-bills' and '/purchase-bills/new'
        // are siblings, so a startsWith check would light both up at once.
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

    return (
        <>
            <Sidebar collapsible="icon">
                <SidebarHeader>
                    <div className="flex items-center gap-2">
                        {/* The hamburger IS the collapse toggle — top-left of the sidebar,
                            no separate top bar. Collapsed, only this icon shows (in the rail)
                            and expands the sidebar again. */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 shrink-0"
                            aria-label="Toggle sidebar"
                            onClick={toggleSidebar}
                        >
                            <Menu className="size-5"/>
                        </Button>
                        <span className="text-base font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
                            GopalOne
                        </span>
                    </div>
                </SidebarHeader>
                <SidebarContent>
                    {groups.map((group, i) => (
                        <SidebarGroup key={group.label ?? i}>
                            {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
                            <SidebarGroupContent>
                                <SidebarMenu>
                                    {group.items.map(({to, label, icon: Icon}) => (
                                        <SidebarMenuItem key={to}>
                                            <SidebarMenuButton asChild isActive={isActive(to)} tooltip={label}>
                                                <NavLink to={to} onClick={(e) => handleClick(e, to)}>
                                                    <Icon className="size-4"/>
                                                    <span>{label}</span>
                                                </NavLink>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    ))}
                                </SidebarMenu>
                            </SidebarGroupContent>
                        </SidebarGroup>
                    ))}
                </SidebarContent>
                <SidebarFooter>
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={isActive('/settings')} tooltip="Settings">
                                <NavLink to="/settings" onClick={(e) => handleClick(e, '/settings')}>
                                    <Settings className="size-4"/>
                                    <span>Settings</span>
                                </NavLink>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarFooter>
            </Sidebar>

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
