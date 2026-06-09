import {useEffect, useState} from 'react';
import {AddItem} from '../../wailsjs/go/main/App';
import {db} from '../../wailsjs/go/models';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {NumberInput} from '@/components/NumberInput';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

// Dialog to add a brand-new item to the master while building a purchase bill.
// On save it persists via AddItem and hands the created item back to the caller
// (which also pushes it into the in-memory cache).
interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialName: string;
    onCreated: (item: db.Item) => void;
}

export function NewItemDialog({open, onOpenChange, initialName, onCreated}: Props) {
    const [name, setName] = useState('');
    const [packSize, setPackSize] = useState('');
    const [gstPercent, setGstPercent] = useState('');
    const [hsn, setHsn] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    // Seed the name from what the user typed in the search field each time it opens.
    useEffect(() => {
        if (open) {
            setName(initialName);
            setPackSize('');
            setGstPercent('');
            setHsn('');
            setError('');
        }
    }, [open, initialName]);

    async function save() {
        const trimmed = name.trim();
        if (!trimmed) return;
        setSaving(true);
        try {
            const created = await AddItem(
                trimmed,
                parseFloat(packSize) || 0,
                parseFloat(gstPercent) || 0,
                parseInt(hsn, 10) || 0,
            );
            onCreated(created);
            onOpenChange(false);
        } catch (e: any) {
            setError(String(e));
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add new item</DialogTitle>
                    <DialogDescription>
                        Saved to the item master and available for future bills.
                    </DialogDescription>
                </DialogHeader>

                <form
                    className="grid gap-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        save();
                    }}
                >
                    <div className="grid gap-2">
                        <Label htmlFor="ni-name">Item</Label>
                        <Input
                            id="ni-name"
                            autoFocus
                            autoComplete="off"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="grid gap-2">
                            <Label htmlFor="ni-pack">Pack Size</Label>
                            <NumberInput
                                id="ni-pack"
                                placeholder="100"
                                value={packSize}
                                onChange={setPackSize}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="ni-gst">GST %</Label>
                            <NumberInput
                                id="ni-gst"
                                placeholder="18"
                                value={gstPercent}
                                onChange={setGstPercent}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="ni-hsn">HSN</Label>
                            <NumberInput
                                id="ni-hsn"
                                placeholder="3401"
                                value={hsn}
                                onChange={setHsn}
                            />
                        </div>
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                </form>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={save} disabled={!name.trim() || saving}>
                        Save item
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
