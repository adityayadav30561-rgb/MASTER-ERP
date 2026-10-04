import { describe, expect, it } from "vitest";
import { ExtensionValidator, FieldDefinitionError } from "./index.ts";
import type { FieldDefinition } from "./index.ts";

/** Printing package fields on Item (Step 5 §6.1 example). */
const itemFields: FieldDefinition[] = [
  { key: "gsm", label: { en: "GSM", hi: "जीएसएम" }, type: "decimal", precision: 6, scale: 1, min: "30", max: "600",
    appliesWhen: "record.category in ['paper', 'board']", required: "record.category == 'board'" },
  { key: "grain", label: { en: "Grain direction" }, type: "picklist", values: ["long", "short"] },
  { key: "sheet_size", label: { en: "Sheet size" }, type: "text", pattern: "^\\d{2,4}x\\d{2,4}$" },
  { key: "last_purchase_rate", label: { en: "Last purchase rate" }, type: "money", fieldGroup: "purchase_price" },
  { key: "sheets_per_kg", label: { en: "Sheets per kg" }, type: "computed", expression: "has(record.gsm) ? decimal('1000') : decimal('0')" },
  { key: "finishes", label: { en: "Finishes" }, type: "multi_picklist", values: ["matt", "gloss", "uv"],
    validation: { condition: "!('matt' in value && 'gloss' in value)", message: "cannot be both matt and gloss" } },
];

describe("K5 extension fields", () => {
  const v = new ExtensionValidator("foundation.item", itemFields);

  it("accepts valid values", () => {
    expect(v.validate({ gsm: "300", grain: "long", sheet_size: "700x1000", last_purchase_rate: { amount: "92.75", currency: "INR" } }, { category: "board" })).toEqual([]);
  });

  it("explains every problem in plain words", () => {
    expect(v.validate({ gsm: "1000.25", grain: "diagonal" }, { category: "board" })).toEqual([{ field: "grain", message: "is not one of the allowed values" }]);
    expect(v.validate({ gsm: "1000.25" }, { category: "board" })).toEqual([
      { field: "gsm", message: "allows at most 1 decimals" },
      { field: "gsm", message: "must be at most 600" },
    ]);
    expect(v.validate({}, { category: "board" })).toEqual([{ field: "gsm", message: "is required" }]);
    expect(v.validate({ gsm: "300" }, { category: "ink" })).toEqual([{ field: "gsm", message: "does not apply to this record" }]);
    expect(v.validate({ colour: "red" })).toEqual([{ field: "colour", message: "is not a known field" }]);
    expect(v.validate({ last_purchase_rate: { amount: 92.75, currency: "INR" } })[0]?.field).toBe("last_purchase_rate");
    expect(v.validate({ finishes: ["matt", "gloss"] }, { category: "ink" })).toEqual([{ field: "finishes", message: "cannot be both matt and gloss" }]);
    expect(v.validate({ sheets_per_kg: "5" }, { category: "ink" })).toEqual([{ field: "sheets_per_kg", message: "is computed and cannot be entered" }]);
  });

  it("computes read-only fields and maps field groups", () => {
    expect(v.computed({ gsm: "300" }, { category: "board" })).toEqual({ sheets_per_kg: "1000" });
    expect(v.fieldGroups()).toEqual({ last_purchase_rate: "purchase_price" });
  });

  it("rejects broken definitions when the package is loaded", () => {
    expect(() => new ExtensionValidator("x.y", [{ key: "GSM", label: { en: "GSM" }, type: "text" }])).toThrow(FieldDefinitionError);
    expect(() => new ExtensionValidator("x.y", [{ key: "a", label: { en: "A" }, type: "picklist" }])).toThrow(/needs values/);
    expect(() => new ExtensionValidator("x.y", [{ key: "a", label: { en: "A" }, type: "text", appliesWhen: "record.category ==" }])).toThrow(/rule/);
  });
});
