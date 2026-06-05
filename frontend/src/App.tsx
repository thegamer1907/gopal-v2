import {useEffect, useState} from 'react';
import {Package, Plus} from 'lucide-react';
import {AddItem, ListItems} from "../wailsjs/go/main/App";
import {db} from "../wailsjs/go/models";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

// Minimal items screen — proves the Go <-> frontend <-> SQLite round-trip with the
// shadcn/Tailwind stack. Skeleton; the real inventory UI replaces it. See docs/UI.md.
function App() {
    const [items, setItems] = useState<db.Item[]>([]);
    const [name, setName] = useState('');
    const [quantity, setQuantity] = useState('1');
    const [error, setError] = useState('');

    async function refresh() {
        try {
            setItems(await ListItems());
            setError('');
        } catch (e: any) {
            setError(String(e));
        }
    }

    useEffect(() => {
        refresh();
    }, []);

    async function add() {
        const trimmed = name.trim();
        if (!trimmed) return;
        try {
            await AddItem(trimmed, parseInt(quantity, 10) || 0);
            setName('');
            setQuantity('1');
            await refresh();
        } catch (e: any) {
            setError(String(e));
        }
    }

    return (
        <div className="min-h-screen bg-background">
            <div className="mx-auto max-w-3xl px-6 py-10">
                <header className="mb-8 flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <Package className="size-5"/>
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">Inventory</h1>
                        <p className="text-sm text-muted-foreground">
                            {items.length} {items.length === 1 ? 'item' : 'items'} in stock
                        </p>
                    </div>
                </header>

                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle>Add item</CardTitle>
                        <CardDescription>Create a new inventory record.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form
                            className="flex flex-wrap items-end gap-3"
                            onSubmit={(e) => {
                                e.preventDefault();
                                add();
                            }}
                        >
                            <div className="grid flex-1 gap-2 min-w-48">
                                <Label htmlFor="name">Name</Label>
                                <Input
                                    id="name"
                                    placeholder="e.g. Widget"
                                    autoComplete="off"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </div>
                            <div className="grid gap-2 w-28">
                                <Label htmlFor="quantity">Quantity</Label>
                                <Input
                                    id="quantity"
                                    type="number"
                                    min="0"
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                />
                            </div>
                            <Button type="submit" disabled={!name.trim()}>
                                <Plus className="size-4"/>
                                Add
                            </Button>
                        </form>
                        {error && (
                            <p className="mt-3 text-sm text-destructive">{error}</p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Items</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {items.length === 0 ? (
                            <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                                <Package className="size-8 opacity-40"/>
                                <p className="text-sm">No items yet. Add one above to get started.</p>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead className="text-right">Quantity</TableHead>
                                        <TableHead className="text-right">Added</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {items.map((it) => (
                                        <TableRow key={it.id}>
                                            <TableCell className="font-medium">{it.name}</TableCell>
                                            <TableCell className="text-right tabular-nums">{it.quantity}</TableCell>
                                            <TableCell className="text-right text-muted-foreground">
                                                {new Date(it.createdAt).toLocaleDateString()}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default App;
