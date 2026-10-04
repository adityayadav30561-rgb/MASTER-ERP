/**
 * JSON Schema (TypeBox) contracts for decimals in APIs, events and packages (ADR-0057).
 * Decimals travel as strings: "12345.50".
 */
import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { DECIMAL_PATTERN } from "./decimal.ts";

export const DecimalString = Type.String({
  pattern: DECIMAL_PATTERN,
  maxLength: 40,
  description: "Exact decimal as text, e.g. \"12345.50\". Never a JSON number (ADR-0053).",
  examples: ["12345.50", "-0.125", "0"],
});

export const MoneySchema = Type.Object(
  {
    amount: DecimalString,
    currency: Type.String({ pattern: "^[A-Z]{3}$", description: "ISO 4217 code" }),
  },
  { additionalProperties: false, $id: "Money" },
);

export const QuantitySchema = Type.Object(
  {
    value: DecimalString,
    uom: Type.String({ minLength: 1, maxLength: 16, description: "Unit of measure code (UN/ECE Rec 20 or GST UQC)" }),
  },
  { additionalProperties: false, $id: "Quantity" },
);

export type MoneyJson = Static<typeof MoneySchema>;
export type QuantityJson = Static<typeof QuantitySchema>;
