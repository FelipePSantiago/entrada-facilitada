

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
