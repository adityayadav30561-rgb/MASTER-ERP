import { Decimal, DecimalError } from "./decimal.ts";
import type { RoundingMode } from "./decimal.ts";

/**
 * A quantity in a unit of measure (UOM), e.g. 630.5 kg of paper or 5,000 sheets.
 * Conversions use an explicit factor from the item's UOM table (Step 8 §4), never a guess.
 */
export class Quantity {
  readonly value: Decimal;
  readonly uom: string;

  private constructor(value: Decimal, uom: string) {
    if (!uom) throw new DecimalError("Quantity needs a unit of measure");
    this.value = value;
    this.uom = uom;
  }

  static of(value: Decimal | string | bigint, uom: string): Quantity {
    return new Quantity(Decimal.from(value), uom);
  }

  #same(other: Quantity): void {
    if (other.uom !== this.uom) throw new DecimalError(`UOM mismatch: ${this.uom} vs ${other.uom}`);
  }

  plus(other: Quantity): Quantity {
    this.#same(other);
    return new Quantity(this.value.plus(other.value), this.uom);
  }

  minus(other: Quantity): Quantity {
    this.#same(other);
    return new Quantity(this.value.minus(other.value), this.uom);
  }

  times(factor: Decimal | string): Quantity {
    return new Quantity(this.value.times(factor), this.uom);
  }

  /** Convert with "1 <this.uom> = factor <targetUom>", rounded to the target UOM's scale. */
  convert(targetUom: string, factor: Decimal | string, scale: number, mode: RoundingMode = "half-up"): Quantity {
    return new Quantity(this.value.times(factor).round(scale, mode), targetUom);
  }

  round(scale: number, mode: RoundingMode): Quantity {
    return new Quantity(this.value.round(scale, mode), this.uom);
  }

  isNegative(): boolean {
    return this.value.isNegative();
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  compare(other: Quantity): -1 | 0 | 1 {
    this.#same(other);
    return this.value.compare(other.value);
  }

  toString(): string {
    return `${this.value.toString()} ${this.uom}`;
  }

  toJSON(): { value: string; uom: string } {
    return { value: this.value.toString(), uom: this.uom };
  }
}
