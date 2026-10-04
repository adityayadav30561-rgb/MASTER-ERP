/**
 * K5 Metadata: extension fields (ADR-0026, Step 5 §6). Values live in the `ext` JSONB column and are
 * validated against the field definitions: types via JSON Schema 2020-12, conditions via CEL.
 */
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject } from "ajv";
import { DECIMAL_PATTERN, Decimal } from "../decimal/index.ts";
import { RuleEngine, toFacts } from "../rules/engine.ts";

export type FieldType =
  | "text" | "long_text" | "integer" | "decimal" | "quantity" | "money" | "percent"
  | "date" | "datetime" | "boolean" | "picklist" | "multi_picklist" | "reference" | "file" | "computed";

export type Classification = "normal" | "confidential" | "personal";

export interface FieldDefinition {
  key: string; // stable technical name, e.g. "gsm"
  label: Readonly<Record<string, string>>; // BCP 47 language → label, e.g. { en: "GSM", hi: "जीएसएम" }
  type: FieldType;
  /** decimal: total digits and decimals, e.g. decimal(6,1) */
  precision?: number;
  scale?: number;
  /** picklist values (codes) */
  values?: readonly string[];
  /** reference: object type, e.g. "printing.die" */
  objectType?: string;
  /** computed: read-only CEL expression over `record` */
  expression?: string;
  required?: boolean | string; // true, or a CEL condition over `record`
  appliesWhen?: string; // CEL: the field exists only when true (e.g. category in ['paper', 'board'])
  min?: string; // decimal text
  max?: string;
  maxLength?: number;
  pattern?: string;
  validation?: { condition: string; message: string }; // CEL over `record` and `value`
  fieldGroup?: string; // field security group (ADR-0033)
  classification?: Classification;
  searchable?: boolean;
}

export interface FieldError {
  field: string;
  message: string;
}

const KEY = /^[a-z][a-z0-9_]{0,40}$/;
const rules = new RuleEngine();

