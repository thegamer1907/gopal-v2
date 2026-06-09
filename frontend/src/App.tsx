import {HashRouter, Routes, Route} from 'react-router-dom';
import {Package} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {UnsavedChangesProvider} from '@/components/UnsavedChanges';
import {Dashboard} from '@/pages/Dashboard';
import {AddPurchaseBill} from '@/pages/AddPurchaseBill';
import {Items} from '@/pages/Items';

// App shell: a top bar (brand + nav chips) over the routed page content.
// Routing uses HashRouter so it works inside the Wails webview. Add a page by
// creating it under src/pages, then adding a <Route> here and a chip in Nav.tsx.
function App() {
    return (
        <HashRouter>
            <UnsavedChangesProvider>
            <div className="flex h-full flex-col bg-background">
                <header className="shrink-0 border-b">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4">
                        <div className="flex items-center gap-2">
                            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                                <Package className="size-5"/>
                            </div>
                            <span className="text-lg font-semibold tracking-tight">Inventory</span>
                        </div>
                        <Nav/>
                    </div>
                </header>

                <main className="flex-1 overflow-auto px-6 py-8">
                    <Routes>
                        <Route path="/" element={<Dashboard/>}/>
                        <Route path="/purchase-bills/new" element={<AddPurchaseBill/>}/>
                        <Route path="/items" element={<Items/>}/>
                    </Routes>
                </main>
            </div>
            </UnsavedChangesProvider>
        </HashRouter>
    );
}

export default App;
