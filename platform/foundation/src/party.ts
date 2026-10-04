/**
 * Party (ADR-0013): one master for customers, vendors, transporters and job workers, with tax identifiers,
 * addresses and contacts. Country rules (GSTIN, PAN) come from localization packs through LocalizationRules.
 * Masters are never deleted: they are blocked or archived (Step 8 §4.3).
 */
import { sql } from "kysely";
import type { Tx } from "@master-erp/kernel/db";
import { newId } from "@master-erp/kernel/ids";
import { ValidationError } from "@master-erp/kernel/metadata";
import type { FieldError } from "@master-erp/kernel/metadata";
import type { EffectiveConfiguration } from "@master-erp/kernel/config";
import { clampLimit, decodeCursor, EMAIL, encodeCursor, generateCode, mergeRules, normalizePhone, requireText } from "./common.ts";
import type { LocalizationRules, Page } from "./common.ts";

export const PARTY_ROLES = ["customer", "vendor", "transporter", "job_worker"] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];
export type PartyStatus = "active" | "blocked" | "archived";

export interface AddressInput {
  /** Optional local key so a tax identifier can point to this address ("works"). */
  key?: string;
  kind: "registered" | "billing" | "shipping" | "works";
  label?: string;
  line1: string;
  line2?: string;
  city: string;
  district?: string;
  regionCode: string; // ISO 3166-2, e.g. "IN-MH"
  postalCode?: string;
  country?: string; // ISO 3166-1 alpha-2, default "IN"
  isDefault?: boolean;
}

export interface TaxIdInput {
  scheme: string; // "pan", "gstin", …
  value: string;
  addressKey?: string;
  isPrimary?: boolean;
}

export interface ContactInput {
  name: string;
  designation?: string;
  phone?: string;
  email?: string;
  isPrimary?: boolean;
}

export interface PartyInput {
  code?: string;
  name: string;
  legalName?: string;
  kind?: "organisation" | "individual";
  roles: readonly PartyRole[];
  defaultCurrency?: string;
  taxIds?: readonly TaxIdInput[];
  addresses?: readonly AddressInput[];
  contacts?: readonly ContactInput[];
  ext?: Record<string, unknown>;
}

export interface Party {
  id: string;
  code: string;
  name: string;
  legalName: string | null;
  kind: "organisation" | "individual";
  status: PartyStatus;
  defaultCurrency: string;
  roles: PartyRole[];
  taxIds: { id: string; scheme: string; value: string; regionCode: string | null; addressId: string | null; isPrimary: boolean }[];
  addresses: (Omit<AddressInput, "key"> & { id: string })[];
  contacts: (ContactInput & { id: string })[];
  ext: Record<string, unknown>;
  version: number;
}

export interface PartySummary {
  id: string;
  code: string;
  name: string;
  status: PartyStatus;
  roles: PartyRole[];
  gstins: string[];
  city: string | null;
}

export class PartyService {
  readonly #rules: ReturnType<typeof mergeRules>;
  readonly #config: EffectiveConfiguration | undefined;

  constructor(options: { rules?: readonly LocalizationRules[]; config?: EffectiveConfiguration } = {}) {
    this.#rules = mergeRules(options.rules ?? []);
    this.#config = options.config;
  }

