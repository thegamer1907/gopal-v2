import {HashRouter, Routes, Route} from 'react-router-dom';
import {TopNav} from '@/components/TopNav';
import {UnsavedChangesProvider} from '@/components/UnsavedChanges';
import {Dashboard} from '@/pages/Dashboard';
import {AddPurchaseBill} from '@/pages/AddPurchaseBill';
import {SavedBills} from '@/pages/SavedBills';
import {Items} from '@/pages/Items';
import {Companies} from '@/pages/Companies';
import {Reports} from '@/pages/Reports';
import {Settings} from '@/pages/Settings';

// App shell: a flat, always-visible top navigation bar (TopNav) above the routed
// page content, which scrolls vertically below it (full-width). The outer column is
// pinned to viewport height (h-svh) so the <main> area scrolls internally and
// full-height pages (e.g. the centered Dashboard) work. Routing uses HashRouter so it
// works inside the Wails webview. Add a page by creating it under src/pages, then
// adding a <Route> here and a link in TopNav.
function App() {
    return (
        <HashRouter>
            <UnsavedChangesProvider>
                <div className="flex h-svh flex-col">
                    <TopNav/>
                    <main className="flex-1 overflow-auto px-6 py-8">
                        <Routes>
                            <Route path="/" element={<Dashboard/>}/>
                            <Route path="/purchase-bills/new" element={<AddPurchaseBill/>}/>
                            <Route path="/purchase-bills/:id/edit" element={<AddPurchaseBill/>}/>
                            <Route path="/purchase-bills" element={<SavedBills/>}/>
                            <Route path="/items" element={<Items/>}/>
                            <Route path="/companies" element={<Companies/>}/>
                            <Route path="/reports" element={<Reports/>}/>
                            <Route path="/settings" element={<Settings/>}/>
                        </Routes>
                    </main>
                </div>
            </UnsavedChangesProvider>
        </HashRouter>
    );
}

export default App;
