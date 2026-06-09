import {useEffect, useState} from 'react';
import {Package, Plus} from 'lucide-react';
import {AddItem, ListItems} from '../../wailsjs/go/main/App';
import {db} from '../../wailsjs/go/models';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {NumberInput} from '@/components/NumberInput';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

// Item master — maintains the list of products with their Pack Size, GST %, and HSN.
// See docs/DATA_MODEL.md (items table).
export function Items() {
    const [items, setItems] = useState<db.Item[]>([]);
    const [name, setName] = useState('');
    const [packSize, setPackSize] = useState('');
    const [gstPercent, setGstPercent] = useState('');
    const [hsn, setHsn] = useState('');
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
            await AddItem(trimmed, parseFloat(packSize) || 0, parseFloat(gstPercent) || 0, parseInt(hsn, 10) || 0);
            setName('');
            setPackSize('');
            setGstPercent('');
            setHsn('');
            await refresh();
        } catch (e: any) {
            setError(String(e));
        }
    }

    return (
        <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
                {items.length} {items.length === 1 ? 'item' : 'items'}
            </p>

            <Card>
                <CardHeader>
                    <CardTitle>Add item</CardTitle>
                    <CardDescription>Create a new item in the master list.</CardDescription>
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
                            <Label htmlFor="name">Item</Label>
                            <Input
                                id="name"
                                placeholder="e.g. Hand Wash"
                                autoComplete="off"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>
                        <div className="grid gap-2 w-32">
                            <Label htmlFor="packSize">Pack Size</Label>
                            <NumberInput
                                id="packSize"
                                placeholder="100"
                                value={packSize}
                                onChange={setPackSize}
                            />
                        </div>
                        <div className="grid gap-2 w-24">
                            <Label htmlFor="gstPercent">GST %</Label>
                            <NumberInput
                                id="gstPercent"
                                placeholder="18"
                                value={gstPercent}
                                onChange={setGstPercent}
                            />
                        </div>
                        <div className="grid gap-2 w-32">
                            <Label htmlFor="hsn">HSN</Label>
                            <NumberInput
                                id="hsn"
                                placeholder="3401"
                                value={hsn}
                                onChange={setHsn}
                            />
                        </div>
                        <Button type="submit" disabled={!name.trim()}>
                            <Plus className="size-4"/>
                            Add
                        </Button>
                    </form>
                    {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
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
                                    <TableHead>Item</TableHead>
                                    <TableHead>Pack Size</TableHead>
                                    <TableHead className="text-right">GST %</TableHead>
                                    <TableHead>HSN</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {items.map((it) => (
                                    <TableRow key={`${it.name}-${it.packSize}`}>
                                        <TableCell className="font-medium">{it.name}</TableCell>
                                        <TableCell>{it.packSize}</TableCell>
                                        <TableCell className="text-right tabular-nums">{it.gstPercent}</TableCell>
                                        <TableCell>{it.hsn}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