  /** Check everything; returns all problems (normalised identifiers are written back into `input`). */
  async validate(tx: Tx, input: PartyInput, existingId?: string): Promise<FieldError[]> {
    const errors: FieldError[] = [];
    requireText(errors, "name", input.name);
    if (input.code !== undefined && !/^[A-Z0-9][A-Z0-9_-]{0,29}$/.test(input.code)) errors.push({ field: "code", message: "use up to 30 capital letters, digits, - or _" });
    if (input.roles.length === 0) errors.push({ field: "roles", message: "choose at least one role (customer, vendor, …)" });
    for (const r of input.roles) if (!PARTY_ROLES.includes(r)) errors.push({ field: "roles", message: `unknown role "${r}"` });
    if (input.defaultCurrency) {
      const c = await tx.selectFrom("foundation.currency").select("code").where("code", "=", input.defaultCurrency).executeTakeFirst();
      if (!c) errors.push({ field: "defaultCurrency", message: `unknown currency ${input.defaultCurrency}` });
    }

    const addresses = input.addresses ?? [];
    const keys = new Set<string>();
    addresses.forEach((a, i) => {
      const f = `addresses[${i}]`;
      requireText(errors, `${f}.line1`, a.line1);
      requireText(errors, `${f}.city`, a.city, 80);
      if (!/^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(a.regionCode ?? "")) errors.push({ field: `${f}.regionCode`, message: "must be a state code such as IN-MH" });
      else if (this.#rules.regionName && !this.#rules.regionName(a.regionCode)) errors.push({ field: `${f}.regionCode`, message: `unknown state ${a.regionCode}` });
      if (a.postalCode && this.#rules.validatePostalCode) {
        const m = this.#rules.validatePostalCode(a.country ?? "IN", a.postalCode);
        if (m) errors.push({ field: `${f}.postalCode`, message: m });
      }
      if (a.key) keys.add(a.key);
    });

    const taxIds = input.taxIds ?? [];
    const pan = taxIds.find((t) => t.scheme === "pan")?.value.trim().toUpperCase();
    const mutable = taxIds as TaxIdInput[];
    mutable.forEach((t, i) => {
      const f = `taxIds[${i}]`;
      const scheme = this.#rules.taxIdSchemes[t.scheme];
      if (!scheme) {
        errors.push({ field: `${f}.scheme`, message: `unknown identifier type "${t.scheme}"` });
        return;
      }
      t.value = scheme.normalize(t.value);
      const problem = scheme.validate(t.value, { pan });
      if (problem) errors.push({ field: `${f}.value`, message: problem });
      if (t.addressKey && !keys.has(t.addressKey)) errors.push({ field: `${f}.addressKey`, message: "refers to an unknown address" });
      const region = scheme.regionOf?.(t.value);
      if (region && !problem) {
        const linked = t.addressKey ? addresses.find((a) => a.key === t.addressKey) : addresses.find((a) => a.regionCode === region);
        if (!linked) errors.push({ field: `${f}.value`, message: `needs an address in ${this.#rules.regionName?.(region) ?? region}` });
        else if (linked.regionCode !== region) errors.push({ field: `${f}.value`, message: `belongs to ${this.#rules.regionName?.(region) ?? region}, but the linked address is in ${linked.regionCode}` });
      }
    });
    const seen = new Set<string>();
    for (const t of taxIds) {
      const k = `${t.scheme}:${t.value}`;
      if (seen.has(k)) errors.push({ field: "taxIds", message: `${t.value} is listed twice` });
      seen.add(k);
    }
    // Duplicate check (ADR-0052): the same identifier on another party means the party already exists.
    if (taxIds.length) {
      const taken = await tx
        .selectFrom("foundation.party_tax_id as t")
        .innerJoin("foundation.party as p", "p.id", "t.party_id")
        .select(["t.scheme", "t.value", "p.code", "p.name", "p.id"])
        .where((eb) => eb.or(taxIds.map((t) => eb.and([eb("t.scheme", "=", t.scheme), eb("t.value", "=", t.value)]))))
        .execute();
      for (const row of taken) {
        if (row.id !== existingId) errors.push({ field: "taxIds", message: `${row.value} already belongs to ${row.name} (${row.code})` });
      }
    }

    (input.contacts ?? []).forEach((c, i) => {
      requireText(errors, `contacts[${i}].name`, c.name, 120);
      if (c.email && !EMAIL.test(c.email)) errors.push({ field: `contacts[${i}].email`, message: "is not a valid e-mail address" });
      if (c.phone && !normalizePhone(c.phone)) errors.push({ field: `contacts[${i}].phone`, message: "is not a valid phone number" });
    });

    if (this.#config) {
      const extErrors = this.#config.validator("foundation.party").validate(input.ext ?? {}, { kind: input.kind ?? "organisation", roles: [...input.roles] });
      errors.push(...extErrors.map((e) => ({ field: `ext.${e.field}`, message: e.message })));
    } else if (input.ext && Object.keys(input.ext).length) {
      errors.push({ field: "ext", message: "no extension fields are configured" });
    }
    return errors;
  }

  async create(tx: Tx, input: PartyInput): Promise<Party> {
    const errors = await this.validate(tx, input);
    if (input.code && (await tx.selectFrom("foundation.party").select("id").where("code", "=", input.code).executeTakeFirst())) {
      errors.push({ field: "code", message: `"${input.code}" is already used` });
    }
    if (errors.length) throw new ValidationError(errors);
    const id = newId();
    const code = input.code ?? (await generateCode(tx, "foundation.party", input.name));
    await tx
      .insertInto("foundation.party")
      .values({
        id, code, name: input.name.trim(), legal_name: input.legalName?.trim() ?? null, kind: input.kind ?? "organisation",
        default_currency: input.defaultCurrency ?? "INR", ext: JSON.stringify(input.ext ?? {}),
      })
      .execute();
    await this.#writeChildren(tx, id, input);
    return this.get(tx, id);
  }

  /** Replace a party's data (optimistic locking on `expectedVersion`). */
  async update(tx: Tx, id: string, expectedVersion: number, input: PartyInput): Promise<Party> {
    const errors = await this.validate(tx, input, id);
    if (errors.length) throw new ValidationError(errors);
    const r = await tx
      .updateTable("foundation.party")
      .set({ name: input.name.trim(), legal_name: input.legalName?.trim() ?? null, kind: input.kind ?? "organisation", default_currency: input.defaultCurrency ?? "INR", ext: JSON.stringify(input.ext ?? {}) })
      .where("id", "=", id)
      .where("version", "=", expectedVersion)
      .executeTakeFirst();
    if (r.numUpdatedRows !== 1n) throw new ValidationError([{ field: "version", message: "the party was changed by someone else — reload and try again" }]);
    await tx.deleteFrom("foundation.party_role").where("party_id", "=", id).execute();
    await tx.deleteFrom("foundation.party_tax_id").where("party_id", "=", id).execute();
    await tx.deleteFrom("foundation.party_address").where("party_id", "=", id).execute();
    await tx.deleteFrom("foundation.party_contact").where("party_id", "=", id).execute();
    await this.#writeChildren(tx, id, input);
    return this.get(tx, id);
  }

  async #writeChildren(tx: Tx, partyId: string, input: PartyInput): Promise<void> {
    for (const role of new Set(input.roles)) await tx.insertInto("foundation.party_role").values({ party_id: partyId, role }).execute();
    const addressIds = new Map<string, string>();
    const created: { id: string; regionCode: string }[] = [];
    for (const a of input.addresses ?? []) {
      const id = newId();
      if (a.key) addressIds.set(a.key, id);
      created.push({ id, regionCode: a.regionCode });
      await tx
        .insertInto("foundation.party_address")
        .values({
          id, party_id: partyId, kind: a.kind, label: a.label ?? null, line1: a.line1.trim(), line2: a.line2?.trim() ?? null, city: a.city.trim(),
          district: a.district ?? null, region_code: a.regionCode, postal_code: a.postalCode ?? null, country: a.country ?? "IN", is_default: a.isDefault ?? false,
        })
        .execute();
    }
    for (const t of input.taxIds ?? []) {
      const scheme = this.#rules.taxIdSchemes[t.scheme];
      const regionCode = scheme?.regionOf?.(t.value) ?? null;
      // Linked address: the one named by addressKey, else the first address in the identifier's region.
      const addressId = t.addressKey ? addressIds.get(t.addressKey) : regionCode ? created.find((a) => a.regionCode === regionCode)?.id : undefined;
      await tx
        .insertInto("foundation.party_tax_id")
        .values({ id: newId(), party_id: partyId, scheme: t.scheme, value: t.value, region_code: regionCode, address_id: addressId ?? null, is_primary: t.isPrimary ?? false })
        .execute();
    }
    for (const c of input.contacts ?? []) {
      await tx
        .insertInto("foundation.party_contact")
        .values({ id: newId(), party_id: partyId, name: c.name.trim(), designation: c.designation ?? null, phone: c.phone ? normalizePhone(c.phone) ?? null : null, email: c.email?.toLowerCase() ?? null, is_primary: c.isPrimary ?? false })
        .execute();
    }
  }

