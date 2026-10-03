/** Converts an invoice amount into Indian English words. */

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];

const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o ? `${TENS[t]} ${ONES[o]}` : TENS[t];
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (rest) parts.push(twoDigits(rest));
  return parts.join(" ");
}

/** Integer (up to 999...crore) to Indian-system words. */
export function numberToWords(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return "Zero";
  if (n >= 1_000_000_000) return String(n); // beyond crore - fall back to digits

  const parts: string[] = [];
  const crore = Math.floor(n / 1_000_000);
  const lakh = Math.floor((n % 1_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1_000);
  const hundred = Math.floor((n % 1_000) / 100);
  const rest = n % 100;

  if (crore) parts.push(`${crore < 100 ? twoDigits(crore) : threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred || rest) {
    const h = threeDigits(hundred * 100 + rest);
    if (h) parts.push(h);
  }
  return parts.join(" ").trim();
}

/**
 * "INR One Thousand Six Hundred Rupees Only"
 * "INR Two Lakh Fifty Thousand Rupees and Fifty Paise Only"
 */
export function amountInWords(amount: number, currency = "INR"): string {
  const safe = Number.isFinite(amount) ? Math.round(Math.abs(amount) * 100) / 100 : 0;
  const rupees = Math.floor(safe);
  const paise = Math.round((safe - rupees) * 100);

  let words = `${currency} ${numberToWords(rupees)} Rupees`;
  if (paise > 0) words += ` and ${twoDigits(paise)} Paise`;
  return `${words} Only`;
}
