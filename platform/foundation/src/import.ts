/**
 * Excel import targets for parties and items (Slice 0: "masters are imported from Excel templates").
 * One row per party (Tally-style: GSTIN, address and contact on the row); one row per item.
 * Extension fields from the packages (GSM, MSME …) become columns automatically.
 */
import type { EffectiveConfiguration } from "@master-erp/kernel/config";
import { DECIMAL_PATTERN } from "@master-erp/kernel/decimal";
import type { Tx } from "@master-erp/kernel/db";
import { parseList, parseYesNo } from "@master-erp/kernel/importer";
import type { ImportColumn, ImportTarget } from "@master-erp/kernel/importer";
import { ValidationError } from "@master-erp/kernel/metadata";
import type { FieldDefinition, FieldError } from "@master-erp/kernel/metadata";
import { mergeRules } from "./common.ts";
import type { LocalizationRules } from "./common.ts";
import { ItemService } from "./item.ts";
import type { ItemInput, ItemType } from "./item.ts";
import { PARTY_ROLES, PartyService } from "./party.ts";
import type { PartyInput, PartyRole } from "./party.ts";

const IMPORTABLE = new Set(["text", "long_text", "integer", "decimal", "percent", "date", "boolean", "picklist", "multi_picklist"]);
const decimalText = new RegExp(DECIMAL_PATTERN);

/** Columns for a record's extension fields (computed, reference, money … are not imported). */
function extColumns(config: EffectiveConfiguration | undefined, objectType: string): { def: FieldDefinition; column: ImportColumn }[] {
  return (config?.fields(objectType) ?? [])
    .filter((f) => IMPORTABLE.has(f.type))
    .map((f) => ({
      def: f,
      column: {
        key: f.key,
        label: f.label.en ?? f.key,
        format: f.type === "decimal" || f.type === "percent" || f.type === "integer" ? "decimal" : f.type === "boolean" ? "boolean" : f.type === "date" ? "date" : f.type === "multi_picklist" ? "list" : "text",
        ...(f.values ? { values: f.values } : {}),
        ...(f.appliesWhen ? { help: `Only when ${f.appliesWhen.replace(/record\./g, "")}` } : {}),
      },
    }));
}

/** Text from a cell → the stored value of an extension field, or an error. */
function parseExtValue(def: FieldDefinition, text: string): { value?: unknown; error?: string } {
  switch (def.type) {
    case "integer":
      return /^-?[0-9]{1,15}$/.test(text) ? { value: Number(text) } : { error: "must be a whole number" };
    case "decimal":
    case "percent":
      return decimalText.test(text) ? { value: text } : { error: "must be a number, e.g. 12.5" };
    case "boolean": {
      const b = parseYesNo(text);
      return b === undefined ? { error: "must be yes or no" } : { value: b };
    }
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(text) ? { value: text } : { error: "must be a date (YYYY-MM-DD)" };
    case "picklist": {
      const v = def.values?.find((x) => x.toLowerCase() === text.toLowerCase());
      return v ? { value: v } : { error: `must be one of: ${def.values?.join(", ")}` };
    }
    case "multi_picklist": {
      const parts = parseList(text).map((p) => def.values?.find((x) => x.toLowerCase() === p.toLowerCase()));
      return parts.every(Boolean) ? { value: [...new Set(parts)] } : { error: `values must be from: ${def.values?.join(", ")}` };
    }
    default:
      return { value: text };
  }
}

function readExt(defs: readonly { def: FieldDefinition }[], row: Readonly<Record<string, string>>, errors: FieldError[]): Record<string, unknown> {
  const ext: Record<string, unknown> = {};
  for (const { def } of defs) {
    const text = row[def.key];
    if (text === undefined) continue;
    const r = parseExtValue(def, text);
    if (r.error) errors.push({ field: def.key, message: r.error });
    else ext[def.key] = r.value;
  }
  return ext;
}

/** "ext.gsm" → "gsm"; "addresses[0].postalCode" → "postal_code" … */
function columnFromPath(field: string, map: Readonly<Record<string, string>>): string | undefined {
  if (field.startsWith("ext.")) return field.slice(4);
  const plain = field.replace(/\[\d+\]/g, "");
  return map[plain];
}

export class PartyImportTarget implements ImportTarget<PartyInput> {
  readonly objectType = "foundation.party";
  readonly sheet = "Parties";
  readonly #service: PartyService;
  readonly #rules: ReturnType<typeof mergeRules>;
  readonly #ext: ReturnType<typeof extColumns>;
  readonly #schemes: string[];

