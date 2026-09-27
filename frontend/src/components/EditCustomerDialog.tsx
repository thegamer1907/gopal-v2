import {useEffect, useState} from 'react';
import {UpdateCustomer} from '../../wailsjs/go/main/App';
import {db} from '../../wailsjs/go/models';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {StateCombobox} from '@/components/StateCombobox';
import {MobileInput} from '@/components/MobileInput';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

// Dialog to edit an existing customer. Controlled (open + customer passed in by the
// parent); on save it persists via UpdateCustomer and hands the updated record back.
// Mirrors EditItemDialog/EditCompanyDialog.
interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    customer: db.Customer | null;
    onUpdated: (customer: db.Customer) => void;
}

export function EditCustomerDialog({open, onOpenChange, customer, onUpdated}: Props) {
    const [name, setName] = useState('');
    const [nickName, setNickName] = useState('');
    const [mobile, setMobile] = useState('');
    const [address1, setAddress1] = useState('');
    const [address2, setAddress2] = useState('');
    const [city, setCity] = useState('');
    const [state, setState] = useState('');
    const [pincode, setPincode] = useState('');
    const [gstin, setGstin] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    // Seed the form from the customer being edited each time it opens.
    useEffect(() => {
        if (open && customer) {
            setName(customer.name);
            setNickName(customer.nickName);
            setMobile(customer.mobile);
            setAddress1(customer.address1);
            setAddress2(customer.address2);
            setCity(customer.city);
            setState(customer.state);
            setPincode(customer.pincode);
            setGstin(customer.gstin);
            setError('');
        }
    }, [open, customer]);

    // Mobile is optional, but if any digits are entered they must form a full 10-digit
    // number (MobileInput already blocks non-digit characters and anything past 10).
    const mobileValid = mobile === '' || mobile.length === 10;

    // Only Name and City are required (same bar as Add customer).
    const isValid = name.trim() !== '' && city.trim() !== '' && mobileValid;

    async function save() {
        if (!isValid || !customer) return;
        setSaving(true);
        try {
            const updated = await UpdateCustomer({
                id: customer.id,
                name: name.trim(),
                nickName: nickName.trim(),
                address1: address1.trim(),
                address2: address2.trim(),
                city: city.trim(),
                state,
                pincode: pincode.trim(),
                gstin: gstin.trim(),
                mobile: mobile.trim(),
            } as db.Customer);
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
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Edit customer</DialogTitle>
                    <DialogDescription>Update this customer's details.</DialogDescription>
                </DialogHeader>

                <form
                    className="grid gap-3 sm:grid-cols-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        save();
                    }}
                >
                    <div className="grid gap-2">
                        <Label htmlFor="ec-name">Name</Label>
                        <Input id="ec-name" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)}/>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="ec-nickName">Nick Name</Label>
                        <Input id="ec-nickName" autoComplete="off" value={nickName} onChange={(e) => setNickName(e.target.value)}/>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="ec-mobile">Mobile</Label>
                        <MobileInput id="ec-mobile" value={mobile} onChange={setMobile}/>
                        {!mobileValid && (
                            <p className="text-xs text-destructive">Mobile number must be 10 digits.</p>
                        )}
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="ec-address1">Address 1</Label>
                        <Input id="ec-address1" autoComplete="off" value={address1} onChange={(e) => setAddress1(e.target.value)}/>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="ec-address2">Address 2</Label>
                        <Input id="ec-address2" autoComplete="off" value={address2} onChange={(e) => setAddress2(e.target.value)}/>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="ec-city">City</Label>
                        <Input id="ec-city" autoComplete="off" value={city} onChange={(e) => setCity(e.target.value)}/>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="ec-state">State</Label>
                        <StateCombobox id="ec-state" value={state} onSelect={setState}/>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="ec-pincode">Pincode</Label>
                        <Input id="ec-pincode" autoComplete="off" value={pincode} onChange={(e) => setPincode(e.target.value)}/>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="ec-gstin">GSTIN</Label>
                        <Input id="ec-gstin" autoComplete="off" value={gstin} onChange={(e) => setGstin(e.target.value)}/>
                    </div>
                    {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
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
