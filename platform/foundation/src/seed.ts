/**
 * Seed data from packages (Step 5A §2.2 seed-data / demo-data): applied once when a tenant is created,
 * idempotent (existing codes are left alone), so re-applying a package never duplicates or overwrites
 * what the business has since changed. Master data is the business's after seeding (Step 5 §3).
 */
import type { Tx } from "@master-erp/kernel/db";
import { ValidationError } from "@master-erp/kernel/metadata";
import type { EffectiveConfiguration } from "@master-erp/kernel/config";
import type { LocalizationRules } from "./common.ts";
import { ItemService } from "./item.ts";
import type { ItemCategoryInput, ItemInput } from "./item.ts";
import { PartyService } from "./party.ts";
import type { PartyInput } from "./party.ts";
import { TaxService } from "./tax.ts";
import { UomService } from "./uom.ts";
import type { UomInput } from "./uom.ts";

/** Seed kinds the foundation understands, in the order they must be applied. */
export const FOUNDATION_SEED_ORDER = [
  "foundation.uom",
  "foundation.uom_uqc",
  "foundation.uom_conversion",
  "foundation.tax_category",
  "foundation.item_category",
  "foundation.party",
  "foundation.item",
] as const;

export interface SeedReport {
  created: Record<string, number>;
  skipped: Record<string, number>;
}

export class FoundationSeeder {
  readonly #uom = new UomService();
  readonly #tax = new TaxService();
  readonly #items: ItemService;
  readonly #parties: PartyService;

  constructor(options: { rules?: readonly LocalizationRules[]; config?: EffectiveConfiguration } = {}) {
    this.#items = new ItemService(options);
    this.#parties = new PartyService(options);
  }

  async apply(tx: Tx, seed: Readonly<Record<string, readonly unknown[]>>): Promise<SeedReport> {
    const report: SeedReport = { created: {}, skipped: {} };
    const count = (kind: string, created: boolean) => {
      const bucket = created ? report.created : report.skipped;
      bucket[kind] = (bucket[kind] ?? 0) + 1;
    };
    for (const kind of FOUNDATION_SEED_ORDER) {
      for (const [i, record] of (seed[kind] ?? []).entries()) {
        try {
          count(kind, await this.#applyOne(tx, kind, record));
        } catch (error) {
          if (error instanceof ValidationError) throw new ValidationError(error.errors.map((e) => ({ field: `${kind}[${i}].${e.field}`, message: e.message })));
          throw error;
        }
      }
    }
    return report;
  }

  async #applyOne(tx: Tx, kind: (typeof FOUNDATION_SEED_ORDER)[number], record: unknown): Promise<boolean> {
    switch (kind) {
      case "foundation.uom": {
        const r = record as UomInput;
        if (await this.#uom.byCode(tx, r.code)) return false;
        await this.#uom.create(tx, r);
        return true;
      }
      case "foundation.uom_uqc": {
        // A localization pack's statutory unit code (e.g. GST UQC) for a unit, if the unit exists and has none yet.
        const r = record as { uom: string; uqc: string };
        const u = await tx.updateTable("foundation.uom").set({ uqc: r.uqc }).where("code", "=", r.uom).where("uqc", "is", null).executeTakeFirst();
        return u.numUpdatedRows === 1n;
      }
      case "foundation.uom_conversion": {
        const r = record as { from: string; to: string; factor: string };
        if (await this.#uom.factor(tx, r.from, r.to)) return false;
        await this.#uom.setConversion(tx, r);
        return true;
      }
      case "foundation.tax_category": {
        const r = record as { code: string; name: string; rates?: { taxType: string; rate: string; validFrom: string }[] };
        if (await tx.selectFrom("foundation.tax_category").select("id").where("code", "=", r.code).executeTakeFirst()) return false;
        await this.#tax.createCategory(tx, r);
        return true;
      }
      case "foundation.item_category": {
        const r = record as ItemCategoryInput;
        if (await tx.selectFrom("foundation.item_category").select("id").where("code", "=", r.code).executeTakeFirst()) return false;
        await this.#items.createCategory(tx, r);
        return true;
      }
      case "foundation.party": {
        const r = record as PartyInput & { code: string };
        if (await this.#parties.findByCode(tx, r.code)) return false;
        await this.#parties.create(tx, r);
        return true;
      }
      case "foundation.item": {
        const r = record as ItemInput & { code: string; ownerPartyCode?: string };
        if (await this.#items.findByCode(tx, r.code)) return false;
        const { ownerPartyCode, ...rest } = r;
        const ownerPartyId = ownerPartyCode ? await this.#parties.findByCode(tx, ownerPartyCode) : undefined;
        await this.#items.create(tx, { ...rest, ...(ownerPartyId ? { ownerPartyId } : {}) });
        return true;
      }
    }
  }
}

/**
 * Platform defaults (the lowest configuration layer): units every business uses, with UN/ECE Rec 20 codes.
 * Industry packages add their own (sheet, ream, reel …); localization packs map statutory codes (UQC).
 */
export const FOUNDATION_DEFAULT_SEED: Readonly<Record<string, readonly unknown[]>> = {
  "foundation.uom": [
    { code: "kg", name: "Kilogram", dimension: "mass", decimals: 3, unece: "KGM" },
    { code: "g", name: "Gram", dimension: "mass", decimals: 2, unece: "GRM" },
    { code: "tonne", name: "Tonne", dimension: "mass", decimals: 3, unece: "TNE" },
    { code: "nos", name: "Number", dimension: "count", decimals: 0, unece: "H87" },
    { code: "pcs", name: "Piece", dimension: "count", decimals: 0, unece: "H87" },
    { code: "m", name: "Metre", dimension: "length", decimals: 3, unece: "MTR" },
    { code: "mm", name: "Millimetre", dimension: "length", decimals: 1, unece: "MMT" },
    { code: "sqm", name: "Square metre", dimension: "area", decimals: 3, unece: "MTK" },
    { code: "l", name: "Litre", dimension: "volume", decimals: 3, unece: "LTR" },
    { code: "ml", name: "Millilitre", dimension: "volume", decimals: 0, unece: "MLT" },
    { code: "box", name: "Box", dimension: "count", decimals: 0, unece: "BX" },
    { code: "set", name: "Set", dimension: "count", decimals: 0, unece: "SET" },
    { code: "pack", name: "Pack", dimension: "count", decimals: 0, unece: "PK" },
    { code: "roll", name: "Roll", dimension: "count", decimals: 0, unece: "RO" },
    { code: "dozen", name: "Dozen", dimension: "count", decimals: 0, unece: "DZN" },
    { code: "hour", name: "Hour", dimension: "time", decimals: 2, unece: "HUR" },
  ],
  "foundation.uom_conversion": [
    { from: "tonne", to: "kg", factor: "1000" },
    { from: "kg", to: "g", factor: "1000" },
    { from: "m", to: "mm", factor: "1000" },
    { from: "l", to: "ml", factor: "1000" },
    { from: "dozen", to: "nos", factor: "12" },
  ],
};
