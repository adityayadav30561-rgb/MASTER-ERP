/**
 * Stock posting with ordered pessimistic locks (ADR-0050).
 * - Lock every affected balance row in a fixed order (item, warehouse) → no deadlocks between postings.
 * - Check availability under the lock → stock can never go negative, even with many users at once.
 * - Append ledger rows, update balances and enqueue the "stock.posted" job in ONE transaction.
 */
import { sql } from "kysely";
import { Decimal, Money } from "@master-erp/kernel/decimal";
import { enqueueJob, withTenant } from "./db.ts";
import type { Db } from "./db.ts";

export interface StockMovement {
  itemCode: string;
  warehouseCode: string;
  quantity: string; // positive = receipt, negative = issue
  value: string; // valuation effect in INR, same sign as quantity
}

export class InsufficientStockError extends Error {
  override name = "InsufficientStockError";
}

export async function postStockDocument(db: Db, tenantId: string, documentRef: string, movements: readonly StockMovement[]): Promise<void> {
  const ordered = [...movements].sort((a, b) =>
    a.itemCode === b.itemCode ? a.warehouseCode.localeCompare(b.warehouseCode) : a.itemCode.localeCompare(b.itemCode),
  );
  await withTenant(db, tenantId, async (tx) => {
    for (const m of ordered) {
      // Make sure the balance row exists, then lock it.
      await tx
        .insertInto("s3_inventory.stock_balance")
        .values({ item_code: m.itemCode, warehouse_code: m.warehouseCode })
        .onConflict((oc) => oc.doNothing())
        .execute();
      const balance = await tx
        .selectFrom("s3_inventory.stock_balance")
        .select(["quantity", "value"])
        .where("item_code", "=", m.itemCode)
        .where("warehouse_code", "=", m.warehouseCode)
        .forUpdate()
        .executeTakeFirstOrThrow();

      const newQuantity = Decimal.from(balance.quantity).plus(m.quantity);
      if (newQuantity.isNegative()) {
        throw new InsufficientStockError(`${m.itemCode}@${m.warehouseCode}: have ${balance.quantity}, need ${Decimal.from(m.quantity).abs().toString()}`);
      }
      const newValue = Money.of(balance.value, "INR").plus(Money.of(m.value, "INR"));

      await tx
        .insertInto("s3_inventory.stock_ledger")
        .values({ item_code: m.itemCode, warehouse_code: m.warehouseCode, quantity: m.quantity, value: m.value, document_ref: documentRef })
        .execute();
      await tx
        .updateTable("s3_inventory.stock_balance")
        .set({ quantity: newQuantity.toString(), value: newValue.toString(), version: sql<number>`version + 1` })
        .where("item_code", "=", m.itemCode)
        .where("warehouse_code", "=", m.warehouseCode)
        .execute();
    }
    await enqueueJob(tx, "stock_posted", { document_ref: documentRef, lines: movements.length });
  });
}
