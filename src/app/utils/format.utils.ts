/**
 * Utilities for formatting monetary amounts.
 */

/**
 * Formats a number or string as a currency string without decimals, e.g., $2,000.
 * @param value The value to format.
 * @returns A formatted string like "$2,000".
 */
export function formatMonto(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '$0';
  
  // Remove any formatting if it's a string
  let num: number;
  if (typeof value === 'string') {
    const cleanStr = value.replace(/[^0-9.-]/g, '');
    num = parseFloat(cleanStr);
  } else {
    num = value;
  }
  
  if (isNaN(num)) return '$0';
  
  // Format as integer with commas and dollar sign
  return '$' + Math.round(num).toLocaleString('en-US');
}

/**
 * Parses a formatted currency string back to a clean number.
 * @param value The formatted string (e.g. "$2,000" or "2,000").
 * @returns The parsed number.
 */
export function parseMonto(value: string | null | undefined): number {
  if (!value) return 0;
  const cleanStr = value.replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleanStr);
  return isNaN(num) ? 0 : num;
}
