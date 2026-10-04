import { Decimal } from "./decimal.ts";
import type { Money } from "./money.ts";

/** A percentage such as an 18% GST rate or a 2.5% discount, stored as "18" or "2.5". */
export class Percent {
  readonly value: Decimal;

  private constructor(value: Decimal) {
    this.value = value;
  }

  static of(value: Decimal | string): Percent {
    return new Percent(Decimal.from(value));
  }

  /** Exact (unrounded) share of an amount: 18% of 1234.567 = 222.22206. */
  of(amount: Money): Money {
    return amount.times(this.value).dividedBy(Decimal.HUNDRED, 12, "half-up");
  }

  /** Half of the rate, e.g. CGST 9% and SGST 9% from GST 18%. Exact for rates with ≤ 11 decimals. */
  half(): Percent {
    return new Percent(this.value.dividedBy("2", 12, "half-up"));
  }

  toString(): string {
    return this.value.toString();
  }

  toJSON(): string {
    return this.value.toString();
  }
}
