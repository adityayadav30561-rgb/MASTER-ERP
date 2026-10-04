/**
 * kg ↔ sheet conversion for board and paper (Step 5A §3, "formula conversion kg ↔ sheets").
 * GSM is grams per square metre, so one sheet of L × W mm weighs GSM × L × W / 1,000,000 grams.
 * Example: 300 GSM, 700 × 1000 mm → 210 g per sheet → 4.7619… sheets per kg.
 * Exact decimals only (ADR-0053).
 */
import { Decimal } from "@master-erp/kernel/decimal";

const MILLION = Decimal.from("1000000");
const THOUSAND = Decimal.from("1000");

/** Places kept in the stored conversion factor (foundation.uom_conversion.factor is numeric(24, 10)). */
export const FACTOR_SCALE = 10;

export interface SheetSpec {
  gsm: Decimal | string;
  lengthMm: Decimal | string;
  widthMm: Decimal | string;
}

function positive(name: string, value: Decimal | string): Decimal {
  const d = Decimal.from(value);
  if (!d.greaterThan(Decimal.ZERO)) throw new RangeError(`${name} must be greater than zero`);
  return d;
}

/** Weight of one sheet in grams (exact). */
export function sheetWeightGrams(spec: SheetSpec): Decimal {
  return positive("gsm", spec.gsm).times(positive("lengthMm", spec.lengthMm)).times(positive("widthMm", spec.widthMm)).dividedBy(MILLION, 9, "half-even");
}

/** Sheets in one kilogram, to FACTOR_SCALE places. */
export function sheetsPerKg(spec: SheetSpec): Decimal {
  const gsm = positive("gsm", spec.gsm);
  const area = positive("lengthMm", spec.lengthMm).times(positive("widthMm", spec.widthMm));
  // 1000 g / (gsm × area / 1e6) = 1e9 / (gsm × area): one division, so only one rounding.
  return THOUSAND.times(MILLION).dividedBy(gsm.times(area), FACTOR_SCALE, "half-even");
}

/**
 * The item-specific conversion "1 kg = n sheet" for an item with GSM, length and width, in the shape
 * foundation's ItemService accepts (`conversions`). Undefined when the item is not a sized sheet.
 */
export function kgToSheetConversion(ext: Readonly<Record<string, unknown>>, units = { kg: "kg", sheet: "sheet" }): { from: string; to: string; factor: string } | undefined {
  const { gsm, length_mm: lengthMm, width_mm: widthMm } = ext;
  if (typeof gsm !== "string" || typeof lengthMm !== "string" || typeof widthMm !== "string") return undefined;
  return { from: units.kg, to: units.sheet, factor: sheetsPerKg({ gsm, lengthMm, widthMm }).toString() };
}

/** Add the kg → sheet conversion to item seed records that describe a sized sheet (demo data, imports). */
export function withSheetConversions<T extends { ext?: Record<string, unknown>; conversions?: readonly { from: string; to: string; factor: string }[] }>(records: readonly T[]): T[] {
  return records.map((r) => {
    const conversion = r.ext ? kgToSheetConversion(r.ext) : undefined;
    return conversion && !r.conversions?.some((c) => c.from === conversion.from && c.to === conversion.to) ? { ...r, conversions: [...(r.conversions ?? []), conversion] } : r;
  });
}