function schemaFor(f: FieldDefinition): Record<string, unknown> {
  const decimal = { type: "string", pattern: DECIMAL_PATTERN, maxLength: 40 };
  switch (f.type) {
    case "text":
      return { type: "string", maxLength: f.maxLength ?? 255, ...(f.pattern ? { pattern: f.pattern } : {}) };
    case "long_text":
      return { type: "string", maxLength: f.maxLength ?? 10_000 };
    case "integer":
      return { type: "integer" };
    case "decimal":
    case "percent":
      return decimal;
    case "quantity":
      return { type: "object", required: ["value", "uom"], additionalProperties: false, properties: { value: decimal, uom: { type: "string", minLength: 1, maxLength: 16 } } };
    case "money":
      return { type: "object", required: ["amount", "currency"], additionalProperties: false, properties: { amount: decimal, currency: { type: "string", pattern: "^[A-Z]{3}$" } } };
    case "date":
      return { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
    case "datetime":
      return { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(:\\d{2}(\\.\\d+)?)?(Z|[+-]\\d{2}:\\d{2})$" };
    case "boolean":
      return { type: "boolean" };
    case "picklist":
      return { type: "string", enum: [...(f.values ?? [])] };
    case "multi_picklist":
      return { type: "array", uniqueItems: true, items: { type: "string", enum: [...(f.values ?? [])] } };
    case "reference":
    case "file":
      return { type: "string", pattern: "^[0-9a-f-]{36}$" };
    case "computed":
      return {}; // never stored
  }
}

/** The record does not exist (or is not visible to this tenant): HTTP 404. */
export class NotFoundError extends Error {
  override name = "NotFoundError";
}

/** Input that breaks business rules; carries every problem so a form can show them all at once. */
export class ValidationError extends Error {
  override name = "ValidationError";
  readonly errors: readonly FieldError[];
  constructor(errors: readonly FieldError[]) {
    super(errors.map((e) => `${e.field}: ${e.message}`).join("; "));
    this.errors = errors;
  }
}

export class FieldDefinitionError extends Error {
  override name = "FieldDefinitionError";
}

/** Check definitions when a package is loaded (bad configuration never reaches users). */
export function validateDefinitions(objectType: string, defs: readonly FieldDefinition[]): void {
  const seen = new Set<string>();
  for (const f of defs) {
    const where = `${objectType}.${f.key}`;
    if (!KEY.test(f.key)) throw new FieldDefinitionError(`${where}: key must be lower_snake_case`);
    if (seen.has(f.key)) throw new FieldDefinitionError(`${where}: defined twice`);
    seen.add(f.key);
    if (!f.label.en) throw new FieldDefinitionError(`${where}: needs an English label`);
    if ((f.type === "picklist" || f.type === "multi_picklist") && !f.values?.length) throw new FieldDefinitionError(`${where}: picklist needs values`);
    if (f.type === "computed" && !f.expression) throw new FieldDefinitionError(`${where}: computed field needs an expression`);
    if (f.type === "reference" && !f.objectType) throw new FieldDefinitionError(`${where}: reference needs an object type`);
    for (const cond of [typeof f.required === "string" ? f.required : undefined, f.appliesWhen, f.validation?.condition]) {
      if (cond) rules.validateCondition(cond);
    }
    if (f.expression) rules.compile(f.expression);
    if (f.pattern) new RegExp(f.pattern);
  }
}

/** A compiled validator for one object type's extension fields. */
export class ExtensionValidator {
  readonly #defs: readonly FieldDefinition[];
  readonly #validate: ReturnType<Ajv2020["compile"]>;

  constructor(objectType: string, defs: readonly FieldDefinition[]) {
    validateDefinitions(objectType, defs);
    this.#defs = defs;
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    this.#validate = ajv.compile({
      type: "object",
      additionalProperties: false,
      properties: Object.fromEntries(defs.map((f) => [f.key, schemaFor(f)])), // computed: any value, refused below with a clear message
    });
  }

  /**
   * Validate `ext` for a record. `record` holds core fields as facts for conditions (decimals as text,
   * listed in decimalFields). Returns all problems, empty when valid.
   */
  validate(ext: Record<string, unknown>, record: Record<string, unknown> = {}, decimalFields: readonly string[] = []): FieldError[] {
    const errors: FieldError[] = [];
    if (!this.#validate(ext)) {
      for (const e of this.#validate.errors ?? []) errors.push(toFieldError(e));
      return errors;
    }
    const facts = { record: toFacts({ ...record, ...ext }, new Set([...decimalFields, ...this.#decimalKeys()])) };
    for (const f of this.#defs) {
      if (f.type === "computed") {
        if (ext[f.key] !== undefined) errors.push({ field: f.key, message: "is computed and cannot be entered" });
        continue;
      }
      const value = ext[f.key];
      const applies = !f.appliesWhen || rules.compile(f.appliesWhen).test(facts);
      if (!applies) {
        if (value !== undefined) errors.push({ field: f.key, message: "does not apply to this record" });
        continue;
      }
      const required = f.required === true || (typeof f.required === "string" && rules.compile(f.required).test(facts));
      if (value === undefined || value === null || value === "") {
        if (required) errors.push({ field: f.key, message: "is required" });
        continue;
      }
      if ((f.type === "decimal" || f.type === "percent") && typeof value === "string") {
        const d = Decimal.from(value);
        if (f.scale !== undefined && d.scale() > f.scale) errors.push({ field: f.key, message: `allows at most ${f.scale} decimals` });
        if (f.precision !== undefined && f.scale !== undefined && d.abs().compare("1" + "0".repeat(f.precision - f.scale)) >= 0) {
          errors.push({ field: f.key, message: `allows at most ${f.precision - f.scale} digits before the decimal point` });
        }
        if (f.min !== undefined && d.lessThan(f.min)) errors.push({ field: f.key, message: `must be at least ${f.min}` });
        if (f.max !== undefined && d.greaterThan(f.max)) errors.push({ field: f.key, message: `must be at most ${f.max}` });
      }
      if (f.validation) {
        const ok = rules.compile(f.validation.condition).test({ ...facts, value: (facts.record as Record<string, unknown>)[f.key] });
        if (!ok) errors.push({ field: f.key, message: f.validation.message });
      }
    }
    return errors;
  }

  /** Computed fields for display (never stored). */
  computed(ext: Record<string, unknown>, record: Record<string, unknown> = {}, decimalFields: readonly string[] = []): Record<string, unknown> {
    const facts = { record: toFacts({ ...record, ...ext }, new Set([...decimalFields, ...this.#decimalKeys()])) };
    return Object.fromEntries(
      this.#defs.filter((f) => f.type === "computed" && (!f.appliesWhen || rules.compile(f.appliesWhen).test(facts))).map((f) => {
        // Null when an input is missing (e.g. sheet weight before the size is entered); the expression was type-checked when loaded.
        let v: unknown;
        try {
          v = rules.compile(f.expression ?? "null").evaluate(facts);
        } catch {
          v = null;
        }
        return [f.key, v instanceof Decimal ? v.toString() : v];
      }),
    );
  }

  /** Field → field group, for field security (redactFields). */
  fieldGroups(): Record<string, string> {
    return Object.fromEntries(this.#defs.filter((f) => f.fieldGroup).map((f) => [f.key, f.fieldGroup as string]));
  }

  #decimalKeys(): string[] {
    return this.#defs.filter((f) => f.type === "decimal" || f.type === "percent").map((f) => f.key);
  }
}

function toFieldError(e: ErrorObject): FieldError {
  const field = e.instancePath.split("/")[1] ?? (e.params as { additionalProperty?: string }).additionalProperty ?? "";
  if (e.keyword === "additionalProperties") return { field, message: "is not a known field" };
  if (e.keyword === "enum") return { field, message: "is not one of the allowed values" };
  if (e.keyword === "pattern" && e.schemaPath.includes("amount")) return { field, message: "must be a decimal written as text" };
  return { field, message: e.message ?? "is invalid" };
}