  constructor(options: { rules?: readonly LocalizationRules[]; config?: EffectiveConfiguration } = {}) {
    this.#service = new PartyService(options);
    this.#rules = mergeRules(options.rules ?? []);
    this.#ext = extColumns(options.config, "foundation.party");
    this.#schemes = Object.keys(this.#rules.taxIdSchemes);
  }

  columns(): ImportColumn[] {
    return [
      { key: "code", label: "Code", format: "code", help: "Leave blank to generate one from the name.", example: "SUNRISE" },
      { key: "name", label: "Name", required: true, example: "Sunrise Pharma Ltd" },
      { key: "legal_name", label: "Legal name" },
      { key: "roles", label: "Roles", required: true, format: "list", values: PARTY_ROLES, help: "One or more, comma-separated.", example: "customer, vendor" },
      ...this.#schemes.map((s): ImportColumn => ({ key: s, label: this.#rules.taxIdSchemes[s]?.label ?? s, format: "code" })),
      { key: "address_line1", label: "Address line 1", example: "Plot 14, GIDC Phase II" },
      { key: "address_line2", label: "Address line 2" },
      { key: "city", label: "City", example: "Vapi" },
      { key: "district", label: "District" },
      { key: "state", label: "State", help: "Name, code or ISO code. Taken from the tax number when blank.", example: "Gujarat" },
      { key: "postal_code", label: "PIN / postal code", format: "code", example: "396195" },
      { key: "country", label: "Country", format: "code", help: "ISO 3166 two-letter code; default IN.", example: "IN" },
      { key: "contact_name", label: "Contact person" },
      { key: "phone", label: "Phone", format: "code", example: "+91 98250 10001" },
      { key: "email", label: "E-mail" },
      { key: "currency", label: "Currency", format: "code", help: "ISO 4217; default INR.", example: "INR" },
      ...this.#ext.map((e) => e.column),
    ];
  }

