/**
 * GST on one invoice (moved from spike S4). Rules (CGST/IGST Acts 2017, CGST Rule 46; common practice):
 * - line taxable value = quantity × rate − discount, rounded to paise (half-up)
 * - intra-state: CGST and SGST each at half the rate, each rounded per line; inter-state: IGST at the full rate
 * - invoice total rounded to the nearest rupee; the difference is shown as round-off
 * Place of supply decides intra/inter-state: supplier state = place-of-supply state → intra-state.
 */
import { Decimal, Money, Percent } from "@master-erp/kernel/decimal";

export type SupplyType = "intra-state" | "inter-state";

export function supplyType(supplierGstin: string, placeOfSupplyGstCode: string): SupplyType {
  return supplierGstin.slice(0, 2) === placeOfSupplyGstCode ? "intra-state" : "inter-state";
}

export interface InvoiceLineInput {
  description: string;
  hsn: string;
  quantity: string;
  rate: string;
  discount?: string;
  gstRate: string;
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
  return { lines: taxed, taxable: sum((l) => l.taxable), cgst: sum((l) => l.cgst), sgst: sum((l) => l.sgst), igst: sum((l) => l.igst), roundOff: grandTotal.minus(exactTotal), grandTotal };
}
