import { describe, expect, it } from "vitest";
import { Decimal } from "../decimal/index.ts";
import { RuleEngine, RuleError, toFacts } from "./index.ts";

const engine = new RuleEngine();
const DEC = new Set(["total", "qty", "rate", "discount"]);
const po = toFacts(
  {
    doc: {
      total: "64250.50",
      state: "submitted",
      site: "BHIWANDI",
      lines: [
        { category: "paper", qty: "630.5", rate: "92.75" },
        { category: "ink", qty: "12", rate: "450" },
      ],
    },
    party: { msme: true, credit_days: 45, gstin: "27AAACS1234A1Z5" },
    user: { roles: ["purchase_manager"], sites: ["BHIWANDI", "THANE"] },
  },
  DEC,
) as Record<string, unknown>;

describe("rules engine (CEL with exact decimals, ADR-0068)", () => {
  it.each([
    ["doc.total > 50000", true],
    ["50000 < doc.total", true],
    ["doc.total >= decimal('64250.50') && doc.total < decimal('64250.51')", true],
    ["party.msme && party.credit_days > 45", false],
    ["doc.site in user.sites && 'purchase_manager' in user.roles", true],
    ["doc.state in ['draft', 'submitted']", true],
    ["party.gstin.matches('^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$')", true],
    ["doc.lines.all(l, l.qty > 0)", true],
    ["doc.lines.exists(l, l.category == 'ink')", true],
    ["doc.lines[0].qty * doc.lines[0].rate == decimal('58478.875')", true],
    ["round(doc.lines[0].qty * doc.lines[0].rate, 2) == decimal('58478.88')", true],
    ["has(doc.discount) ? doc.discount > 0 : true", true],
    ["decimal('0.1') + decimal('0.2') == decimal('0.3')", true],
  ])("%s → %s", (expression, expected) => {
    expect(engine.compile(expression).test(po)).toBe(expected);
  });

  it("returns exact decimals from computed expressions", () => {
    const v = engine.compile("doc.lines[1].qty * doc.lines[1].rate + doc.lines[0].qty * doc.lines[0].rate").evaluate(po);
    expect(v).toBeInstanceOf(Decimal);
    expect((v as Decimal).toString()).toBe("63878.875");
  });

  it("rejects bad expressions when configuration is saved, not at run time", () => {
    expect(() => engine.compile("doc.total >")).toThrow(RuleError);
    expect(() => engine.compile("doc.total > decimall('5')")).toThrow(RuleError);
    expect(() => engine.validateCondition("1 + 2")).toThrow(/must be true\/false/);
    expect(() => engine.compile("x".repeat(2001))).toThrow(/longer than/);
    expect(() => engine.compile(Array.from({ length: 300 }, (_, i) => `x == ${i}`).join(" || "))).toThrow(RuleError);
  });

  it("refuses non-boolean condition results instead of treating them as false", () => {
    expect(() => engine.compile("doc.state").test(po)).toThrow(/expected true or false/);
  });

  it("refuses fractional JavaScript numbers in facts (ADR-0053)", () => {
    expect(() => toFacts({ total: 12.5 })).toThrow(/Fractional/);
    expect(toFacts({ days: 45 })).toEqual({ days: 45n });
  });

  it("caches compiled rules", () => {
    expect(engine.compile("doc.total > 50000")).toBe(engine.compile("doc.total > 50000"));
  });
});
