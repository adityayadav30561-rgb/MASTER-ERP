import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Ajv2020 } from "ajv/dist/2020.js";
import { Decimal, DecimalError, Money, Percent, Quantity, MoneySchema, formatMoney, formatDecimal } from "./index.ts";

const d = (s: string) => Decimal.from(s);

/** Arbitrary canonical decimal strings with up to 12 integer and 6 fraction digits. */
const decimalText = fc
  .tuple(fc.boolean(), fc.bigInt({ min: 0n, max: 999_999_999_999n }), fc.option(fc.bigInt({ min: 0n, max: 999_999n }), { nil: undefined }))
  .map(([neg, int, frac]) => {
    const text = frac === undefined ? int.toString() : `${int}.${frac.toString().padStart(6, "0")}`;
    return neg && text !== "0" && !/^0(\.0+)?$/.test(text) ? `-${text}` : text;
  });

describe("Decimal — parsing (ADR-0053)", () => {
  it("accepts canonical text and bigint", () => {
    expect(d("1234.50").toString()).toBe("1234.5");
    expect(d("-0.125").toString()).toBe("-0.125");
    expect(Decimal.from(10n).toString()).toBe("10");
  });

  it.each(["1e3", "+1", " 1", "1,000", "01", "1.", ".5", "NaN", "Infinity", "", "--1"])("rejects %j", (bad) => {
    expect(() => d(bad)).toThrow(DecimalError);
  });

  it("refuses JavaScript numbers", () => {
    expect(() => Decimal.from(0.1 as unknown as string)).toThrow(/never from number/);
  });

  it("limits integer digits to 18", () => {
    expect(d("999999999999999999.99").toString()).toBe("999999999999999999.99");
    expect(() => d("1000000000000000000")).toThrow(/18 integer digits/);
  });

  it("is exact where floating point is not", () => {
    expect(d("0.1").plus("0.2").toString()).toBe("0.3"); // 0.1 + 0.2 = 0.30000000000000004 in JS
    expect(d("1.005").round(2, "half-up").toString()).toBe("1.01"); // (1.005).toFixed(2) === "1.00" in JS
    expect(d("123456789012345.67").times("3").toString()).toBe("370370367037037.01");
  });
});

describe("Decimal — rounding modes", () => {
  const cases: [string, Parameters<Decimal["round"]>[1], string][] = [
    ["2.345", "half-up", "2.35"],
    ["-2.345", "half-up", "-2.35"],
    ["2.345", "half-even", "2.34"],
    ["2.355", "half-even", "2.36"],
    ["2.349", "down", "2.34"],
    ["2.341", "up", "2.35"],
    ["-2.341", "ceiling", "-2.34"],
    ["-2.341", "floor", "-2.35"],
    ["2.341", "ceiling", "2.35"],
  ];
  it.each(cases)("%s %s → %s", (value, mode, expected) => {
    expect(d(value).round(2, mode).toString()).toBe(expected);
  });

  it("divides with one exact rounding", () => {
    expect(d("1").dividedBy("3", 4, "half-up").toString()).toBe("0.3333");
    expect(d("2").dividedBy("3", 2, "half-up").toString()).toBe("0.67");
    expect(d("-2").dividedBy("3", 2, "down").toString()).toBe("-0.66");
    expect(d("0.125").dividedBy("1", 2, "half-even").toString()).toBe("0.12");
    expect(d("0.135").dividedBy("1", 2, "half-even").toString()).toBe("0.14");
    expect(d("1").dividedBy("-8", 2, "floor").toString()).toBe("-0.13");
    expect(() => d("1").dividedBy("0", 2, "half-up")).toThrow(/zero/);
  });

  it("property: dividedBy agrees with exact rational rounding (half-up)", () => {
    fc.assert(
      fc.property(decimalText, decimalText, fc.integer({ min: 0, max: 6 }), (a, b, scale) => {
        fc.pre(!d(b).isZero());
        const q = d(a).dividedBy(b, scale, "half-up");
        // |a - q*b| must be at most half a unit of the last place times |b|.
        const unit = d("1").dividedBy("1" + "0".repeat(scale), scale, "down");
        const error = d(a).minus(q.times(b)).abs();
        return !error.times("2").greaterThan(unit.times(d(b).abs()));
      }),
      { numRuns: 2000 },
    );
  });
});

describe("Decimal — algebraic properties", () => {
  it("addition is exact, commutative and associative", () => {
    fc.assert(
      fc.property(decimalText, decimalText, decimalText, (a, b, c) => {
        const left = d(a).plus(b).plus(c);
        const right = d(a).plus(d(b).plus(c));
        return left.equals(right) && d(a).plus(b).equals(d(b).plus(a)) && d(a).plus(b).minus(b).equals(d(a));
      }),
      { numRuns: 2000 },
    );
  });

  it("text round-trips", () => {
    fc.assert(fc.property(decimalText, (a) => d(d(a).toString()).equals(d(a))), { numRuns: 2000 });
  });
});

