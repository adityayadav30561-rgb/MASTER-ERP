/**
 * Numbering series (ADR-0029). Statutory series are gapless: the number is allocated inside the posting
 * transaction from a locked counter, so a failed posting never consumes a number.
 */
import { sql } from "kysely";
import { newId } from "../ids/index.ts";
import type { Tx } from "../db/database.ts";

export type ResetPolicy = "never" | "fiscal_year" | "calendar_year" | "monthly";

export interface SeriesInput {
  documentType: string;
  companyId: string;
  siteId?: string;
  code?: string;
  pattern: string;
  resetPolicy?: ResetPolicy;
  allocation?: "creation" | "posting";
  gapless?: boolean;
  fyStartMonth?: number;
  maxLength?: number;
  allowedPattern?: string;
}

export interface Series {
  id: string;
  document_type: string;
  company_id: string;
  site_id: string | null;
  code: string;
  pattern: string;
  reset_policy: ResetPolicy;
  allocation: "creation" | "posting";
  gapless: boolean;
  fy_start_month: number;
  max_length: number | null;
  allowed_pattern: string | null;
}

export interface AllocatedNumber {
  number: string;
  seriesId: string;
  periodKey: string;
  sequence: string;
  fiscalYear: string;
}

export class NumberingError extends Error {
  override name = "NumberingError";
}

const TOKEN = /\{(FY|FYYYY|YYYY|YY|MM|COMPANY|SITE|SEQ(?::(\d{1,2}))?)\}/g;

export function validatePattern(pattern: string): void {
  if (!/\{SEQ(?::\d{1,2})?\}/.test(pattern)) throw new NumberingError("A pattern needs a {SEQ} token");
  const leftover = pattern.replace(TOKEN, "");
  if (/[{}]/.test(leftover)) throw new NumberingError(`Unknown token in pattern "${pattern}"`);
}

export async function createSeries(tx: Tx, input: SeriesInput): Promise<string> {
  validatePattern(input.pattern);
  if (input.allowedPattern) new RegExp(input.allowedPattern); // throws on an invalid expression
  if (input.maxLength) {
    // Refuse at configuration time a pattern whose longest number breaks the limit (e.g. 16 characters for GST invoices).
    const codes = await sql<{ kind: string; code: string }>`select kind, code from kernel.org_unit where id in (${input.companyId}, ${input.siteId ?? null})`.execute(tx);
    const sample = previewNumber({ pattern: input.pattern, fy_start_month: input.fyStartMonth ?? 4 }, "2099-12-31", codes.rows.find((r) => r.kind === "company")?.code ?? "", codes.rows.find((r) => r.kind === "site")?.code ?? "");
    if (sample.length > input.maxLength) throw new NumberingError(`"${sample}" would be longer than ${input.maxLength} characters`);
  }
  const id = newId();
  await tx
    .insertInto("kernel.number_series")
    .values({
      id,
      document_type: input.documentType,
      company_id: input.companyId,
      site_id: input.siteId ?? null,
      code: input.code ?? "default",
      pattern: input.pattern,
      reset_policy: input.resetPolicy ?? "fiscal_year",
      allocation: input.allocation ?? "posting",
      gapless: input.gapless ?? true,
      fy_start_month: input.fyStartMonth ?? 4,
      max_length: input.maxLength ?? null,
      allowed_pattern: input.allowedPattern ?? null,
    })
    .execute();
  return id;
}

/** Fiscal year of a date: India's April–March year 2026-04-01 … 2027-03-31 is "2026-27". */
export function fiscalYear(date: string, startMonth = 4): { short: string; long: string; startYear: number } {
  const [y, m] = date.split("-").map(Number) as [number, number];
  const startYear = m >= startMonth ? y : y - 1;
  if (startMonth === 1) return { short: String(startYear).slice(2), long: String(startYear), startYear };
  const next = String(startYear + 1).slice(2);
  return { short: `${String(startYear).slice(2)}-${next}`, long: `${startYear}-${next}`, startYear };
}

export function periodKey(policy: ResetPolicy, date: string, startMonth: number): string {
  switch (policy) {
    case "never":
      return "";
    case "fiscal_year":
      return fiscalYear(date, startMonth).long;
    case "calendar_year":
      return date.slice(0, 4);
    case "monthly":
      return date.slice(0, 7);
  }
}

export function renderNumber(pattern: string, values: { date: string; sequence: bigint; fyStartMonth: number; companyCode: string; siteCode: string }): string {
  const fy = fiscalYear(values.date, values.fyStartMonth);
  return pattern.replace(TOKEN, (_all, token: string, width?: string) => {
    switch (token) {
      case "FY":
        return fy.short;
      case "FYYYY":
        return fy.long;
      case "YYYY":
        return values.date.slice(0, 4);
      case "YY":
        return values.date.slice(2, 4);
      case "MM":
        return values.date.slice(5, 7);
      case "COMPANY":
        return values.companyCode;
      case "SITE":
        return values.siteCode;
      default:
        return values.sequence.toString().padStart(width ? Number(width) : 1, "0");
    }
  });
}

