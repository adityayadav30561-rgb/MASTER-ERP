/**
 * Bulk import of masters from Excel (Slice 0, Step 8A). A target (parties, items …) describes its columns and
 * how a row becomes a service input; the service's own validation decides. Every row is written inside a
 * savepoint, so a dry run gives exactly the errors a real import would, then rolls everything back.
 * An import is all-or-nothing: if any row fails, nothing is saved.
 */
import { sql } from "kysely";
import type { Tx } from "../db/database.ts";
import { ValidationError } from "../metadata/fields.ts";
import type { FieldError } from "../metadata/fields.ts";
import { readWorkbook, writeWorkbook } from "./xlsx.ts";
import type { ReadLimits, SheetSpec } from "./xlsx.ts";

export interface ImportColumn {
  key: string; // e.g. "gstin"; also accepted as the header
  label: string; // header shown in the template, e.g. "GSTIN"
  required?: boolean;
  /** Free text, a code (kept as text), a decimal, yes/no, a date (YYYY-MM-DD) or a comma-separated list. */
  format?: "text" | "code" | "decimal" | "boolean" | "date" | "list";
  values?: readonly string[];
  help?: string;
  example?: string;
}

export interface ImportTarget<I = unknown> {
  objectType: string;
  /** Sheet name in the template, e.g. "Parties". */
  sheet: string;
  columns(): readonly ImportColumn[];
  /** Turn a row (column key → text; blank cells absent) into a service input. Errors name column keys. */
  parse(row: Readonly<Record<string, string>>): { input: I; errors: FieldError[] };
  /** Natural key (code) used for "already exists" and duplicates within the file; undefined = generated. */
  key(input: I): string | undefined;
  exists(tx: Tx, key: string): Promise<boolean>;
  create(tx: Tx, input: I): Promise<unknown>;
  /** Map a service field path (e.g. "addresses[0].postalCode") to a column key; `input` is the row's input. */
  columnOf?(field: string, input: I): string | undefined;
}

export interface ImportOptions {
  mode: "dry-run" | "commit";
  /** Rows whose code already exists: skip them (default) or report an error. */
  existing?: "skip" | "error";
  limits?: ReadLimits;
}

export interface ImportRowError {
  row: number; // Excel row number
  column: string | null; // header label
  message: string;
}

export interface ImportReport {
  objectType: string;
  mode: "dry-run" | "commit";
  committed: boolean;
  total: number;
  created: number;
  skipped: number;
  failed: number;
  errors: ImportRowError[];
  unknownColumns: string[];
}

const normalise = (s: string) => s.toLowerCase().replace(/\*/g, "").replace(/[^a-z0-9]+/g, "");

export function columnHeader(c: ImportColumn): string {
  return c.required ? `${c.label} *` : c.label;
}

/** The template: one data sheet with headers (notes, drop-downs) and an "Instructions" sheet. */
export async function buildTemplate(targets: readonly ImportTarget[]): Promise<Uint8Array> {
  const sheets: SheetSpec[] = targets.map((t) => ({
    name: t.sheet,
    columns: t.columns().map((c) => ({
      header: columnHeader(c),
      text: c.format === undefined || c.format === "text" || c.format === "code",
      ...(c.values ? { values: c.values } : {}),
      note: [c.help, c.values ? `Allowed: ${c.values.join(", ")}` : undefined, c.example ? `Example: ${c.example}` : undefined].filter(Boolean).join("\n"),
    })),
  }));
  sheets.push({
    name: "Instructions",
    columns: [{ header: "Sheet", width: 14 }, { header: "Column", width: 28 }, { header: "Required", width: 10 }, { header: "Allowed values / format", width: 50 }, { header: "Example", width: 24 }, { header: "Help", width: 60 }],
    rows: targets.flatMap((t) =>
      t.columns().map((c) => [t.sheet, c.label, c.required ? "yes" : "", c.values?.join(", ") ?? FORMAT_TEXT[c.format ?? "text"], c.example ?? "", c.help ?? ""]),
    ),
  });
  return writeWorkbook(sheets);
}

