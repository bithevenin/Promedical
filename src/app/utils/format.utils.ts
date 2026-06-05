/**
 * Utilities for formatting monetary amounts and dates.
 */

/**
 * Returns today's date as a YYYY-MM-DD string using the device's LOCAL timezone.
 * Always use this instead of new Date().toISOString().split('T')[0] which returns UTC date.
 */
export function getLocalDateString(date?: Date): string {
  const d = date || new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parses the JCE API date format "M/D/YYYY h:mm:ss AM/PM" into YYYY-MM-DD.
 * Handles both ISO format ("1991-02-16T00:00:00") and the JCE M/D/YYYY format.
 * @param jceDate The raw date string from the JCE API.
 * @returns A YYYY-MM-DD string, or empty string if invalid.
 */
export function parseJCEDate(jceDate: string | null | undefined): string {
  if (!jceDate) return '';

  // If it already looks like ISO (contains 'T' or is YYYY-MM-DD)
  if (jceDate.includes('T') || /^\d{4}-\d{2}-\d{2}$/.test(jceDate)) {
    return jceDate.split('T')[0];
  }

  // JCE format: "M/D/YYYY h:mm:ss AM/PM" e.g. "2/16/1991 12:00:00 AM"
  const match = jceDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    const month = String(match[1]).padStart(2, '0');
    const day = String(match[2]).padStart(2, '0');
    const year = match[3];
    return `${year}-${month}-${day}`;
  }

  return '';
}

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
