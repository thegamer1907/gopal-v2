import {useEffect, useState} from 'react';
import {AddItem} from '../../wailsjs/go/main/App';
import {db} from '../../wailsjs/go/models';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {NumberInput} from '@/components/NumberInput';
import {CompanyCombobox} from '@/components/CompanyCombobox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

// Dialog to add a brand-new item to the master while building a purchase bill.
// The company defaults to the bill's company but can be changed. On save it
// persists via AddItem and hands the created item back to the caller (which
// attaches it to the line only if it belongs to the bill's company).
interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialName: string;
    companies: db.Company[];
    defaultCompany: db.Company | null;
    onCreated: (item: db.Item) => void;
}

export function NewItemDialog({open, onOpenChange, initialName, companies, defaultCompany, onCreated}: Props) {
    const [company, setCompany] = useState<db.Company | null>(null);
    const [name, setName] = useState('');
    const [packSize, setPackSize] = useState('');
    const [gstPercent, setGstPercent] = useState('');
    const [hsn, setHsn] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    // Seed the company (from the bill) and the name (from the search) each open.
    useEffect(() => {
        if (open) {
            setCompany(defaultCompany);
            setName(initialName);
            setPackSize('');
            setGstPercent('');
            setHsn('');
            setError('');
        }
    }, [open, initialName, defaultCompany]);

    // All fields mandatory (data-entry pattern).
    const isValid =
        company !== null &&
        [name, packSize, gstPercent, hsn].every((v) => v.trim() !== '');

    async function save() {
        if (!isValid || !company) return;
        setSaving(true);
        try {
            const created = await AddItem(
                company.id,
                name.trim(),
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
                        Saved to the item master under the chosen company and available for future bills.
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
                        <Label htmlFor="ni-company">Company</Label>
                        <CompanyCombobox
                            id="ni-company"
                            companies={companies}
                            value={company}
                            onSelect={setCompany}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="ni-name">Item</Label>
                        <Input
                            id="ni-name"
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
                    <Button type="button" onClick={save} disabled={!isValid || saving}>
                        Save item
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