describe("Money", () => {
  it("pads to the currency scale but never silently rounds", () => {
    expect(Money.of("1234.5", "INR").toString()).toBe("1234.50");
    expect(Money.of("1234.567", "INR").toString()).toBe("1234.567");
    expect(Money.of("1234.567", "INR").isRounded()).toBe(false);
    expect(Money.of("1234.567", "INR").round("half-up").toString()).toBe("1234.57");
    expect(Money.of("100", "JPY").toString()).toBe("100");
  });

  it("refuses to mix currencies", () => {
    expect(() => Money.of("1", "INR").plus(Money.of("1", "USD"))).toThrow(/Currency mismatch/);
  });

  it("serialises amounts as strings", () => {
    expect(JSON.stringify(Money.of("10", "INR"))).toBe('{"amount":"10.00","currency":"INR"}');
  });

  it("allocates freight so the parts add up exactly", () => {
    const parts = Money.of("100", "INR").allocate(["1", "1", "1"]);
    expect(parts.map(String)).toEqual(["33.34", "33.33", "33.33"]);
    const negative = Money.of("-100", "INR").allocate(["1", "1", "1"]);
    expect(negative.map(String)).toEqual(["-33.34", "-33.33", "-33.33"]);
  });

  it("property: allocation always sums to the rounded total", () => {
    fc.assert(
      fc.property(
        decimalText,
        fc.array(fc.bigInt({ min: 0n, max: 100_000n }), { minLength: 1, maxLength: 20 }),
        (amount, weights) => {
          fc.pre(weights.some((w) => w > 0n));
          const money = Money.of(amount, "INR");
          const parts = money.allocate(weights.map(String));
          return Money.sum(parts, "INR").equals(money.round("half-up")) && parts.every((p) => p.isRounded());
        },
      ),
      { numRuns: 1000 },
    );
  });
});

describe("Quantity", () => {
  it("adds only the same unit and converts with an explicit factor", () => {
    const a = Quantity.of("630.5", "KGM");
    expect(a.plus(Quantity.of("0.25", "KGM")).toString()).toBe("630.75 KGM");
    expect(() => a.plus(Quantity.of("1", "NOS"))).toThrow(/UOM mismatch/);
    // 1 ream = 500 sheets
    expect(Quantity.of("12", "REAM").convert("SHEET", "500", 0).toString()).toBe("6000 SHEET");
  });
});

describe("Percent", () => {
  it("computes exact shares", () => {
    expect(Percent.of("18").of(Money.of("1234.567", "INR")).toString()).toBe("222.22206");
    expect(Percent.of("18").half().toString()).toBe("9");
    expect(Percent.of("0.25").half().toString()).toBe("0.125");
  });
});

describe("JSON Schema contract (ADR-0057)", () => {
  const ajv = new Ajv2020({ strict: true }); // JSON Schema 2020-12
  const validate = ajv.compile(MoneySchema);
  it("accepts decimal strings and rejects JSON numbers", () => {
    expect(validate({ amount: "12345.50", currency: "INR" })).toBe(true);
    expect(validate({ amount: 12345.5, currency: "INR" })).toBe(false);
    expect(validate({ amount: "1e5", currency: "INR" })).toBe(false);
    expect(validate({ amount: "10", currency: "inr" })).toBe(false);
  });
});

describe("Display formatting (en-IN)", () => {
  it("uses lakh/crore grouping without losing digits", () => {
    expect(formatMoney(Money.of("12345678.9", "INR"))).toBe("₹1,23,45,678.90");
    expect(formatMoney(Money.of("999999999999999999.99", "INR"))).toBe("₹9,99,99,99,99,99,99,99,999.99");
    expect(formatMoney(Money.of("10.125", "INR"))).toBe("₹10.125");
    expect(formatDecimal(d("1234.5"), "en-IN", 2, 2)).toBe("1,234.50");
  });
});

describe("Decimal — division against a BigInt oracle", () => {
  /** "12.345" → { n: 12345n, s: 3 } */
  const toRational = (text: string) => {
    const [i = "0", f = ""] = text.replace("-", "").split(".");
    const n = BigInt(i + f) * (text.startsWith("-") ? -1n : 1n);
    return { n, s: f.length };
  };
  const oracle = (a: string, b: string, scale: number, mode: Parameters<Decimal["round"]>[1]): string => {
    const x = toRational(a);
    const y = toRational(b);
    // a/b * 10^scale = (x.n * 10^(y.s + scale)) / (y.n * 10^x.s)
    let num = x.n * 10n ** BigInt(y.s + scale);
    let den = y.n * 10n ** BigInt(x.s);
    if (den < 0n) {
      num = -num;
      den = -den;
    }
    const positive = num >= 0n;
    const absNum = positive ? num : -num;
    let q = absNum / den;
    const r = absNum % den;
    const twice = 2n * r;
    const bump =
      r !== 0n &&
      (mode === "up" ||
        (mode === "half-up" && twice >= den) ||
        (mode === "half-even" && (twice > den || (twice === den && q % 2n === 1n))) ||
        (mode === "ceiling" && positive) ||
        (mode === "floor" && !positive));
    if (bump) q += 1n;
    const signed = positive ? q : -q;
    const digits = (signed < 0n ? -signed : signed).toString().padStart(scale + 1, "0");
    const text = scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
    return Decimal.from((signed < 0n ? "-" : "") + text).toString();
  };

  it.each(["half-up", "half-even", "down", "up", "ceiling", "floor"] as const)("mode %s", (mode) => {
    fc.assert(
      fc.property(decimalText, decimalText, fc.integer({ min: 0, max: 6 }), (a, b, scale) => {
        fc.pre(!d(b).isZero());
        return d(a).dividedBy(b, scale, mode).toString() === oracle(a, b, scale, mode);
      }),
      { numRuns: 3000 },
    );
  });

  it("matches the oracle on exact ties", () => {
    for (const mode of ["half-up", "half-even", "down", "up", "ceiling", "floor"] as const) {
      for (const [a, b] of [["1", "8"], ["-1", "8"], ["5", "200"], ["-25", "1000"], ["15", "4"]] as const) {
        expect(d(a).dividedBy(b, 2, mode).toString()).toBe(oracle(a, b, 2, mode));
      }
    }
  });
});
