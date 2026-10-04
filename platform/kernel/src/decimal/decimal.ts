/**
 * Exact decimal arithmetic for money, quantities, rates and percentages.
 *
 * ADR-0053 (decimal rule): these values never pass through JavaScript `number`.
 * - Input comes from strings (database NUMERIC, API/JSON, user input) or bigint.
 * - Addition, subtraction and multiplication are exact.
 * - Division and rounding always name their scale and rounding mode.
 *
 * The decimal library (big.js) is an implementation detail behind this class,
 * so it can be replaced without touching business code.
 */
import BigConstructor from "big.js";
import type { Big } from "big.js";

const B = BigConstructor();
B.strict = true; // big.js throws when given a `number` or asked for toNumber()
B.DP = 34; // default division precision; callers of div() always pass their own scale
B.RM = BigConstructor.roundHalfUp;
B.NE = -1e6; // never switch to exponent notation in output
B.PE = 1e6;

/**
 * Rounding modes, named for business people:
 * - `half-up`: 2.345 → 2.35, -2.345 → -2.35 (away from zero on a tie). GST and most invoices.
 * - `half-even`: 2.345 → 2.34, 2.355 → 2.36 (banker's rounding).
 * - `down`: towards zero (truncate). `up`: away from zero.
 * - `ceiling`: towards +∞. `floor`: towards −∞.
 */
export type RoundingMode = "half-up" | "half-even" | "down" | "up" | "ceiling" | "floor";

/** Canonical decimal text: optional minus, no leading zeros, no exponent, no plus sign. */
export const DECIMAL_PATTERN = "^-?(0|[1-9][0-9]*)(\\.[0-9]+)?$";
const DECIMAL_REGEX = new RegExp(DECIMAL_PATTERN);

/** PostgreSQL NUMERIC allows far more, but 18 integer digits is our documented business maximum (Step 8 §4). */
const MAX_INTEGER_DIGITS = 18;

export class DecimalError extends Error {
  override name = "DecimalError";
}

/** Business scales stay small: 2 for INR amounts, up to 6 for rates and quantities. */
const MAX_SCALE = 12;

function checkScale(scale: number): void {
  if (!Number.isInteger(scale) || scale < 0 || scale > MAX_SCALE) throw new DecimalError(`Invalid scale ${scale}`);
}

const truncatingConstructors = new Map<number, typeof B>();

/** A big.js constructor whose division truncates at `scale` digits (big.js keeps settings per constructor). */
function truncatingConstructor(scale: number): typeof B {
  let C = truncatingConstructors.get(scale);
  if (!C) {
    C = BigConstructor();
    C.strict = true;
    C.DP = scale;
    C.RM = BigConstructor.roundDown;
    C.NE = B.NE;
    C.PE = B.PE;
    truncatingConstructors.set(scale, C);
  }
  return C;
}

export class Decimal {
  readonly #value: Big;

  private constructor(value: Big) {
    this.#value = value;
  }

  static readonly ZERO = new Decimal(B("0"));
  static readonly ONE = new Decimal(B("1"));
  static readonly HUNDRED = new Decimal(B("100"));

  /**
   * Parse canonical decimal text ("1234.50", "-0.125") or a bigint.
   * Rejects exponents, "+", spaces, thousands separators, "NaN" and `number`.
   */
  static from(value: string | bigint | Decimal): Decimal {
    if (value instanceof Decimal) return value;
    if (typeof value === "bigint") return Decimal.#checked(B(value.toString()), value.toString());
    if (typeof value !== "string") {
      throw new DecimalError("ADR-0053: decimals are created from strings or bigint, never from number");
    }
    if (!DECIMAL_REGEX.test(value)) throw new DecimalError(`Not a canonical decimal: "${value}"`);
    return Decimal.#checked(B(value), value);
  }

  /** Like from(), but returns undefined instead of throwing (for validating user input). */
  static tryFrom(value: string): Decimal | undefined {
    try {
      return Decimal.from(value);
    } catch {
      return undefined;
    }
  }

