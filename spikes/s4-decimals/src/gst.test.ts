import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Money } from "@master-erp/kernel/decimal";
import { computeInvoice } from "./gst.ts";

const strings = (inv: ReturnType<typeof computeInvoice>) => ({
  taxable: inv.taxable.toString(),
  cgst: inv.cgst.toString(),
  sgst: inv.sgst.toString(),
  igst: inv.igst.toString(),
  roundOff: inv.roundOff.toString(),
  grandTotal: inv.grandTotal.toString(),
});

describe("GST invoice rounding (spike S4)", () => {
  it("printing job: 5,000 cartons at ₹3.4567 with 18% GST, intra-state", () => {
    const inv = computeInvoice([{ description: "Mono carton 3-ply", hsn: "48191010", quantity: "5000", rate: "3.4567", gstRate: "18" }], "intra-state");
    expect(strings(inv)).toEqual({
      taxable: "17283.50",
      cgst: "1555.52", // 9% of 17283.50 = 1555.515 → half-up
      sgst: "1555.52",
      igst: "0.00",
      roundOff: "0.46", // 20394.54 → 20395
      grandTotal: "20395.00",
    });
  });

  it("same job inter-state: IGST at the full rate can differ by a paisa from CGST+SGST", () => {
    const inv = computeInvoice([{ description: "Mono carton 3-ply", hsn: "48191010", quantity: "5000", rate: "3.4567", gstRate: "18" }], "inter-state");
    expect(inv.igst.toString()).toBe("3111.03"); // 18% of 17283.50 = 3111.03 exactly
    expect(inv.grandTotal.toString()).toBe("20395.00"); // 20394.53 → 20395
  });

  it("several lines with discount and mixed rates", () => {
    const inv = computeInvoice(
      [
        { description: "Offset printing", hsn: "998912", quantity: "1", rate: "12500", discount: "500", gstRate: "18" },
        { description: "Paper board 300 gsm", hsn: "48109200", quantity: "630.5", rate: "92.75", gstRate: "12" },
      ],
      "intra-state",
    );
    expect(strings(inv)).toEqual({
      taxable: "70478.88", // 12000.00 + 58478.875 → 58478.88
      cgst: "4588.73", // 1080.00 + 3508.73 (6% of 58478.88 = 3508.7328)
      sgst: "4588.73",
      igst: "0.00",
      roundOff: "-0.34",
      grandTotal: "79656.00",
    });
  });

  it("a credit note mirrors the invoice exactly (negative amounts round symmetrically)", () => {
    const line = { description: "Return", hsn: "48191010", quantity: "-5000", rate: "3.4567", gstRate: "18" };
    const credit = computeInvoice([line], "intra-state");
    const invoice = computeInvoice([{ ...line, quantity: "5000" }], "intra-state");
    expect(credit.grandTotal.equals(invoice.grandTotal.negated())).toBe(true);
    expect(credit.cgst.equals(invoice.cgst.negated())).toBe(true);
  });

  it("property: totals always reconcile to the paisa and round-off stays within ±0.50", () => {
    const line = fc.record({
      description: fc.constant("x"),
      hsn: fc.constant("4819"),
      quantity: fc.bigInt({ min: 1n, max: 100_000n }).map(String),
      rate: fc.bigInt({ min: 1n, max: 99_999_999n }).map((p) => (Number(p % 1000n) === 0 ? `${p / 10000n}` : `${p / 10000n}.${(p % 10000n).toString().padStart(4, "0")}`)),
      gstRate: fc.constantFrom("0", "0.25", "3", "5", "12", "18", "28"),
    });
    fc.assert(
      fc.property(fc.array(line, { minLength: 1, maxLength: 30 }), fc.constantFrom("intra-state" as const, "inter-state" as const), (lines, supply) => {
        const inv = computeInvoice(lines, supply);
        const lineSum = Money.sum(inv.lines.map((l) => l.total), "INR");
        const parts = inv.taxable.plus(inv.cgst).plus(inv.sgst).plus(inv.igst);
        return (
          lineSum.equals(parts) &&
          parts.plus(inv.roundOff).equals(inv.grandTotal) &&
          inv.roundOff.amount.abs().compare("0.50") <= 0 &&
          inv.lines.every((l) => l.taxable.isRounded() && l.cgst.equals(l.sgst))
        );
      }),
      { numRuns: 1000 },
    );
  });
});
