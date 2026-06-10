import {HashRouter, Routes, Route} from 'react-router-dom';
import {AppSidebar} from '@/components/AppSidebar';
import {UnsavedChangesProvider} from '@/components/UnsavedChanges';
import {SidebarInset, SidebarProvider} from '@/components/ui/sidebar';
import {Dashboard} from '@/pages/Dashboard';
import {AddPurchaseBill} from '@/pages/AddPurchaseBill';
import {SavedBills} from '@/pages/SavedBills';
import {Items} from '@/pages/Items';
import {Companies} from '@/pages/Companies';
import {Settings} from '@/pages/Settings';

// App shell: a persistent, collapsible left sidebar (AppSidebar) beside the
// routed page content. The collapse toggle lives in the sidebar header (no top
// bar). The provider is pinned to viewport height (h-svh) so the content area
// scrolls internally and full-height pages (e.g. the centered Dashboard) work.
// Routing uses HashRouter so it works inside the Wails webview. Add a page by
// creating it under src/pages, then adding a <Route> here and an entry in AppSidebar.
function App() {
    return (
        <HashRouter>
            <UnsavedChangesProvider>
                <SidebarProvider className="h-svh">
                    <AppSidebar/>
                    <SidebarInset>
                        <div className="flex-1 overflow-auto px-6 py-8">
                            <Routes>
                                <Route path="/" element={<Dashboard/>}/>
                                <Route path="/purchase-bills/new" element={<AddPurchaseBill/>}/>
                                <Route path="/purchase-bills" element={<SavedBills/>}/>
                                <Route path="/items" element={<Items/>}/>
                                <Route path="/companies" element={<Companies/>}/>
                                <Route path="/settings" element={<Settings/>}/>
                            </Routes>
                        </div>
                    </SidebarInset>
                </SidebarProvider>
            </UnsavedChangesProvider>
        </HashRouter>
    );
}

export default App;