  async get(tx: Tx, id: string): Promise<Party> {
    const p = await tx.selectFrom("foundation.party").selectAll().where("id", "=", id).executeTakeFirst();
    if (!p) throw new ValidationError([{ field: "id", message: "party not found" }]);
    const [roles, taxIds, addresses, contacts] = await Promise.all([
      tx.selectFrom("foundation.party_role").select("role").where("party_id", "=", id).orderBy("role").execute(),
      tx.selectFrom("foundation.party_tax_id").selectAll().where("party_id", "=", id).orderBy("scheme").orderBy("value").execute(),
      tx.selectFrom("foundation.party_address").selectAll().where("party_id", "=", id).orderBy("id").execute(),
      tx.selectFrom("foundation.party_contact").selectAll().where("party_id", "=", id).orderBy("id").execute(),
    ]);
    return {
      id: p.id, code: p.code, name: p.name, legalName: p.legal_name, kind: p.kind, status: p.status, defaultCurrency: p.default_currency,
      roles: roles.map((r) => r.role as PartyRole),
      taxIds: taxIds.map((t) => ({ id: t.id, scheme: t.scheme, value: t.value, regionCode: t.region_code, addressId: t.address_id, isPrimary: t.is_primary })),
      addresses: addresses.map((a) => ({
        id: a.id, kind: a.kind, line1: a.line1, city: a.city, regionCode: a.region_code, country: a.country, isDefault: a.is_default,
        ...(a.label ? { label: a.label } : {}), ...(a.line2 ? { line2: a.line2 } : {}), ...(a.district ? { district: a.district } : {}), ...(a.postal_code ? { postalCode: a.postal_code } : {}),
      })),
      contacts: contacts.map((c) => ({ id: c.id, name: c.name, isPrimary: c.is_primary, ...(c.designation ? { designation: c.designation } : {}), ...(c.phone ? { phone: c.phone } : {}), ...(c.email ? { email: c.email } : {}) })),
      ext: p.ext as Record<string, unknown>,
      version: p.version,
    };
  }

