/**
 * Item core (Step 3 §6): code, name, category, type, base UOM, HSN/SAC, tax category and the attribute set
 * (extension fields such as GSM, chosen by category through the industry package). Module facets come later.
 */
import { sql } from "kysely";
import type { Tx } from "@master-erp/kernel/db";
import { newId } from "@master-erp/kernel/ids";
import { NotFoundError, ValidationError } from "@master-erp/kernel/metadata";
import type { FieldError } from "@master-erp/kernel/metadata";
import type { EffectiveConfiguration } from "@master-erp/kernel/config";
import { clampLimit, decodeCursor, encodeCursor, mergeRules, requireText } from "./common.ts";
import type { LocalizationRules, Page } from "./common.ts";
import { UomService } from "./uom.ts";

export type ItemType = "stock" | "non_stock" | "service";
export type ItemStatus = "active" | "blocked" | "archived";

export interface ItemCategoryInput {
  code: string;
  name: string;
  parentCode?: string;
  itemType?: ItemType;
  defaultUom?: string;
  defaultTaxCategory?: string;
  defaultHsnSac?: string;
}

export interface ItemInput {
  code?: string;
  name: string;
  description?: string;
  category: string; // category code
  itemType?: ItemType; // default: the category's
  baseUom?: string; // default: the category's
  hsnSac?: string;
  taxCategory?: string; // code; default: the category's
  ownerPartyId?: string; // customer-specific product (ADR-0018)
  ext?: Record<string, unknown>;
  /** Item-specific conversions, e.g. 1 kg = 6.8 sheet for one board. */
  conversions?: readonly { from: string; to: string; factor: string }[];
}

export interface Item {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  itemType: ItemType;
  baseUom: string;
  hsnSac: string | null;
  taxCategory: string | null;
  ownerPartyId: string | null;
  status: ItemStatus;
  ext: Record<string, unknown>;
  computed: Record<string, unknown>;
  conversions: { from: string; to: string; factor: string }[];
  version: number;
}

export interface ItemSummary {
  id: string;
  code: string;
  name: string;
  category: string;
  baseUom: string;
  hsnSac: string | null;
  status: ItemStatus;
}

interface Resolved {
  category: { id: string; code: string; item_type: string; default_uom_id: string | null; default_tax_category_id: string | null; default_hsn_sac: string | null } | undefined;
  uom: { id: string; code: string } | undefined;
  taxCategoryId: string | null;
  itemType: ItemType;
  hsnSac: string | null;
}

export class ItemService {
  readonly #rules: ReturnType<typeof mergeRules>;
  readonly #config: EffectiveConfiguration | undefined;
  readonly #uoms = new UomService();

  constructor(options: { rules?: readonly LocalizationRules[]; config?: EffectiveConfiguration } = {}) {
    this.#rules = mergeRules(options.rules ?? []);
    this.#config = options.config;
  }

  /* ---------- categories ---------- */

  async createCategory(tx: Tx, input: ItemCategoryInput): Promise<string> {
    const errors: FieldError[] = [];
    if (!/^[a-z0-9_]{1,30}$/.test(input.code)) errors.push({ field: "code", message: "use lowercase letters, digits or _" });
    requireText(errors, "name", input.name, 80);
    const ref = async (table: string, code: string | undefined, field: string) => {
      if (!code) return null;
      const r = await tx.selectFrom(table).select("id").where("code", "=", code).executeTakeFirst();
      if (!r) errors.push({ field, message: `unknown "${code}"` });
      return (r?.id as string | undefined) ?? null;
    };
    const parentId = await ref("foundation.item_category", input.parentCode, "parentCode");
    const uomId = await ref("foundation.uom", input.defaultUom, "defaultUom");
    const taxId = await ref("foundation.tax_category", input.defaultTaxCategory, "defaultTaxCategory");
    if (await tx.selectFrom("foundation.item_category").select("id").where("code", "=", input.code).executeTakeFirst()) errors.push({ field: "code", message: `"${input.code}" already exists` });
    if (errors.length) throw new ValidationError(errors);
    const id = newId();
    await tx
      .insertInto("foundation.item_category")
      .values({ id, code: input.code, name: input.name, parent_id: parentId, item_type: input.itemType ?? "stock", default_uom_id: uomId, default_tax_category_id: taxId, default_hsn_sac: input.defaultHsnSac ?? null })
      .execute();
    return id;
  }

  async listCategories(tx: Tx): Promise<{ id: string; code: string; name: string; itemType: ItemType; defaultUom: string | null }[]> {
    const rows = await tx
      .selectFrom("foundation.item_category as c")
      .leftJoin("foundation.uom as u", "u.id", "c.default_uom_id")
      .select(["c.id", "c.code", "c.name", "c.item_type", "u.code as uom"])
      .where("c.active", "=", true)
      .orderBy("c.name")
      .execute();
    return rows.map((r) => ({ id: r.id as string, code: r.code as string, name: r.name as string, itemType: r.item_type as ItemType, defaultUom: (r.uom as string | null) ?? null }));
  }