  static #checked(big: Big, original: string): Decimal {
    const integerDigits = big.abs().round(0, BigConstructor.roundDown).toFixed().replace(/^0$/, "").length;
    if (integerDigits > MAX_INTEGER_DIGITS) {
      throw new DecimalError(`More than ${MAX_INTEGER_DIGITS} integer digits: "${original}"`);
    }
    return new Decimal(big);
  }

  plus(other: Decimal | string): Decimal {
    return Decimal.#checked(this.#value.plus(Decimal.from(other).#value), "result of plus");
  }

  minus(other: Decimal | string): Decimal {
    return Decimal.#checked(this.#value.minus(Decimal.from(other).#value), "result of minus");
  }

  times(other: Decimal | string): Decimal {
    return Decimal.#checked(this.#value.times(Decimal.from(other).#value), "result of times");
  }

  /**
   * Division is never exact in general, so the caller states the scale and rounding mode.
   * The quotient is rounded exactly once, from the true remainder (no double rounding).
   */
  dividedBy(other: Decimal | string, scale: number, mode: RoundingMode): Decimal {
    checkScale(scale);
    const divisor = Decimal.from(other).#value;
    if (divisor.eq("0")) throw new DecimalError("Division by zero");
    const dividend = this.#value;
    const truncated = truncatingConstructor(scale)(dividend).div(divisor); // rounded towards zero
    const quotient = B(truncated);
    const remainder = dividend.minus(quotient.times(divisor));
    if (remainder.eq("0")) return Decimal.#checked(quotient, "result of dividedBy");
    const positive = dividend.lt("0") === divisor.lt("0");
    // True quotient = quotient + remainder/divisor. Compare that tail with half a unit of the last place.
    const unitOfLastPlace = B("1e-" + scale);
    const half = remainder.abs().times(B("2")).cmp(divisor.abs().times(unitOfLastPlace)); // -1 below, 0 tie, 1 above
    const lastDigitOdd = quotient.abs().times(B("1e" + scale)).mod(B("2")).eq("1");
    const awayFromZero = ((): boolean => {
      switch (mode) {
        case "down":
          return false;
        case "up":
          return true;
        case "half-up":
          return half >= 0;
        case "half-even":
          return half > 0 || (half === 0 && lastDigitOdd);
        case "ceiling":
          return positive;
        case "floor":
          return !positive;
      }
    })();
    if (!awayFromZero) return Decimal.#checked(quotient, "result of dividedBy");
    const unit = unitOfLastPlace.times(positive ? B("1") : B("-1"));
    return Decimal.#checked(quotient.plus(unit), "result of dividedBy");
  }

  round(scale: number, mode: RoundingMode): Decimal {
    checkScale(scale);
    const negative = this.#value.lt("0");
    const rm = (() => {
      switch (mode) {
        case "half-up":
          return BigConstructor.roundHalfUp;
        case "half-even":
          return BigConstructor.roundHalfEven;
        case "down":
          return BigConstructor.roundDown;
        case "up":
          return BigConstructor.roundUp;
        case "ceiling":
          return negative ? BigConstructor.roundDown : BigConstructor.roundUp;
        case "floor":
          return negative ? BigConstructor.roundUp : BigConstructor.roundDown;
      }
    })();
    return new Decimal(this.#value.round(scale, rm));
  }

  negated(): Decimal {
    return new Decimal(this.#value.times(B("-1")));
  }

  abs(): Decimal {
    return new Decimal(this.#value.abs());
  }

  compare(other: Decimal | string): -1 | 0 | 1 {
    return this.#value.cmp(Decimal.from(other).#value) as -1 | 0 | 1;
  }

  equals(other: Decimal | string): boolean {
    return this.compare(other) === 0;
  }

  lessThan(other: Decimal | string): boolean {
    return this.compare(other) < 0;
  }

  greaterThan(other: Decimal | string): boolean {
    return this.compare(other) > 0;
  }

  isZero(): boolean {
    return this.#value.eq("0");
  }

  isNegative(): boolean {
    return this.#value.lt("0");
  }

  /** Number of digits after the decimal point, ignoring trailing zeros ("1.50" → 1). */
  scale(): number {
    return this.#value.toFixed().split(".")[1]?.length ?? 0;
  }

  /**
   * Canonical text. With `minScale`, pads with zeros ("1.5" → "1.50") but never rounds:
   * if the value has more digits than `minScale`, all of them are kept.
   */
  toString(minScale = 0): string {
    const text = this.#value.toFixed();
    return this.scale() >= minScale ? text : this.#value.toFixed(minScale);
  }

  /** JSON carries decimals as strings ("12345.50"), never as numbers (ADR-0053). */
  toJSON(): string {
    return this.toString();
  }

  static sum(values: readonly (Decimal | string)[]): Decimal {
    return values.reduce<Decimal>((total, v) => total.plus(v), Decimal.ZERO);
  }

  static max(a: Decimal, b: Decimal): Decimal {
    return a.compare(b) >= 0 ? a : b;
  }

  static min(a: Decimal, b: Decimal): Decimal {
    return a.compare(b) <= 0 ? a : b;
  }
}
