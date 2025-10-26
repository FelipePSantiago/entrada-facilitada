// src/components/ui/currency-input.tsx
"use client";

import React from "react";
import { Input, type InputProps } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Helper to format cents to BRL string
const centsToFormattedBRL = (cents: number | null, options: { includeSymbol?: boolean } = {}): string => {
  if (cents === null || isNaN(cents)) return "";
  const real = cents / 100;
  return real.toLocaleString("pt-BR", {
    style: options.includeSymbol ? "currency" : "decimal",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

interface CurrencyInputProps extends Omit<InputProps, 'onChange' | 'value'> {
  value: number | null; // Value in CENTS
  onValueChange: (valueInCents: number | null) => void;
}

export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onValueChange, className, ...props }, ref) => {

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = e.target.value;
      const numericValue = rawValue.replace(/\D/g, "");
      const cents = numericValue ? parseInt(numericValue, 10) : null;
      onValueChange(cents);
    };

    const formattedValue = centsToFormattedBRL(value, { includeSymbol: false });

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="numeric"
        value={formattedValue}
        onChange={handleInputChange}
        placeholder="0,00"
        className={cn("text-left", className)}
        {...props}
      />
    );
  }
);

CurrencyInput.displayName = "CurrencyInput";