/**
 * Amount in words, Indian numbering (thousand, lakh, crore), as printed on Indian tax invoices.
 * Works on the decimal text, never on a JavaScript number (ADR-0053).
 */
import type { Money } from "@master-erp/kernel/decimal";

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n] ?? "";
  const tens = TENS[Math.floor(n / 10)] ?? "";
  const ones = ONES[n % 10] ?? "";
  return ones ? `${tens}-${ones}` : tens;
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [hundreds ? `${ONES[hundreds]} Hundred` : "", rest ? belowHundred(rest) : ""].filter(Boolean).join(" ");
}

/** Whole-number words in the Indian system. Input is a digit string (bigint-safe). */
export function integerInWords(digits: string): string {
  let n = BigInt(digits);
  if (n === 0n) return "Zero";
  const parts: string[] = [];
  const crore = n / 10_000_000n;
  n %= 10_000_000n;
  if (crore > 0n) parts.push(`${integerInWords(crore.toString())} Crore`);
  const lakh = Number(n / 100_000n);
  n %= 100_000n;
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  const thousand = Number(n / 1000n);
  n %= 1000n;
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (n > 0n) parts.push(belowThousand(Number(n)));
  return parts.join(" ");
}

export function rupeesInWords(amount: Money): string {
  const [rupees = "0", paise = ""] = amount.round("half-up").toString().replace("-", "").split(".");
  const paiseWords = paise && Number(paise) > 0 ? ` and ${belowHundred(Number(paise))} Paise` : "";
  return `Rupees ${integerInWords(rupees)}${paiseWords} Only`;
}
