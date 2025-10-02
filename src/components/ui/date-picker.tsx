
"use client";

import * as React from "react";
import { format, isValid, parse, parseISO } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Calendar, CalendarProps } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

interface DatePickerProps {
  value?: string; // Expect ISO string
  onChange: (date?: string) => void; // Return ISO string
  disabled?: boolean | ((date: Date) => boolean);
  calendarProps?: Omit<
    CalendarProps,
    "mode" | "selected" | "onSelect" | "initialFocus"
  >;
}

export function DatePicker({
  value,
  onChange,
  disabled,
  calendarProps,
}: DatePickerProps) {
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");

  const selectedDate = React.useMemo(() => (value ? parseISO(value) : undefined), [value]);

  React.useEffect(() => {
    if (value && isValid(parseISO(value))) {
        setInputValue(format(parseISO(value), "dd/MM/yyyy"));
    } else {
        setInputValue("");
    }
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, ""); // Remove non-digit characters

    if (val.length > 2) {
      val = val.slice(0, 2) + "/" + val.slice(2);
    }
    if (val.length > 5) {
      val = val.slice(0, 5) + "/" + val.slice(5, 9);
    }
    
    setInputValue(val);

    if (val.length === 10) {
      const parsedDate = parse(val, "dd/MM/yyyy", new Date());
      if (isValid(parsedDate)) {
        onChange(parsedDate.toISOString());
      } else {
       onChange(undefined);
      }
    } else {
       onChange(undefined);
    }
  };

  const handleDateSelect = (date?: Date) => {
    if (date) {
        onChange(date.toISOString());
        setInputValue(format(date, "dd/MM/yyyy"));
    } else {
        onChange(undefined);
    }
    setIsPopoverOpen(false);
  };
  
  const isDisabled = typeof disabled === 'boolean' ? disabled : false;
  const disabledDays = typeof disabled === 'function' ? disabled : undefined;

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
          <Input
            value={inputValue}
            onChange={handleInputChange}
            placeholder="DD/MM/AAAA"
            disabled={isDisabled}
            className={cn("w-[180px] pl-10", !value && "text-muted-foreground")}
            type="tel"
            inputMode="numeric"
            pattern="[0-9/]*"
          />
          <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleDateSelect}
          initialFocus
          disabled={disabledDays}
          {...calendarProps}
        />
      </PopoverContent>
    </Popover>
  );
}
