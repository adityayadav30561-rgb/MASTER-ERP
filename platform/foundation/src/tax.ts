/** Tax framework (Step 3): categories with effective-dated rates. The rules of a country (GST) live in its pack. */
import { Percent } from "@master-erp/kernel/decimal";
import { Decimal } from "@master-erp/kernel/decimal";
import type { Tx } from "@master-erp/kernel/db";
import { newId } from "@master-erp/kernel/ids";
import { ValidationError } from "@master-erp/kernel/metadata";

export interface TaxCategory {
  id: string;
  code: string;
  name: string;
  active: boolean;
  rates: { taxType: string; rate: string; validFrom: string }[];
}

export class TaxService {
  async createCategory(tx: Tx, input: { code: string; name: string; rates?: { taxType: string; rate: string; validFrom: string }[] }): Promise<string> {
    const errors = [];
    if (!/^[a-z0-9_]{1,30}$/.test(input.code)) errors.push({ field: "code", message: "use lowercase letters, digits or _" });
    if (!input.name.trim()) errors.push({ field: "name", message: "is required" });
    for (const [i, r] of (input.rates ?? []).entries()) {
      const d = Decimal.tryFrom(r.rate);
      if (!d || d.isNegative() || d.greaterThan("100")) errors.push({ field: `rates[${i}].rate`, message: "must be between 0 and 100" });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.validFrom)) errors.push({ field: `rates[${i}].validFrom`, message: "must be a date (YYYY-MM-DD)" });
    }
    if (errors.length) throw new ValidationError(errors);
    if (await tx.selectFrom("foundation.tax_category").select("id").where("code", "=", input.code).executeTakeFirst()) {
      throw new ValidationError([{ field: "code", message: `"${input.code}" already exists` }]);
    }
    const id = newId();
    await tx.insertInto("foundation.tax_category").values({ id, code: input.code, name: input.name }).execute();
    for (const r of input.rates ?? []) await this.addRate(tx, id, r);
    return id;
  }

  async addRate(tx: Tx, categoryId: string, r: { taxType: string; rate: string; validFrom: string }): Promise<void> {
    await tx.insertInto("foundation.tax_rate").values({ id: newId(), tax_category_id: categoryId, tax_type: r.taxType, rate: Decimal.from(r.rate).toString(), valid_from: r.validFrom }).execute();
  }

  async list(tx: Tx): Promise<TaxCategory[]> {
    const cats = await tx.selectFrom("foundation.tax_category").select(["id", "code", "name", "active"]).orderBy("code").execute();
    const rates = await tx.selectFrom("foundation.tax_rate").select(["tax_category_id", "tax_type", "rate", "valid_from"]).orderBy("valid_from").execute();
    return cats.map((c) => ({
      id: c.id as string,
      code: c.code as string,
      name: c.name as string,
      active: c.active as boolean,
      rates: rates.filter((r) => r.tax_category_id === c.id).map((r) => ({ taxType: r.tax_type as string, rate: Decimal.from(r.rate as string).toString(), validFrom: r.valid_from as string })),
    }));
  }

  /** The rate in force on a date (the latest valid_from on or before it). */
  async rateOn(tx: Tx, categoryId: string, date: string, taxType = "gst"): Promise<Percent | undefined> {
    const r = await tx
      .selectFrom("foundation.tax_rate")
      .select("rate")
      .where("tax_category_id", "=", categoryId)
      .where("tax_type", "=", taxType)
      .where("valid_from", "<=", date)
      .orderBy("valid_from", "desc")
      .limit(1)
      .executeTakeFirst();
    return r ? Percent.of(Decimal.from(r.rate as string)) : undefined;
  }
}
