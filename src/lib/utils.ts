import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

import { isSameMonth, startOfMonth, isAfter } from 'date-fns';
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Safely retrieves a value from a record-like object using multiple possible keys.
 * This function is case-insensitive.
 *
 * @param item - The object to retrieve value from.
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
 * Checks if code is running on server side.
 * @returns True if environment is Node.js (or similar), false otherwise.
 */
export const isServer = () => typeof window === 'undefined';

/**
 * Checks if code is running on client side.
 * @returns True if environment is a browser, false otherwise.
 */
export const isClient = () => !isServer();

/**
 * Returns a function that checks if a given date is "locked" (not allowed) for a specific payment type.
 * This is used to disable certain dates in date picker based on payment type.
 * @param type The type of payment field.
 * @returns A function that takes a Date and returns a boolean (true if locked, false if allowed).
 */
export const isDateLocked = (type: string) => {
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

/**
 * Retry wrapper for Firebase functions with exponential backoff
 * @param fn The Firebase callable function to retry
 * @param data The data to pass to function
 * @param maxRetries Maximum number of retries (default: 3)
 * @returns Promise with function result
 */
export const retryFirebaseFunction = async <T = unknown>(
  fn: (data?: unknown) => Promise<{ data: T }>,
  data?: unknown,
  maxRetries: number = 3
): Promise<{ data: T }> => {
  let lastError: unknown;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn(data);
      return result;
    } catch (error: unknown) {
      lastError = error;
      
      // Don't retry on authentication errors or invalid arguments
      if (
        error && typeof error === 'object' && 'code' in error &&
        (
          error.code === 'unauthenticated' ||
          error.code === 'permission-denied' ||
          error.code === 'invalid-argument' ||
          error.code === 'not-found'
        )
      ) {
        throw error;
      }
      
      // If this is last attempt, throw error
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff: wait 1s, 2s, 4s...
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
};