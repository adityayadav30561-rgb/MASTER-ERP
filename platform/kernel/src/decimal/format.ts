import { currencyScale } from "./currency.ts";
import type { Decimal } from "./decimal.ts";
import type { Money } from "./money.ts";

/**
 * Display formatting. Intl.NumberFormat formats decimal *strings* exactly (ECMA-402 v3),
 * so no value is converted to a binary float on the way to the screen or the PDF.
 */
export function formatMoney(money: Money, locale = "en-IN"): string {
  const scale = currencyScale(money.currency);
  // An unrounded amount shows all its digits: display never hides a rounding question.
  const nf = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currency,
    minimumFractionDigits: scale,
    maximumFractionDigits: Math.max(scale, money.amount.scale()),
  });
  return nf.format(money.toString() as `${number}`);
}

export function formatDecimal(value: Decimal, locale = "en-IN", minFractionDigits = 0, maxFractionDigits = 6): string {
  const nf = new Intl.NumberFormat(locale, {
    minimumFractionDigits: minFractionDigits,
    maximumFractionDigits: maxFractionDigits,
    roundingMode: "halfExpand",
  });
  return nf.format(value.toString() as `${number}`);
}
