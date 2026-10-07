import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Confirms marking an order delivered — a one-way action that also assigns the order its
// delivery number, so it gets the same "are you sure" treatment as deleting. Shared by the
// /orders list row button and the order edit page, which both need identical wording.
//
// Controlled (open + onOpenChange), with no AlertDialogTrigger: on React 18 our shadcn
// components drop the ref inside a Radix asChild trigger and the dialog never opens.
interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    orderId: number;
    customerName: string;
    onConfirm: () => void;
}

export function MarkDeliveredDialog({open, onOpenChange, orderId, customerName, onConfirm}: Props) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Mark this order delivered?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Order <span className="font-medium text-foreground">#{orderId}</span> for{' '}
                        <span className="font-medium text-foreground">{customerName}</span> will be
                        marked delivered and given the next delivery number. This cannot be undone —
                        it can't be moved back to pending, and only its Qty and Rate can be changed
                        afterwards.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm}>Mark delivered</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
