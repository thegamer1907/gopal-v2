import {NavLink} from 'react-router-dom';
import {LayoutDashboard, FilePlus2, Package} from 'lucide-react';
import {cn} from '@/lib/utils';

// Top navigation chips. Each chip routes to a page; the active route is highlighted.
// Add a new page by adding an entry here and a matching <Route> in App.tsx.
const links = [
    {to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true},
    {to: '/purchase-bills/new', label: 'Add Purchase Bill', icon: FilePlus2, end: false},
    {to: '/items', label: 'Items', icon: Package, end: false},
];

export function Nav() {
    return (
        <nav className="flex flex-wrap items-center gap-2">
            {links.map(({to, label, icon: Icon, end}) => (
                <NavLink
                    key={to}
                    to={to}
                    end={end}
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
    );
}
