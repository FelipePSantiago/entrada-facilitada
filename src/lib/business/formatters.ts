
/**
 * @fileOverview Robust utility functions for handling Brazilian Real currency.
 * Unified approach for currency handling with consistent behavior.
 */


/**
 * Converts a Brazilian-formatted area string (e.g., "1.500,75 m²") or an
 * American-formatted area string (e.g., "1,500.75 m²") to a pure number.
 * This function is robust to handle both comma and dot as decimal separators.
 * @param areaStr The area string or number to convert.
 * @returns The area as a number (e.g., 1500.75). Returns 0 for invalid formats.
 */
export function areaToNumber(areaStr: string | number | null | undefined): number {
    if (areaStr === null || areaStr === undefined) return 0;
    if (typeof areaStr === 'number') return areaStr;

    const valueStr = String(areaStr).trim();
    if (valueStr === "") return 0;
    
    // Clean the string from units and spaces
    const cleanedStr = valueStr.toLowerCase().replace(/m²|m2/g, '').trim();

    // Check if the string uses a comma as a decimal separator (Brazilian format)
    const hasCommaDecimal = cleanedStr.includes(',') && (!cleanedStr.includes('.') || cleanedStr.lastIndexOf(',') > cleanedStr.lastIndexOf('.'));

    let normalizedStr: string;
    if (hasCommaDecimal) {
        // Brazilian format: "1.500,75" -> "1500.75"
        normalizedStr = cleanedStr.replace(/\./g, '').replace(',', '.');
    } else {
        // American/Default format: "1,500.75" -> "1500.75"
        normalizedStr = cleanedStr.replace(/,/g, '');
    }

    const valueAsFloat = parseFloat(normalizedStr);

    if (isNaN(valueAsFloat)) {
        console.warn(`Invalid area format provided to areaToNumber: "${areaStr}" -> "${normalizedStr}"`);
        return 0;
    }

    return valueAsFloat;
}

/**
 * Converts a number into a Brazilian-formatted area string.
 * @param areaNum The area number to format.
 * @returns The formatted area string with " m²" unit (e.g., "1.500,75 m²").
 */
export function numberToArea(areaNum: number | null | undefined): string {
    if (areaNum === null || areaNum === undefined || typeof areaNum !== 'number' || !isFinite(areaNum)) {
        return "0,00 m²";
    }

    const formatted = areaNum.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

    return `${formatted} m²`;
}

/**
 * Parses a BRL-formatted string (e.g., "1.234,56") into an integer value in cents.
 * Handles cases with or without currency symbols.
 * @param input The BRL string to parse.
 * @returns The value in cents as an integer, or null for invalid/empty input.
 */
export const brlToCents = (input: string | number | null | undefined): number | null => {
  if (input === null || input === undefined) return null;
  
  if (typeof input === 'number') {
    return Math.round(input * 100);
  }

  if (typeof input !== 'string' || input.trim() === '') return null;
  
  const numericString = input.replace(/R\$\s?/, '').replace(/\./g, '').replace(',', '.');
  const value = parseFloat(numericString);
  
  return isNaN(value) ? null : Math.round(value * 100);
};


/**
 * Formats a value in cents to a BRL formatted string (e.g., "R$ 1.234,56").
 * @param centsValue The value in cents.
 * @param options.includeSymbol - Whether to include the 'R$' prefix.
 * @returns The formatted BRL string, or an empty string for invalid inputs.
 */
export const centsToBrl = (centsValue?: number | null, options: { includeSymbol?: boolean } = { includeSymbol: true }): string => {
    if (centsValue === null || centsValue === undefined || isNaN(centsValue)) {
        return options.includeSymbol ? 'R$ 0,00' : '0,00';
    }

    const reaisValue = centsValue / 100;

    const formatted = reaisValue.toLocaleString('pt-BR', {
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

    if (options.includeSymbol) {
        return `R$ ${formatted}`;
    }

    return formatted;
};

/**
 * Formats a number as a percentage string with two decimal places.
 * @param value The number to format (e.g., 0.25 for 25%).
 * @returns The formatted percentage string (e.g., "25,00%"), or "N/A" for invalid input.
 */
export const formatPercentage = (value: number) => {
    if (isNaN(value) || !isFinite(value)) {
        return "N/A";
    }
    return value.toLocaleString("pt-BR", {
        style: "percent",
        minimumFractionDigits: 2,
    });
};
