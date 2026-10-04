/**
 * GST tax calculation for one invoice — spike version.
 * Rules (CGST Act 2017 / IGST Act 2017, Rule 46 tax-invoice contents; common practice):
 * - line taxable value = quantity × rate − discount, rounded to paise (half-up)
 * - intra-state supply: CGST and SGST each at half the rate, each rounded to paise per line
 * - inter-state supply: IGST at the full rate, rounded to paise per line
 * - invoice total rounded to the nearest rupee; the difference is shown as "round-off"
 * Rounding mode and level (line vs invoice) become India-pack settings in Slice 3.
 */
import { Decimal, Money, Percent } from "@master-erp/kernel/decimal";

export type SupplyType = "intra-state" | "inter-state";

export interface InvoiceLineInput {
  description: string;
  hsn: string;
  quantity: string;
  rate: string; // price per unit
  discount?: string;
  gstRate: string; // e.g. "18"
}

export interface TaxedLine {
  description: string;
  hsn: string;
  taxable: Money;
  cgst: Money;
  sgst: Money;
  igst: Money;
  total: Money;
}

export interface TaxedInvoice {
  lines: TaxedLine[];
  taxable: Money;
  cgst: Money;
  sgst: Money;
  igst: Money;
  roundOff: Money;
  grandTotal: Money;
}

export function computeInvoice(lines: readonly InvoiceLineInput[], supply: SupplyType, currency = "INR"): TaxedInvoice {
  const taxed = lines.map((line): TaxedLine => {
    const gross = Money.of(line.rate, currency).times(Decimal.from(line.quantity));
    const taxable = gross.minus(Money.of(line.discount ?? "0", currency)).round("half-up");
    const rate = Percent.of(line.gstRate);
    const zero = Money.zero(currency);
    const cgst = supply === "intra-state" ? rate.half().of(taxable).round("half-up") : zero;
    const sgst = supply === "intra-state" ? rate.half().of(taxable).round("half-up") : zero;
    const igst = supply === "inter-state" ? rate.of(taxable).round("half-up") : zero;
    return { description: line.description, hsn: line.hsn, taxable, cgst, sgst, igst, total: taxable.plus(cgst).plus(sgst).plus(igst) };
  });
  const sum = (pick: (l: TaxedLine) => Money) => Money.sum(taxed.map(pick), currency);
  const exactTotal = sum((l) => l.total);
  const grandTotal = exactTotal.round("half-up", 0);
  return {
    lines: taxed,
    taxable: sum((l) => l.taxable),
    cgst: sum((l) => l.cgst),
    sgst: sum((l) => l.sgst),
    igst: sum((l) => l.igst),
    roundOff: grandTotal.minus(exactTotal),
    grandTotal,
  };
}