  async findByCode(tx: Tx, code: string): Promise<string | undefined> {
    return (await tx.selectFrom("foundation.party").select("id").where("code", "=", code).executeTakeFirst())?.id as string | undefined;
  }

  /** List with search (name, code, GSTIN, PAN), role and status filters; keyset pagination by name. */
  async list(tx: Tx, q: { search?: string; role?: PartyRole; status?: PartyStatus; limit?: number; cursor?: string } = {}): Promise<Page<PartySummary>> {
    const limit = clampLimit(q.limit);
    let query = tx
      .selectFrom("foundation.party as p")
      .select([
        "p.id", "p.code", "p.name", "p.status",
        sql<string[]>`coalesce((select array_agg(r.role order by r.role) from foundation.party_role r where r.party_id = p.id), '{}')`.as("roles"),
        sql<string[]>`coalesce((select array_agg(t.value order by t.value) from foundation.party_tax_id t where t.party_id = p.id and t.scheme = 'gstin'), '{}')`.as("gstins"),
        sql<string | null>`(select a.city from foundation.party_address a where a.party_id = p.id order by a.is_default desc, a.id limit 1)`.as("city"),
        sql<string>`lower(p.name)`.as("sort_key"),
      ])
      .where("p.status", "=", q.status ?? "active");
    if (q.role) query = query.where(sql<boolean>`exists (select 1 from foundation.party_role r where r.party_id = p.id and r.role = ${q.role})`);
    if (q.search?.trim()) {
      const s = `%${q.search.trim().toLowerCase()}%`;
      const exact = q.search.trim().toUpperCase();
      query = query.where((eb) => eb.or([
        eb(sql`lower(p.name)`, "like", s),
        eb(sql`lower(p.code)`, "like", s),
        eb.exists(eb.selectFrom("foundation.party_tax_id as t").select("t.id").whereRef("t.party_id", "=", "p.id").where("t.value", "=", exact)),
      ]));
    }
    const after = decodeCursor(q.cursor);
    if (after) query = query.where(sql<boolean>`(lower(p.name), p.id) > (${after[0]}, ${after[1]}::uuid)`);
    const rows = await query.orderBy(sql`lower(p.name)`).orderBy("p.id").limit(limit + 1).execute();
    const items = rows.slice(0, limit).map((r) => ({
      id: r.id as string, code: r.code as string, name: r.name as string, status: r.status as PartyStatus,
      roles: r.roles as PartyRole[], gstins: r.gstins, city: r.city,
    }));
    const last = rows.length > limit ? rows[limit - 1] : undefined;
    return { items, nextCursor: last ? encodeCursor(last.sort_key, last.id as string) : null };
  }

  /** Block (no new transactions) or archive (hidden); never deleted. */
  async setStatus(tx: Tx, id: string, status: PartyStatus): Promise<void> {
    const r = await tx.updateTable("foundation.party").set({ status }).where("id", "=", id).executeTakeFirst();
    if (r.numUpdatedRows !== 1n) throw new ValidationError([{ field: "id", message: "party not found" }]);
  }
}
