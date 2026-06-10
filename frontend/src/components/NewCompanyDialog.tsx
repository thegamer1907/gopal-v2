import {useEffect, useState} from 'react';
import {AddCompany} from '../../wailsjs/go/main/App';
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

// Dialog to add a brand-new company to the master while building a purchase bill.
// On save it persists via AddCompany and hands the created company back to the
// caller (which also pushes it into the in-memory cache). Mirrors NewItemDialog.
interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialName: string;
    onCreated: (company: db.Company) => void;
}

export function NewCompanyDialog({open, onOpenChange, initialName, onCreated}: Props) {
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    // Seed the name from what the user typed in the search field each time it opens.
    useEffect(() => {
        if (open) {
            setName(initialName);
            setError('');
        }
    }, [open, initialName]);

    async function save() {
        const trimmed = name.trim();
        if (!trimmed) return;
        setSaving(true);
        try {
            const created = await AddCompany(trimmed);
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
                    <DialogTitle>Add new company</DialogTitle>
                    <DialogDescription>
                        Saved to the company master and available for future bills.
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
                        <Label htmlFor="nc-name">Company name</Label>
                        <Input
                            id="nc-name"
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
                        Save company
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
