import {cn} from '@/lib/utils';
import {DateRangeFilter} from '@/components/DateRangeFilter';
import {DeliveryNoCombobox} from '@/components/DeliveryNoCombobox';
import {selectionErrors, type DeliveredSelection} from '@/lib/deliveredOrders';

// "By date | By delivery no." picker shared by the Print Delivered Orders and Export
// Delivered Orders (Excel zip) cards. Controlled; see lib/deliveredOrders.ts for the
// selection semantics (blank delivery-number ends are open-ended).
interface Props {
    value: DeliveredSelection;
    onChange: (next: DeliveredSelection) => void;
    options: number[]; // all existing delivery numbers, ascending
}

export function DeliveredOrderSelector({value, onChange, options}: Props) {
    const errors = selectionErrors(value, options);

    return (
        <div className="space-y-3">
            <div className="inline-flex rounded-md border p-0.5 text-sm">
                {(['date', 'number'] as const).map((m) => (
                    <button
                        key={m}
                        type="button"
                        onClick={() => onChange({...value, mode: m})}
                        className={cn(
                            'rounded-sm px-3 py-1',
                            value.mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                        )}
                    >
                        {m === 'date' ? 'By date' : 'By delivery no.'}
                    </button>
                ))}
            </div>

            {value.mode === 'date' ? (
                <DateRangeFilter value={value.range} onChange={(range) => onChange({...value, range})}/>
            ) : (
                <div className="flex flex-wrap items-start gap-2">
                    <DeliveryNoCombobox
                        options={options}
                        value={value.from}
                        onChange={(from) => onChange({...value, from})}
                        placeholder="From (first)"
                        error={errors.from}
                    />
                    <span className="pt-2 text-sm text-muted-foreground">to</span>
                    <DeliveryNoCombobox
                        options={options}
                        value={value.to}
                        onChange={(to) => onChange({...value, to})}
                        placeholder="To (last)"
                        error={errors.to}
                    />
                </div>
            )}
        </div>
    );
}
