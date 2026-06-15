import {useEffect, useState} from 'react';
import {UpdateCompany} from '../../wailsjs/go/main/App';
import {db} from '../../wailsjs/go/models';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

// Dialog to rename an existing company. Controlled (open + company passed in by the
// parent); on save it persists via UpdateCompany and hands the updated record back.
interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    company: db.Company | null;
    onUpdated: (company: db.Company) => void;
}

export function EditCompanyDialog({open, onOpenChange, company, onUpdated}: Props) {
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    // Seed the form from the company being edited each time it opens.
    useEffect(() => {
        if (open && company) {
            setName(company.name);
            setError('');
        }
    }, [open, company]);

    async function save() {
        const trimmed = name.trim();
        if (!trimmed || !company) return;
        setSaving(true);
        try {
            const updated = await UpdateCompany(company.id, trimmed);
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
                    <DialogTitle>Edit company</DialogTitle>
                    <DialogDescription>
                        Rename this company. Existing items and bills keep their link.
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
                        <Label htmlFor="ec-name">Company name</Label>
                        <Input
                            id="ec-name"
                            autoFocus
                            autoComplete="off"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                </form>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={save} disabled={!name.trim() || saving}>
                        Save changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
