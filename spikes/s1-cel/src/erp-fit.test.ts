/**
 * Spike S1 — ERP fit: the expressions we will actually write (ADR-0028), exact decimals, and sandbox limits.
 */
import { describe, expect, it } from "vitest";
import * as buf from "@bufbuild/cel";
import * as marc from "@marcbachmann/cel-js";
import { Decimal } from "@master-erp/kernel/decimal";
import { collect, score } from "./conformance.ts";

/** A purchase order as the rules engine sees it: plain data, decimals as text (ADR-0053). */
const po = {
  doc: {
    type: "purchase_order",
    total: "64250.50",
    currency: "INR",
    site: "BHIWANDI",
    lines: [
      { item: "BOARD-300", category: "paper", qty: "630.5", rate: "92.75" },
      { item: "INK-CYAN", category: "ink", qty: "12", rate: "450" },
    ],
    created_at: "2026-10-04T10:15:00Z",
  },
  party: { name: "Shree Papers", credit_days: 45n, msme: true, gstin: "27AAACS1234A1Z5" },
  user: { roles: ["purchase_manager"], sites: ["BHIWANDI", "THANE"] },
};

/** Expressions shaped like our configuration: approvals, record conditions, validations. */
const expressions: [string, string, boolean][] = [
  ["approval: big PO", "doc.total > decimal('50000')", true],
  ["approval: big PO, plain literal", "doc.total > 50000", true],
  ["approval: boundary is exact", "doc.total >= decimal('64250.50') && doc.total < decimal('64250.51')", true],
  ["approval: MSME vendor + long credit", "party.msme && party.credit_days > 45", false],
  ["record rule: own sites only", "doc.site in user.sites", true],
  ["record rule: role check", "'purchase_manager' in user.roles", true],
  ["validation: GSTIN format", "party.gstin.matches('^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$')", true],
  ["validation: every line has qty > 0", "doc.lines.all(l, l.qty > decimal('0'))", true],
  ["condition: any ink line", "doc.lines.exists(l, l.category == 'ink')", true],
  ["condition: count paper lines", "size(doc.lines.filter(l, l.category == 'paper')) == 1", true],
  ["condition: line value exact", "doc.lines[0].qty * doc.lines[0].rate == decimal('58478.875')", true],
  ["condition: date", "timestamp(doc.created_at) > timestamp('2026-04-01T00:00:00Z')", true],
  ["condition: missing field is safe", "has(doc.discount) ? doc.discount > decimal('0') : true", true],
];

/** @marcbachmann/cel-js with an exact `decimal` type backed by the kernel Decimal. */
function marcEnvironment() {
  const env = new marc.Environment({
    unlistedVariablesAreDyn: true,
    limits: { maxAstNodes: 500, maxDepth: 30, maxListElements: 200, maxMapEntries: 200, maxCallArguments: 8 },
  });
  env.registerType("decimal", Decimal);
  env.registerFunction("decimal(string): decimal", (s: string) => Decimal.from(s));
  for (const op of [">", ">=", "<", "<=", "=="] as const) { // "!=" is derived from "=="
    const cmp = (a: Decimal, b: Decimal) => {
      const c = a.compare(b);
      return op === ">" ? c > 0 : op === ">=" ? c >= 0 : op === "<" ? c < 0 : op === "<=" ? c <= 0 : c === 0;
    };
    env.registerOperator(`decimal ${op} decimal`, cmp);
    env.registerOperator(`decimal ${op} int`, (a: Decimal, b: bigint) => cmp(a, Decimal.from(b)));
  }
  env.registerOperator("decimal + decimal", (a: Decimal, b: Decimal) => a.plus(b));
  env.registerOperator("decimal - decimal", (a: Decimal, b: Decimal) => a.minus(b));
  env.registerOperator("decimal * decimal", (a: Decimal, b: Decimal) => a.times(b));
  return env;
}

/** Convert decimal-text fields to Decimal for the marc environment (the real version uses field metadata). */
function withDecimals(): Record<string, unknown> {
  const dec = (s: string) => Decimal.from(s);
  return {
    ...po,
    doc: { ...po.doc, total: dec(po.doc.total), lines: po.doc.lines.map((l) => ({ ...l, qty: dec(l.qty), rate: dec(l.rate) })) },
  };
}