  /* ---------- items ---------- */

  async #resolve(tx: Tx, input: ItemInput, errors: FieldError[]): Promise<Resolved> {
    const category = (await tx.selectFrom("foundation.item_category").selectAll().where("code", "=", input.category).executeTakeFirst()) as Resolved["category"];
    if (!category) errors.push({ field: "category", message: `unknown category "${input.category}"` });
    const uomCode = input.baseUom ?? (category?.default_uom_id ? (await this.#uoms.byId(tx, category.default_uom_id as string))?.code : undefined);
    const uom = uomCode ? await this.#uoms.byCode(tx, uomCode) : undefined;
    if (!uom) errors.push({ field: "baseUom", message: uomCode ? `unknown unit "${uomCode}"` : "is required" });
    let taxCategoryId = (category?.default_tax_category_id as string | null) ?? null;
    if (input.taxCategory) {
      const t = await tx.selectFrom("foundation.tax_category").select("id").where("code", "=", input.taxCategory).executeTakeFirst();
      if (!t) errors.push({ field: "taxCategory", message: `unknown tax category "${input.taxCategory}"` });
      taxCategoryId = (t?.id as string | undefined) ?? null;
    }
    if (input.ownerPartyId) {
      const p = await tx.selectFrom("foundation.party").select("id").where("id", "=", input.ownerPartyId).executeTakeFirst();
      if (!p) errors.push({ field: "ownerPartyId", message: "unknown customer" });
    }
    const itemType = input.itemType ?? (category?.item_type as ItemType | undefined) ?? "stock";
    const hsnSac = input.hsnSac?.trim() || (category?.default_hsn_sac as string | null) || null;
    return { category, uom, taxCategoryId, itemType, hsnSac };
  }

  async validate(tx: Tx, input: ItemInput): Promise<{ errors: FieldError[]; resolved: Resolved }> {
    const errors: FieldError[] = [];
    requireText(errors, "name", input.name);
    if (input.code !== undefined && !/^[A-Z0-9][A-Z0-9._/-]{0,39}$/.test(input.code)) errors.push({ field: "code", message: "use up to 40 capital letters, digits, . / - or _" });
    const resolved = await this.#resolve(tx, input, errors);
    if (this.#rules.validateHsnSac) {
      const m = this.#rules.validateHsnSac(resolved.hsnSac, resolved.itemType);
      if (m) errors.push({ field: "hsnSac", message: m });
    }
    if (this.#config && resolved.category) {
      const extErrors = this.#config.validator("foundation.item").validate(input.ext ?? {}, { category: resolved.category.code, item_type: resolved.itemType });
      errors.push(...extErrors.map((e) => ({ field: `ext.${e.field}`, message: e.message })));
    } else if (!this.#config && input.ext && Object.keys(input.ext).length) {
      errors.push({ field: "ext", message: "no extension fields are configured" });
    }
    return { errors, resolved };
  }

  async create(tx: Tx, input: ItemInput): Promise<Item> {
    const { errors, resolved } = await this.validate(tx, input);
    if (input.code && (await tx.selectFrom("foundation.item").select("id").where("code", "=", input.code).executeTakeFirst())) {
      errors.push({ field: "code", message: `"${input.code}" is already used` });
    }
    if (errors.length || !resolved.category || !resolved.uom) throw new ValidationError(errors);
    const id = newId();
    const code = input.code ?? (await this.#nextCode(tx, resolved.category.code as string));
    await tx
      .insertInto("foundation.item")
      .values({
        id, code, name: input.name.trim(), description: input.description ?? null, category_id: resolved.category.id, item_type: resolved.itemType,
        base_uom_id: resolved.uom.id, hsn_sac: resolved.hsnSac, tax_category_id: resolved.taxCategoryId, owner_party_id: input.ownerPartyId ?? null,
        ext: JSON.stringify(input.ext ?? {}),
      })
      .execute();
    for (const c of input.conversions ?? []) await this.#uoms.setConversion(tx, { ...c, itemId: id });
    return this.get(tx, id);
  }

  async update(tx: Tx, id: string, expectedVersion: number, input: ItemInput): Promise<Item> {
    const { errors, resolved } = await this.validate(tx, input);
    if (errors.length || !resolved.category || !resolved.uom) throw new ValidationError(errors);
    const r = await tx
      .updateTable("foundation.item")
      .set({
        name: input.name.trim(), description: input.description ?? null, category_id: resolved.category.id, item_type: resolved.itemType,
        base_uom_id: resolved.uom.id, hsn_sac: resolved.hsnSac, tax_category_id: resolved.taxCategoryId, owner_party_id: input.ownerPartyId ?? null,
        ext: JSON.stringify(input.ext ?? {}),
      })
      .where("id", "=", id)
      .where("version", "=", expectedVersion)
      .executeTakeFirst();
    if (r.numUpdatedRows !== 1n) throw new ValidationError([{ field: "version", message: "the item was changed by someone else — reload and try again" }]);
    for (const c of input.conversions ?? []) await this.#uoms.setConversion(tx, { ...c, itemId: id });
    return this.get(tx, id);
  }

  /** Category code + running number: BOARD-0001. */
  async #nextCode(tx: Tx, categoryCode: string): Promise<string> {
    const prefix = categoryCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
    const r = await sql<{ n: string | null }>`select max(substring(code from ${`^${prefix}-(\\d+)$`})::int)::text as n from foundation.item where code ~ ${`^${prefix}-\\d+$`}`.execute(tx);
    return `${prefix}-${String(Number(r.rows[0]?.n ?? "0") + 1).padStart(4, "0")}`;
  }

  async get(tx: Tx, id: string): Promise<Item> {
    const i = await tx
      .selectFrom("foundation.item as i")
      .innerJoin("foundation.item_category as c", "c.id", "i.category_id")
      .innerJoin("foundation.uom as u", "u.id", "i.base_uom_id")
      .leftJoin("foundation.tax_category as t", "t.id", "i.tax_category_id")
      .select(["i.id", "i.code", "i.name", "i.description", "c.code as category", "i.item_type", "u.code as uom", "i.hsn_sac", "t.code as tax", "i.owner_party_id", "i.status", "i.ext", "i.version"])
      .where("i.id", "=", id)
      .executeTakeFirst();
    if (!i) throw new NotFoundError("Item not found");
    const conversions = await tx
      .selectFrom("foundation.uom_conversion as c")
      .innerJoin("foundation.uom as f", "f.id", "c.from_uom_id")
      .innerJoin("foundation.uom as t", "t.id", "c.to_uom_id")
      .select(["f.code as from", "t.code as to", "c.factor"])
      .where("c.item_id", "=", id)
      .execute();
    const ext = i.ext as Record<string, unknown>;
    return {
      id: i.id as string, code: i.code as string, name: i.name as string, description: (i.description as string | null) ?? null, category: i.category as string,
      itemType: i.item_type as ItemType, baseUom: i.uom as string, hsnSac: (i.hsn_sac as string | null) ?? null, taxCategory: (i.tax as string | null) ?? null,
      ownerPartyId: (i.owner_party_id as string | null) ?? null, status: i.status as ItemStatus, ext,
      computed: this.#config ? this.#config.validator("foundation.item").computed(ext, { category: i.category, item_type: i.item_type }) : {},
      conversions: conversions.map((c) => ({ from: c.from as string, to: c.to as string, factor: c.factor as string })),
      version: i.version as number,
    };
  }

  async findByCode(tx: Tx, code: string): Promise<string | undefined> {
    return (await tx.selectFrom("foundation.item").select("id").where("code", "=", code).executeTakeFirst())?.id as string | undefined;
  }

  async list(tx: Tx, q: { search?: string; category?: string; status?: ItemStatus; limit?: number; cursor?: string } = {}): Promise<Page<ItemSummary>> {
    const limit = clampLimit(q.limit);
    let query = tx
      .selectFrom("foundation.item as i")
      .innerJoin("foundation.item_category as c", "c.id", "i.category_id")
      .innerJoin("foundation.uom as u", "u.id", "i.base_uom_id")
      .select(["i.id", "i.code", "i.name", "c.code as category", "u.code as uom", "i.hsn_sac", "i.status", sql<string>`lower(i.name)`.as("sort_key")])
      .where("i.status", "=", q.status ?? "active");
    if (q.category) query = query.where("c.code", "=", q.category);
    if (q.search?.trim()) {
      const s = `%${q.search.trim().toLowerCase()}%`;
      query = query.where((eb) => eb.or([eb(sql`lower(i.name)`, "like", s), eb(sql`lower(i.code)`, "like", s), eb("i.hsn_sac", "=", q.search?.trim() ?? "")]));
    }
    const after = decodeCursor(q.cursor);
    if (after) query = query.where(sql<boolean>`(lower(i.name), i.id) > (${after[0]}, ${after[1]}::uuid)`);
    const rows = await query.orderBy(sql`lower(i.name)`).orderBy("i.id").limit(limit + 1).execute();
    const items = rows.slice(0, limit).map((r) => ({
      id: r.id as string, code: r.code as string, name: r.name as string, category: r.category as string, baseUom: r.uom as string,
      hsnSac: (r.hsn_sac as string | null) ?? null, status: r.status as ItemStatus,
    }));
    const last = rows.length > limit ? rows[limit - 1] : undefined;
    return { items, nextCursor: last ? encodeCursor(last.sort_key as string, last.id as string) : null };
  }

  async setStatus(tx: Tx, id: string, status: ItemStatus): Promise<void> {
    const r = await tx.updateTable("foundation.item").set({ status }).where("id", "=", id).executeTakeFirst();
    if (r.numUpdatedRows !== 1n) throw new NotFoundError("Item not found");
  }
}
