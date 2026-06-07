import * as React from 'react';
import {Input} from '@/components/ui/input';

// A plain numeric text box: no up/down spinner, accepts digits and a single
// decimal point only. Use instead of <Input type="number"> for amount/qty fields.
type NumberInputProps = Omit<React.ComponentProps<typeof Input>, 'type' | 'onChange'> & {
    value: string;
    onChange: (value: string) => void;
};

const NUMERIC = /^\d*\.?\d*$/;

export function NumberInput({value, onChange, ...props}: NumberInputProps) {
    return (
        <Input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={(e) => {
                const next = e.target.value;
                if (NUMERIC.test(next)) onChange(next);
            }}
            {...props}
        />
    );
}
