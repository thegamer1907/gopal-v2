import * as React from 'react';
import {Input} from '@/components/ui/input';

// A mobile-number text box: digits only (no letters/symbols), capped at 10 characters —
// no spinner, mirrors NumberInput's approach but stricter (integer, fixed max length).
type MobileInputProps = Omit<React.ComponentProps<typeof Input>, 'type' | 'onChange'> & {
    value: string;
    onChange: (value: string) => void;
};

const DIGITS = /^\d*$/;

export function MobileInput({value, onChange, ...props}: MobileInputProps) {
    return (
        <Input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={10}
            value={value}
            onChange={(e) => {
                const next = e.target.value;
                if (DIGITS.test(next) && next.length <= 10) onChange(next);
            }}
            {...props}
        />
    );
}
