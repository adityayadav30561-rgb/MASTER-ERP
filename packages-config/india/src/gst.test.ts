import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Money } from "@master-erp/kernel/decimal";
import { computeInvoice, supplyType } from "./index.ts";

describe("GST invoice computation", () => {
  it("decides intra- or inter-state from the place of supply", () => {
    expect(supplyType("27AAPFU0939F1ZV", "27")).toBe("intra-state");
    expect(supplyType("27AAPFU0939F1ZV", "24")).toBe("inter-state");
  });

  it("rounds CGST/SGST per line and the total to the rupee", () => {
    const inv = computeInvoice([{ description: "Mono carton", hsn: "48191010", quantity: "5000", rate: "3.4567", gstRate: "18" }], "intra-state");
    expect([inv.taxable, inv.cgst, inv.sgst, inv.roundOff, inv.grandTotal].map(String)).toEqual(["17283.50", "1555.52", "1555.52", "0.46", "20395.00"]);
  });

  it("property: totals reconcile and round-off stays within ±0.50", () => {
    const line = fc.record({
      description: fc.constant("x"),
      hsn: fc.constant("4819"),
      quantity: fc.bigInt({ min: 1n, max: 100_000n }).map(String),
      rate: fc.bigInt({ min: 1n, max: 9_999_999n }).map((p) => `${p / 100n}.${(p % 100n).toString().padStart(2, "0")}`),
      gstRate: fc.constantFrom("0", "0.25", "3", "5", "12", "18", "28", "40"),
    });
    fc.assert(
      fc.property(fc.array(line, { minLength: 1, maxLength: 25 }), fc.constantFrom("intra-state" as const, "inter-state" as const), (lines, supply) => {
        const inv = computeInvoice(lines, supply);
        const parts = inv.taxable.plus(inv.cgst).plus(inv.sgst).plus(inv.igst);
        return Money.sum(inv.lines.map((l) => l.total), "INR").equals(parts) && parts.plus(inv.roundOff).equals(inv.grandTotal) && inv.roundOff.amount.abs().compare("0.50") <= 0;
      }),
      { numRuns: 500 },
    );
  });
});
