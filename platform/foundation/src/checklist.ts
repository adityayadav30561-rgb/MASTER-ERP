/** Foundation's onboarding checklist items (Step 5A §6): masters a business needs before its first order. */
import { sql } from "kysely";
import type { Tx } from "@master-erp/kernel/db";
import type { ChecklistItem } from "@master-erp/kernel/onboarding";

const hasPartyRole = (role: string) => async (tx: Tx) => Boolean(await tx.selectFrom("foundation.party_role").select(sql`1`.as("x")).where("role", "=", role).executeTakeFirst());

export const FOUNDATION_CHECKLIST: readonly ChecklistItem[] = [
  { key: "masters.customers", area: "masters", label: "Import or add your customers", help: "Download the Excel template, fill it, upload it.", check: hasPartyRole("customer") },
  { key: "masters.vendors", area: "masters", label: "Import or add your vendors", check: hasPartyRole("vendor") },
  {
    key: "masters.items",
    area: "masters",
    label: "Import or add your items (paper, board, ink, products)",
    check: async (tx) => Boolean(await tx.selectFrom("foundation.item").select("id").executeTakeFirst()),
  },
];
