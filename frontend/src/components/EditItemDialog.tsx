import {useEffect, useState} from 'react';
import {UpdateItem} from '../../wailsjs/go/main/App';
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

// Dialog to edit an existing item (including moving it to a different company).
// Controlled (open + item passed in by the parent); on save it persists via
// UpdateItem and hands the updated record back. Mirrors NewItemDialog.
interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    item: db.Item | null;
    companies: db.Company[];
    onUpdated: (item: db.Item) => void;
}

export function EditItemDialog({open, onOpenChange, item, companies, onUpdated}: Props) {
    const [company, setCompany] = useState<db.Company | null>(null);
    const [name, setName] = useState('');
    const [packSize, setPackSize] = useState('');
    const [gstPercent, setGstPercent] = useState('');
    const [hsn, setHsn] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    // Seed the form from the item being edited each time it opens.
    useEffect(() => {
        if (open && item) {
            setCompany(companies.find((c) => c.id === item.companyId) ?? null);
            setName(item.name);
            setPackSize(String(item.packSize));
            setGstPercent(String(item.gstPercent));
            setHsn(String(item.hsn));
            setError('');
        }
    }, [open, item, companies]);

    // All fields mandatory (data-entry pattern).
    const isValid =
        company !== null &&
        [name, packSize, gstPercent, hsn].every((v) => v.trim() !== '');

    async function save() {
        if (!isValid || !company || !item) return;
        setSaving(true);
        try {
            const updated = await UpdateItem(
                item.id,
                company.id,
                name.trim(),
                parseFloat(packSize) || 0,
                parseFloat(gstPercent) || 0,
                parseInt(hsn, 10) || 0,
            );
            onUpdated(updated);
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
                    <DialogTitle>Edit item</DialogTitle>
                    <DialogDescription>
                        Update this item's details, or move it to a different company.
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
                        <Label htmlFor="ei-company">Company</Label>
                        <CompanyCombobox
                            id="ei-company"
                            companies={companies}
                            value={company}
                            onSelect={setCompany}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="ei-name">Item</Label>
                        <Input
                            id="ei-name"
                            autoComplete="off"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="grid gap-2">
                            <Label htmlFor="ei-pack">Pack Size</Label>
                            <NumberInput
                                id="ei-pack"
                                placeholder="100"
                                value={packSize}
                                onChange={setPackSize}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="ei-gst">GST %</Label>
                            <NumberInput
                                id="ei-gst"
                                placeholder="18"
                                value={gstPercent}
                                onChange={setGstPercent}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="ei-hsn">HSN</Label>
                            <NumberInput
                                id="ei-hsn"
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
                        Save changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
