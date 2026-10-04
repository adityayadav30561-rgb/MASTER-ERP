import { currencyScale } from "./currency.ts";
import type { CurrencyCode } from "./currency.ts";
import { Decimal, DecimalError } from "./decimal.ts";
import type { RoundingMode } from "./decimal.ts";

/**
 * An amount in one currency. Intermediate results keep full precision
 * (e.g. 18% of ₹1,234.567); rounding to paise happens only where a rule says so.
 */
export class Money {
  readonly amount: Decimal;
  readonly currency: CurrencyCode;

  private constructor(amount: Decimal, currency: CurrencyCode) {
    currencyScale(currency); // validates the code
    this.amount = amount;
    this.currency = currency;
  }

  static of(amount: Decimal | string | bigint, currency: CurrencyCode): Money {
    return new Money(Decimal.from(amount), currency);
  }

  static zero(currency: CurrencyCode): Money {
    return new Money(Decimal.ZERO, currency);
  }

  #same(other: Money): void {
    if (other.currency !== this.currency) {
      throw new DecimalError(`Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }

  plus(other: Money): Money {
    this.#same(other);
    return new Money(this.amount.plus(other.amount), this.currency);
  }

  minus(other: Money): Money {
    this.#same(other);
    return new Money(this.amount.minus(other.amount), this.currency);
  }

  /** Multiply by a plain factor (a quantity value, a conversion factor). */
  times(factor: Decimal | string): Money {
    return new Money(this.amount.times(factor), this.currency);
  }

  dividedBy(divisor: Decimal | string, scale: number, mode: RoundingMode): Money {
    return new Money(this.amount.dividedBy(divisor, scale, mode), this.currency);
  }

  /** Round to the currency's minor unit (paise for INR), or to another scale (e.g. 0 for invoice round-off). */
  round(mode: RoundingMode, scale = currencyScale(this.currency)): Money {
    return new Money(this.amount.round(scale, mode), this.currency);
  }

  negated(): Money {
    return new Money(this.amount.negated(), this.currency);
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  isNegative(): boolean {
    return this.amount.isNegative();
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount.equals(other.amount);
  }

  compare(other: Money): -1 | 0 | 1 {
    this.#same(other);
    return this.amount.compare(other.amount);
  }

  /** True when the amount has no digits beyond the currency's minor unit. */
  isRounded(): boolean {
    return this.amount.scale() <= currencyScale(this.currency);
  }

  /** "1234.50" — padded to the currency scale, never silently rounded. */
  toString(): string {
    return this.amount.toString(currencyScale(this.currency));
  }

  toJSON(): { amount: string; currency: CurrencyCode } {
    return { amount: this.toString(), currency: this.currency };
  }

  static sum(values: readonly Money[], currency: CurrencyCode): Money {
    return values.reduce((total, v) => total.plus(v), Money.zero(currency));
  }

  /**
   * Split an amount into parts proportional to `weights` so that the rounded parts
   * add up to exactly the (rounded) total — the largest-remainder method.
   * Used for freight/discount apportioning and CGST/SGST style splits.
   */
  allocate(weights: readonly (Decimal | string)[], mode: RoundingMode = "half-up"): Money[] {
    if (weights.length === 0) throw new DecimalError("allocate() needs at least one weight");
    const w = weights.map((x) => Decimal.from(x));
    if (w.some((x) => x.isNegative())) throw new DecimalError("allocate() weights must not be negative");
    const totalWeight = Decimal.sum(w);
    if (totalWeight.isZero()) throw new DecimalError("allocate() weights must not all be zero");

    const scale = currencyScale(this.currency);
    const total = this.amount.round(scale, mode);
    const unit = Decimal.from("1").dividedBy(Decimal.from("1" + "0".repeat(scale)), scale, "down");
    const sign = total.isNegative() ? "-1" : "1";
    const magnitude = total.abs();

    // Exact share, its truncation to the minor unit, and what was cut off.
    const shares = w.map((weight, index) => {
      const exactTimesWeight = magnitude.times(weight);
      const truncated = exactTimesWeight.dividedBy(totalWeight, scale, "down");
      const remainder = exactTimesWeight.minus(truncated.times(totalWeight)); // compared without dividing
      return { index, truncated, remainder };
    });
    let leftover = magnitude.minus(Decimal.sum(shares.map((s) => s.truncated)));
    // Hand out the remaining minor units to the largest remainders (ties: earlier line first).
    const order = [...shares].sort((a, b) => b.remainder.compare(a.remainder) || a.index - b.index);
    const result = shares.map((s) => s.truncated);
    for (const s of order) {
      if (!leftover.greaterThan("0")) break;
      result[s.index] = (result[s.index] ?? Decimal.ZERO).plus(unit);
      leftover = leftover.minus(unit);
    }
    return result.map((part) => new Money(part.times(sign), this.currency));
  }
}