describe("S1 conformance gate", () => {
  it("chosen library passes ≥ 85% of the applicable official conformance tests", () => {
    const { applicable } = collect();
    const core = applicable.filter((c) => !/_ext$|^optionals$|^macros2$/.test(c.section));
    const marcScore = score("marc", core);
    const bufScore = score("buf", core);
    console.log(`[S1] core conformance: @bufbuild/cel ${bufScore.passed}/${bufScore.total}, @marcbachmann/cel-js ${marcScore.passed}/${marcScore.total}`);
    expect(marcScore.passed / marcScore.total).toBeGreaterThan(0.85);
  });
});

describe("S1 ERP expressions — @marcbachmann/cel-js with exact decimals", () => {
  const env = marcEnvironment();
  const context = withDecimals();
  it.each(expressions)("%s", (_name, expr, expected) => {
    expect(env.evaluate(expr, context)).toBe(expected);
  });

  it("decimal arithmetic is exact (0.1 + 0.2 == 0.3)", () => {
    expect(env.evaluate("decimal('0.1') + decimal('0.2') == decimal('0.3')", {})).toBe(true);
    expect(marc.evaluate("0.1 + 0.2 == 0.3")).toBe(false); // plain CEL doubles are not
  });

  it("rejects oversized and over-nested expressions at parse time", () => {
    const huge = Array.from({ length: 300 }, (_, i) => `x == ${i}`).join(" || ");
    expect(() => env.parse(huge)).toThrow();
    const deep = "(".repeat(40) + "1" + ")".repeat(40);
    expect(() => env.parse(deep)).toThrow();
  });

  it("type-checks before saving a rule (typo in a function name is caught early)", () => {
    expect(() => env.evaluate("doc.total > decimall('5')", withDecimals())).toThrow();
  });

  it("has no I/O, loops or side effects: a comprehension over a 200-element list finishes fast", () => {
    const list = Array.from({ length: 200 }, (_, i) => BigInt(i));
    const start = performance.now();
    env.evaluate("xs.all(a, xs.all(b, a + b >= 0))", { xs: list }); // 40,000 steps, no short-circuit
    const ms = performance.now() - start;
    console.log(`[S1] nested comprehension over 200×200: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(500);
  });

  it("evaluates a parsed rule fast enough for list screens (per-row record rules)", () => {
    const rule = env.parse("doc.site in user.sites && doc.total > decimal('50000')");
    const start = performance.now();
    for (let i = 0; i < 10_000; i++) rule(context);
    const perEval = ((performance.now() - start) / 10_000) * 1000;
    console.log(`[S1] parsed rule: ${perEval.toFixed(2)} µs per evaluation`);
    expect(perEval).toBeLessThan(100);
  });
});

describe("S1 ERP expressions — @bufbuild/cel (no custom types without protobuf)", () => {
  /** Without a decimal type, decimals must cross as double: exact for comparisons of ≤ 15 significant digits only. */
  const asDouble = {
    ...po,
    doc: { ...po.doc, total: 64250.5, lines: po.doc.lines.map((l) => ({ ...l, qty: Number(l.qty), rate: Number(l.rate) })) },
  };
  const run = (expr: string) => {
    const r = buf.run(expr, asDouble as never);
    if (buf.isCelError(r)) throw new Error(r.message);
    return r;
  };
  it("handles the non-decimal expressions", () => {
    expect(run("party.msme && party.credit_days > 45")).toBe(false);
    expect(run("doc.site in user.sites")).toBe(true);
    expect(run("doc.lines.exists(l, l.category == 'ink')")).toBe(true);
    expect(run("timestamp(doc.created_at) > timestamp('2026-04-01T00:00:00Z')")).toBe(true);
  });
  it("cannot do exact money arithmetic: 630.5 × 92.75 as doubles", () => {
    expect(run("doc.lines[0].qty * doc.lines[0].rate == 58478.875")).toBe(true); // happens to be exact here…
    expect(run("0.1 + 0.2 == 0.3")).toBe(false); // …but not in general
  });
});
