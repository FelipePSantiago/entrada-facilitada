import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

import { PaymentFieldType } from "@/types";
import { isSameMonth, startOfMonth, isAfter } from 'date-fns';
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Safely retrieves a value from a record-like object using multiple possible keys.
 * This function is case-insensitive.
 *
 * @param item - The object to retrieve the value from.
 * @param keys - An array of possible keys to try.
 * @returns The value found for the first matching key, or undefined if no key is matched.
 */
export const getValue = (item: Record<string, unknown>, keys: string[]): unknown => {
    if (!item) {
        return undefined;
    }

    const itemKeys = Object.keys(item).reduce((acc, key) => {
        acc[key.toLowerCase()] = item[key];
        return acc;
    }, {} as Record<string, unknown>);

    for (const key of keys) {
        if (itemKeys[key.toLowerCase()] !== undefined) {
            return itemKeys[key.toLowerCase()];
        }
    }
    return undefined;
  };

/**
 * Safely extracts an error message from an unknown type.
 * This function is robust and handles various error formats that can occur
 * on both client and server environments.
 * @param error The error object, which can be of any type.
 * @returns A string containing a descriptive error message.
 */
export const getErrorMessage = (error: unknown): string => {
  let message: string;

  if (error instanceof Error) {
    // Standard Error object (e.g., new Error('...'))
    message = error.message;
  } else if (typeof error === 'string') {
    // A simple string error message
    message = error;
  } else if (error && typeof error === 'object') {
    // Check for a 'message' property, a common pattern in error-like objects
    if ('message' in error && typeof (error as { message: unknown }).message === 'string') {
      message = (error as { message: string }).message;
    } 
    // Handle specific Firebase/Firestore error format
    else if ('code' in error && typeof (error as { code: unknown }).code === 'string') {
        message = `Error Code: ${(error as { code: string }).code}`;
    }
    // Fallback for other object shapes by attempting to serialize them
    else {
      try {
        message = JSON.stringify(error);
      } catch {
        message = 'Ocorreu um erro com um objeto não serializável.';
      }
    }
  } else {
    // Fallback for other primitive types (null, undefined, number, etc.)
    message = 'Ocorreu um erro desconhecido.';
  }

  return message;
};


/**
 * Checks if the code is running on the server side.
 * @returns True if the environment is Node.js (or similar), false otherwise.
 */
export const isServer = () => typeof window === 'undefined';

/**
 * Checks if the code is running on the client side.
 * @returns True if the environment is a browser, false otherwise.
 */
export const isClient = () => !isServer();

/**
 * Returns a function that checks if a given date is "locked" (not allowed) for a specific payment type.
 * This is used to disable certain dates in the date picker based on the payment type.
 * @param type The type of the payment field.
 * @returns A function that takes a Date and returns a boolean (true if locked, false if allowed).
 */
export const isDateLocked = (type: PaymentFieldType) => {
  return (date: Date): boolean => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (type) {
      case "sinalAto":
      case "sinal1":
      case "sinal2":
      case "sinal3":
      case "bonusAdimplencia":
        // Dates before today are locked
        return isAfter(today, date);
      case "proSoluto":
        return !isSameMonth(date, startOfMonth(today)) && isAfter(today, date);
      default:
        return false; // Other types are not locked
    }
  };
};

export const centsToBrl = (cents: number | null | undefined): string => {
  if (cents === null || cents === undefined) return "R$ 0,00";
  const reais = cents / 100;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(reais);
};