const FORMAT_TEXT: Record<NonNullable<ImportColumn["format"]>, string> = {
  text: "text",
  code: "code (letters, digits, - _ /)",
  decimal: "number, e.g. 12.5",
  boolean: "yes / no",
  date: "date (YYYY-MM-DD)",
  list: "comma-separated list",
};

export async function runImport<I>(tx: Tx, target: ImportTarget<I>, file: Uint8Array, options: ImportOptions): Promise<ImportReport> {
  const sheet = await readWorkbook(file, target.sheet, options.limits);
  const columns = target.columns();
  const byHeader = new Map<string, ImportColumn>();
  for (const c of columns) {
    byHeader.set(normalise(c.key), c);
    byHeader.set(normalise(c.label), c);
  }
  const mapped = sheet.headers.map((h) => (h ? byHeader.get(normalise(h)) : undefined));
  const report: ImportReport = {
    objectType: target.objectType,
    mode: options.mode,
    committed: false,
    total: sheet.rows.length,
    created: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    unknownColumns: sheet.headers.filter((h, i) => h && !mapped[i]),
  };
  const missing = columns.filter((c) => c.required && !mapped.includes(c));
  if (missing.length > 0) {
    report.errors.push({ row: 1, column: null, message: `Missing column(s): ${missing.map((c) => c.label).join(", ")}` });
    report.failed = report.total;
    return report;
  }
  const label = (key: string | undefined) => (key ? (columns.find((c) => c.key === key)?.label ?? key) : null);
  const seen = new Map<string, number>();

  await sql`savepoint erp_import`.execute(tx);
  try {
    for (const { row, cells } of sheet.rows) {
      const values: Record<string, string> = {};
      cells.forEach((v, i) => {
        const c = mapped[i];
        if (c && v !== "") values[c.key] = v;
      });
      const { input, errors } = target.parse(values);
      const fail = (errs: readonly FieldError[]) => {
        report.failed++;
        for (const e of errs) report.errors.push({ row, column: label(columns.some((c) => c.key === e.field) ? e.field : target.columnOf?.(e.field, input)), message: e.message });
      };
      const required = columns.filter((c) => c.required && values[c.key] === undefined).map((c) => ({ field: c.key, message: "is required" }));
      if (required.length > 0 || errors.length > 0) {
        fail([...required, ...errors.filter((e) => !required.some((r) => r.field === e.field))]);
        continue;
      }
      const key = target.key(input);
      if (key !== undefined) {
        const first = seen.get(key);
        if (first !== undefined) {
          fail([{ field: "code", message: `"${key}" appears again (first on row ${first})` }]);
          continue;
        }
        seen.set(key, row);
        if (await target.exists(tx, key)) {
          if ((options.existing ?? "skip") === "skip") report.skipped++;
          else fail([{ field: "code", message: `"${key}" already exists` }]);
          continue;
        }
      }
      await sql`savepoint erp_import_row`.execute(tx);
      try {
        await target.create(tx, input);
        await sql`release savepoint erp_import_row`.execute(tx);
        report.created++;
      } catch (error) {
        await sql`rollback to savepoint erp_import_row`.execute(tx);
        if (!(error instanceof ValidationError)) throw error;
        fail(error.errors);
      }
    }
  } catch (error) {
    await sql`rollback to savepoint erp_import`.execute(tx);
    throw error;
  }
  if (options.mode === "commit" && report.failed === 0) {
    await sql`release savepoint erp_import`.execute(tx);
    report.committed = true;
  } else {
    await sql`rollback to savepoint erp_import`.execute(tx);
  }
  return report;
}

/* ---------- helpers for targets ---------- */

/** "yes"/"no"/"true"/"false"/"y"/"n"/"1"/"0" → boolean; undefined when not recognised. */
export function parseYesNo(text: string): boolean | undefined {
  const t = text.trim().toLowerCase();
  if (["yes", "y", "true", "1"].includes(t)) return true;
  if (["no", "n", "false", "0"].includes(t)) return false;
  return undefined;
}

/** Split a comma/semicolon list, trimmed, without blanks. */
export function parseList(text: string): string[] {
  return text.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
}
