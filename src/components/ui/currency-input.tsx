
"use client";

import { useRef, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { centsToBrl } from "@/lib/business/formatters";

// Define InputProps localmente para desacoplar do componente Input
type InputProps = ComponentProps<'input'>;

interface CurrencyInputProps extends Omit<InputProps, 'onChange' | 'value' | 'defaultValue'> {
  value: number | null; // Value in CENTS
  onValueChange: (valueInCents: number | null) => void;
}

export const CurrencyInput = ({
  value: valueInCents,
  onValueChange,
  className,
  onBlur,
  ...props
}: CurrencyInputProps) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { value: rawValue } = e.target;
        const numericValue = rawValue.replace(/\D/g, '');
        const cents = parseInt(numericValue, 10) || 0;

        if (onValueChange) {
            onValueChange(cents);
        }
    };

    const handleInternalBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        if (onBlur) {
            onBlur(e);
        }
    };
    
    const displayValue = centsToBrl(valueInCents, { includeSymbol: false });

    return (
      <Input
        ref={inputRef}
        value={displayValue}
        onChange={handleChange}
        onBlur={handleInternalBlur}
        placeholder="0,00"
        className={cn('text-left', className)}
        inputMode="numeric"
        type="text"
        {...props}
      />
    );
  }

CurrencyInput.displayName = 'CurrencyInput';