/** Most specific active series: the site's own series first, then the company's. */
export async function findSeries(tx: Tx, documentType: string, companyId: string, siteId?: string, code = "default"): Promise<Series | undefined> {
  let q = tx
    .selectFrom("kernel.number_series")
    .selectAll()
    .where("document_type", "=", documentType)
    .where("company_id", "=", companyId)
    .where("code", "=", code)
    .where("active", "=", true);
  q = siteId ? q.where((eb) => eb.or([eb("site_id", "=", siteId), eb("site_id", "is", null)])) : q.where("site_id", "is", null);
  const rows = await q.orderBy(sql`site_id is null`).execute();
  return rows[0] as Series | undefined;
}

/** Take the next number. Call inside the transaction that uses it (posting, for gapless series). */
export async function allocateNumber(tx: Tx, series: Series, date: string): Promise<AllocatedNumber> {
  const key = periodKey(series.reset_policy, date, series.fy_start_month);
  const counter = await sql<{ last_value: string }>`
    insert into kernel.number_counter (series_id, period_key, last_value) values (${series.id}, ${key}, 1)
    on conflict (series_id, period_key) do update set last_value = kernel.number_counter.last_value + 1
    returning last_value`.execute(tx);
  const sequence = BigInt(counter.rows[0]?.last_value ?? "0");
  const codes = await sql<{ kind: string; code: string }>`select kind, code from kernel.org_unit where id in (${series.company_id}, ${series.site_id})`.execute(tx);
  const number = renderNumber(series.pattern, {
    date,
    sequence,
    fyStartMonth: series.fy_start_month,
    companyCode: codes.rows.find((r) => r.kind === "company")?.code ?? "",
    siteCode: codes.rows.find((r) => r.kind === "site")?.code ?? "",
  });
  if (series.max_length !== null && number.length > series.max_length) {
    throw new NumberingError(`Number "${number}" is longer than ${series.max_length} characters`);
  }
  if (series.allowed_pattern !== null && !new RegExp(series.allowed_pattern).test(number)) {
    throw new NumberingError(`Number "${number}" contains characters the series does not allow`);
  }
  return { number, seriesId: series.id, periodKey: key, sequence: sequence.toString(), fiscalYear: fiscalYear(date, series.fy_start_month).long };
}

/** The series of the tenant, with the next number each would give today (admin screen). */
export async function listSeries(tx: Tx, today: string): Promise<(Series & { company_code: string; site_code: string | null; used: boolean; preview: string })[]> {
  const rows = await tx
    .selectFrom("kernel.number_series as s")
    .innerJoin("kernel.org_unit as c", "c.id", "s.company_id")
    .leftJoin("kernel.org_unit as st", "st.id", "s.site_id")
    .selectAll("s")
    .select(["c.code as company_code", "st.code as site_code"])
    .select(sql<boolean>`exists (select from kernel.number_counter n where n.series_id = s.id)`.as("used"))
    .orderBy("s.document_type")
    .execute();
  return rows.map((r) => {
    const series = r as Series & { company_code: string; site_code: string | null; used: boolean };
    return { ...series, preview: previewNumber(series, today, series.company_code, series.site_code ?? "") };
  });
}

/** The longest number the pattern can produce this period (sequence at its full width), for checks and previews. */
export function previewNumber(series: Pick<Series, "pattern" | "fy_start_month">, date: string, companyCode = "", siteCode = ""): string {
  const width = Number(/\{SEQ(?::(\d{1,2}))?\}/.exec(series.pattern)?.[1] ?? "1");
  return renderNumber(series.pattern, { date, sequence: 10n ** BigInt(Math.max(width, 1)) - 1n, fyStartMonth: series.fy_start_month, companyCode, siteCode });
}

/**
 * Change a series' pattern. Allowed only before the first number is taken (statutory series must not change
 * mid-year, CGST Rule 46), and the longest number must respect the series' length and character limits.
 */
export async function updateSeriesPattern(tx: Tx, seriesId: string, pattern: string, today: string): Promise<void> {
  validatePattern(pattern);
  const series = (await tx.selectFrom("kernel.number_series").selectAll().where("id", "=", seriesId).executeTakeFirst()) as Series | undefined;
  if (!series) throw new NumberingError("Series not found");
  if (await tx.selectFrom("kernel.number_counter").select("series_id").where("series_id", "=", seriesId).executeTakeFirst()) {
    throw new NumberingError("Numbers were already taken from this series; start a new series instead of changing it");
  }
  const codes = await sql<{ kind: string; code: string }>`select kind, code from kernel.org_unit where id in (${series.company_id}, ${series.site_id})`.execute(tx);
  const sample = previewNumber({ ...series, pattern }, today, codes.rows.find((r) => r.kind === "company")?.code ?? "", codes.rows.find((r) => r.kind === "site")?.code ?? "");
  if (series.max_length !== null && sample.length > series.max_length) throw new NumberingError(`"${sample}" would be longer than ${series.max_length} characters`);
  if (series.allowed_pattern !== null && !new RegExp(series.allowed_pattern).test(sample)) throw new NumberingError(`"${sample}" contains characters this series does not allow`);
  await tx.updateTable("kernel.number_series").set({ pattern }).where("id", "=", seriesId).execute();
}

/** Continue from a legacy system's last number at go-live (ADR-0029 migration rule). */
export async function seedCounter(tx: Tx, seriesId: string, periodKeyValue: string, lastValue: bigint): Promise<void> {
  await sql`insert into kernel.number_counter (series_id, period_key, last_value) values (${seriesId}, ${periodKeyValue}, ${lastValue.toString()})
    on conflict (series_id, period_key) do update set last_value = greatest(kernel.number_counter.last_value, excluded.last_value)`.execute(tx);
}