  parse(row: Readonly<Record<string, string>>): { input: PartyInput; errors: FieldError[] } {
    const errors: FieldError[] = [];
    const roles = parseList(row.roles ?? "").map((r) => r.toLowerCase().replace(/[\s-]+/g, "_"));
    const bad = roles.filter((r) => !(PARTY_ROLES as readonly string[]).includes(r));
    if (bad.length > 0) errors.push({ field: "roles", message: `unknown role ${bad.join(", ")}; use ${PARTY_ROLES.join(", ")}` });

    const taxIds = this.#schemes.filter((s) => row[s]).map((s) => ({ scheme: s, value: row[s] as string, addressKey: "main" }));
    const country = (row.country ?? "IN").toUpperCase();
    let regionCode = row.state ? (this.#rules.parseRegion?.(row.state) ?? (/^[A-Z]{2}-[A-Z0-9]{1,3}$/i.test(row.state) ? row.state.toUpperCase() : undefined)) : undefined;
    if (row.state && !regionCode) errors.push({ field: "state", message: `"${row.state}" is not a known state` });
    if (!row.state) {
      for (const t of taxIds) regionCode ??= this.#rules.taxIdSchemes[t.scheme]?.regionOf?.(t.value.replace(/\s/g, "").toUpperCase());
    }
    const hasAddress = Boolean(row.address_line1 || row.city || row.postal_code);
    const input: PartyInput = {
      ...(row.code ? { code: row.code.toUpperCase() } : {}),
      name: row.name ?? "",
      ...(row.legal_name ? { legalName: row.legal_name } : {}),
      roles: roles as PartyRole[],
      ...(row.currency ? { defaultCurrency: row.currency.toUpperCase() } : {}),
      taxIds: taxIds.map((t) => (hasAddress ? t : { scheme: t.scheme, value: t.value })),
      addresses: hasAddress
        ? [{
            key: "main", kind: "registered", line1: row.address_line1 ?? "", city: row.city ?? "", regionCode: regionCode ?? "", country, isDefault: true,
            ...(row.address_line2 ? { line2: row.address_line2 } : {}), ...(row.district ? { district: row.district } : {}), ...(row.postal_code ? { postalCode: row.postal_code } : {}),
          }]
        : [],
      contacts: row.contact_name || row.phone || row.email
        ? [{ name: row.contact_name ?? row.name ?? "", isPrimary: true, ...(row.phone ? { phone: row.phone } : {}), ...(row.email ? { email: row.email } : {}) }]
        : [],
      ext: readExt(this.#ext, row, errors),
    };
    return { input, errors };
  }

  key(input: PartyInput): string | undefined {
    return input.code;
  }

  async exists(tx: Tx, code: string): Promise<boolean> {
    return (await this.#service.findByCode(tx, code)) !== undefined;
  }

  async create(tx: Tx, input: PartyInput): Promise<unknown> {
    return this.#service.create(tx, input);
  }

  columnOf(field: string, input: PartyInput): string | undefined {
    const tax = /^taxIds\[(\d+)\]/.exec(field);
    if (tax) return input.taxIds?.[Number(tax[1])]?.scheme;
    return columnFromPath(field, {
      legalName: "legal_name", defaultCurrency: "currency", "addresses.line1": "address_line1", "addresses.line2": "address_line2", "addresses.city": "city",
      "addresses.district": "district", "addresses.regionCode": "state", "addresses.postalCode": "postal_code", "addresses.country": "country",
      "contacts.name": "contact_name", "contacts.phone": "phone", "contacts.email": "email",
    });
  }
}

export class ItemImportTarget implements ImportTarget<ItemInput & { ownerPartyCode?: string }> {
  readonly objectType = "foundation.item";
  readonly sheet = "Items";
  readonly #service: ItemService;
  readonly #parties = new PartyService();
  readonly #ext: ReturnType<typeof extColumns>;
  readonly #prepare: (input: ItemInput) => ItemInput;

  /** `prepare` lets an industry package complete an input, e.g. the kg ↔ sheet conversion for board. */
  constructor(options: { rules?: readonly LocalizationRules[]; config?: EffectiveConfiguration; prepare?: (input: ItemInput) => ItemInput } = {}) {
    this.#service = new ItemService(options);
    this.#ext = extColumns(options.config, "foundation.item");
    this.#prepare = options.prepare ?? ((i) => i);
  }

  columns(): ImportColumn[] {
    return [
      { key: "code", label: "Code", format: "code", help: "Leave blank to number per category (BOARD-0001 …).", example: "FBB-300-700X1000" },
      { key: "name", label: "Name", required: true, example: "FBB 300 GSM 700 × 1000 mm" },
      { key: "category", label: "Category", required: true, format: "code", example: "board" },
      { key: "item_type", label: "Item type", values: ["stock", "non_stock", "service"], help: "Default: the category's." },
      { key: "base_uom", label: "Unit", format: "code", help: "Default: the category's unit.", example: "kg" },
      { key: "hsn_sac", label: "HSN / SAC", format: "code", help: "Default: the category's.", example: "4810" },
      { key: "tax_category", label: "Tax category", format: "code", help: "Default: the category's.", example: "gst_18" },
      { key: "description", label: "Description" },
      { key: "owner_party_code", label: "Customer code (own product)", format: "code", help: "For a customer's own product (carton, label)." },
      ...this.#ext.map((e) => e.column),
    ];
  }

  parse(row: Readonly<Record<string, string>>): { input: ItemInput & { ownerPartyCode?: string }; errors: FieldError[] } {
    const errors: FieldError[] = [];
    const itemType = row.item_type?.toLowerCase().replace(/[\s-]+/g, "_");
    if (itemType && !["stock", "non_stock", "service"].includes(itemType)) errors.push({ field: "item_type", message: "must be stock, non_stock or service" });
    const input = {
      ...(row.code ? { code: row.code.toUpperCase() } : {}),
      name: row.name ?? "",
      category: (row.category ?? "").toLowerCase(),
      ...(itemType ? { itemType: itemType as ItemType } : {}),
      ...(row.base_uom ? { baseUom: row.base_uom.toLowerCase() } : {}),
      ...(row.hsn_sac ? { hsnSac: row.hsn_sac.replace(/\s/g, "") } : {}),
      ...(row.tax_category ? { taxCategory: row.tax_category.toLowerCase() } : {}),
      ...(row.description ? { description: row.description } : {}),
      ...(row.owner_party_code ? { ownerPartyCode: row.owner_party_code.toUpperCase() } : {}),
      ext: readExt(this.#ext, row, errors),
    };
    return { input, errors };
  }

  key(input: ItemInput): string | undefined {
    return input.code;
  }

  async exists(tx: Tx, code: string): Promise<boolean> {
    return (await this.#service.findByCode(tx, code)) !== undefined;
  }

  async create(tx: Tx, input: ItemInput & { ownerPartyCode?: string }): Promise<unknown> {
    const { ownerPartyCode, ...rest } = input;
    let ownerPartyId: string | undefined;
    if (ownerPartyCode) {
      ownerPartyId = await this.#parties.findByCode(tx, ownerPartyCode);
      if (!ownerPartyId) throw new ValidationError([{ field: "owner_party_code", message: `no party with code "${ownerPartyCode}"` }]);
    }
    return this.#service.create(tx, this.#prepare({ ...rest, ...(ownerPartyId ? { ownerPartyId } : {}) }));
  }

  columnOf(field: string): string | undefined {
    return columnFromPath(field, { baseUom: "base_uom", hsnSac: "hsn_sac", taxCategory: "tax_category", itemType: "item_type", ownerPartyId: "owner_party_code" });
  }
}
