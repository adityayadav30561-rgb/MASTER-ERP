/**
 * Units of measure and conversions (Step 8 §4.3: quantities stored in the item's base UOM, with the entered
 * UOM and factor kept). Conversion: "1 <from> = factor <to>"; item-specific factors win over general ones.
 */
import { Decimal } from "@master-erp/kernel/decimal";
import type { RoundingMode , Quantity } from "@master-erp/kernel/decimal";
import type { Tx } from "@master-erp/kernel/db";
import { newId } from "@master-erp/kernel/ids";
import { ValidationError } from "@master-erp/kernel/metadata";

export type Dimension = "mass" | "count" | "length" | "area" | "volume" | "time" | "other";

export interface Uom {
  id: string;
  code: string;
  name: string;
  dimension: Dimension;
  decimals: number;
  unece: string | null;
  uqc: string | null;
  active: boolean;
}

export interface UomInput {
  code: string;
  name: string;
  dimension: Dimension;
  decimals?: number;
  unece?: string;
  uqc?: string;
}

export class UomService {
  async create(tx: Tx, input: UomInput): Promise<string> {
    const errors = [];
    if (!/^[a-z0-9_]{1,16}$/.test(input.code)) errors.push({ field: "code", message: "use 1–16 lowercase letters, digits or _" });
    if (!input.name.trim()) errors.push({ field: "name", message: "is required" });
    if ((input.decimals ?? 0) < 0 || (input.decimals ?? 0) > 6) errors.push({ field: "decimals", message: "must be between 0 and 6" });
    if (errors.length) throw new ValidationError(errors);
    if (await this.byCode(tx, input.code)) throw new ValidationError([{ field: "code", message: `"${input.code}" already exists` }]);
    const id = newId();
    await tx
      .insertInto("foundation.uom")
      .values({ id, code: input.code, name: input.name, dimension: input.dimension, decimals: input.decimals ?? 0, unece: input.unece ?? null, uqc: input.uqc ?? null })
      .execute();
    return id;
  }

  async list(tx: Tx): Promise<Uom[]> {
    return (await tx.selectFrom("foundation.uom").select(["id", "code", "name", "dimension", "decimals", "unece", "uqc", "active"]).orderBy("code").execute()) as Uom[];
  }

  async byCode(tx: Tx, code: string): Promise<Uom | undefined> {
    return (await tx.selectFrom("foundation.uom").select(["id", "code", "name", "dimension", "decimals", "unece", "uqc", "active"]).where("code", "=", code).executeTakeFirst()) as Uom | undefined;
  }

  async byId(tx: Tx, id: string): Promise<Uom | undefined> {
    return (await tx.selectFrom("foundation.uom").select(["id", "code", "name", "dimension", "decimals", "unece", "uqc", "active"]).where("id", "=", id).executeTakeFirst()) as Uom | undefined;
  }

  /** Set "1 from = factor to" (general when itemId is absent). Replaces an existing factor. */
  async setConversion(tx: Tx, input: { from: string; to: string; factor: Decimal | string; itemId?: string | undefined }): Promise<void> {
    const [from, to] = [await this.byCode(tx, input.from), await this.byCode(tx, input.to)];
    const errors = [];
    if (!from) errors.push({ field: "from", message: `unknown unit "${input.from}"` });
    if (!to) errors.push({ field: "to", message: `unknown unit "${input.to}"` });
    const factor = Decimal.tryFrom(String(input.factor));
    if (!factor || !factor.greaterThan("0")) errors.push({ field: "factor", message: "must be a positive number" });
    if (from && to && from.id === to.id) errors.push({ field: "to", message: "must differ from the source unit" });
    if (errors.length || !from || !to || !factor) throw new ValidationError(errors);
    const existing = await tx
      .selectFrom("foundation.uom_conversion")
      .select("id")
      .where("from_uom_id", "=", from.id)
      .where("to_uom_id", "=", to.id)
      .where((eb) => (input.itemId ? eb("item_id", "=", input.itemId) : eb("item_id", "is", null)))
      .executeTakeFirst();
    if (existing) await tx.updateTable("foundation.uom_conversion").set({ factor: factor.toString() }).where("id", "=", existing.id).execute();
    else await tx.insertInto("foundation.uom_conversion").values({ id: newId(), from_uom_id: from.id, to_uom_id: to.id, factor: factor.toString(), item_id: input.itemId ?? null }).execute();
  }

  /**
   * Convert a quantity to another unit, rounded to the target unit's decimals.
   * Searches item-specific, then general conversions, in both directions, up to three steps
   * (e.g. ream → sheet → kg for one paper item).
   */
  async convert(tx: Tx, quantity: Quantity, toCode: string, itemId?: string, mode: RoundingMode = "half-up"): Promise<Quantity> {
    if (quantity.uom === toCode) return quantity;
    const target = await this.byCode(tx, toCode);
    if (!target) throw new ValidationError([{ field: "uom", message: `unknown unit "${toCode}"` }]);
    const factor = await this.factor(tx, quantity.uom, toCode, itemId);
    if (!factor) throw new ValidationError([{ field: "uom", message: `no conversion from ${quantity.uom} to ${toCode}${itemId ? " for this item" : ""}` }]);
    return quantity.convert(toCode, factor, target.decimals, mode);
  }

  /** Exact factor so that 1 from = factor to; undefined if no path exists. */
  async factor(tx: Tx, fromCode: string, toCode: string, itemId?: string): Promise<Decimal | undefined> {
    const rows = await tx
      .selectFrom("foundation.uom_conversion as c")
      .innerJoin("foundation.uom as f", "f.id", "c.from_uom_id")
      .innerJoin("foundation.uom as t", "t.id", "c.to_uom_id")
      .select(["f.code as from", "t.code as to", "c.factor", "c.item_id"])
      .where((eb) => (itemId ? eb.or([eb("c.item_id", "is", null), eb("c.item_id", "=", itemId)]) : eb("c.item_id", "is", null)))
      .execute();
    // Edges: item-specific first so they win; each conversion also usable in reverse (exact division to 12 places).
    const edges = new Map<string, { to: string; factor: Decimal }[]>();
    const add = (a: string, b: string, f: Decimal) => {
      const list = edges.get(a) ?? [];
      if (!list.some((e) => e.to === b)) list.push({ to: b, factor: f });
      edges.set(a, list);
    };
    for (const r of [...rows].sort((a, b) => (a.item_id ? 0 : 1) - (b.item_id ? 0 : 1))) {
      const f = Decimal.from(r.factor as string);
      add(r.from as string, r.to as string, f);
      add(r.to as string, r.from as string, Decimal.ONE.dividedBy(f, 12, "half-even"));
    }
    // Breadth-first search, at most three steps.
    let frontier: { code: string; factor: Decimal }[] = [{ code: fromCode, factor: Decimal.ONE }];
    const seen = new Set([fromCode]);
    for (let depth = 0; depth < 3; depth++) {
      const next: { code: string; factor: Decimal }[] = [];
      for (const node of frontier) {
        for (const e of edges.get(node.code) ?? []) {
          if (seen.has(e.to)) continue;
          const f = node.factor.times(e.factor);
          if (e.to === toCode) return f;
          seen.add(e.to);
          next.push({ code: e.to, factor: f });
        }
      }
      frontier = next;
    }
    return undefined;
  }
}
