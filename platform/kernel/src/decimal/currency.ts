/**
 * ISO 4217 currencies we support, with their minor-unit scale (paise for INR = 2).
 * The list grows with localization packs; the kernel only needs the scale.
 */
const MINOR_UNITS: Readonly<Record<string, number>> = {
  INR: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  AED: 2,
  SGD: 2,
  JPY: 0,
  KWD: 3,
  BHD: 3,
  OMR: 3,
};

export type CurrencyCode = string;

export function currencyScale(currency: CurrencyCode): number {
  const scale = MINOR_UNITS[currency];
  if (scale === undefined) throw new Error(`Unsupported ISO 4217 currency: ${currency}`);
  return scale;
}

export function isSupportedCurrency(currency: string): boolean {
  return currency in MINOR_UNITS;
}
