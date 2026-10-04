/**
 * Onboarding checklist (Step 5A §6): what is still missing before go-live. Items are contributed by each layer
 * (kernel, foundation, modules). Most are derived from data, so the list is always true; review steps
 * ("numbering looks right") are confirmed by a person and stored.
 */
import { sql } from "kysely";
import type { Tx } from "../db/database.ts";

export type ChecklistArea = "organisation" | "users" | "configuration" | "masters" | "opening";

export interface ChecklistItem {
  key: string; // e.g. "users.invited"
  area: ChecklistArea;
  label: string;
  help?: string;
  /** Derived from data. Items without a check are confirmed by a person. */
  check?(tx: Tx): Promise<boolean>;
}

export interface ChecklistStatus {
  key: string;
  area: ChecklistArea;
  label: string;
  help: string | null;
  manual: boolean;
  done: boolean;
  doneAt: string | null;
}

export class OnboardingChecklist {
  readonly #items: ChecklistItem[] = [];

  constructor(items: readonly ChecklistItem[] = []) {
    for (const i of items) this.register(i);
  }

  register(item: ChecklistItem): this {
    if (this.#items.some((i) => i.key === item.key)) throw new Error(`Checklist item ${item.key} is registered twice`);
    this.#items.push(item);
    return this;
  }

  async evaluate(tx: Tx): Promise<ChecklistStatus[]> {
    const confirmed = await tx.selectFrom("kernel.onboarding_step").select(["key", "done_at"]).execute();
    const at = new Map(confirmed.map((c) => [c.key as string, new Date(c.done_at as string).toISOString()]));
    const out: ChecklistStatus[] = [];
    for (const i of this.#items) {
      const done = i.check ? await i.check(tx) : at.has(i.key);
      out.push({ key: i.key, area: i.area, label: i.label, help: i.help ?? null, manual: !i.check, done, doneAt: i.check ? null : (at.get(i.key) ?? null) });
    }
    return out;
  }

  /** Confirm (or re-open) a review step. */
  async confirm(tx: Tx, key: string, done = true): Promise<void> {
    const item = this.#items.find((i) => i.key === key);
    if (!item || item.check) throw new Error(`${key} is not a step a person confirms`);
    if (done) await tx.insertInto("kernel.onboarding_step").values({ key }).onConflict((oc) => oc.columns(["tenant_id", "key"]).doNothing()).execute();
    else await tx.deleteFrom("kernel.onboarding_step").where("key", "=", key).execute();
  }
}

/** The kernel's items. `mfaEnabled` comes from the identity service. */
export function kernelChecklistItems(options: { mfaEnabled(userId: string): Promise<boolean> }): ChecklistItem[] {
  return [
    {
      key: "organisation.sites",
      area: "organisation",
      label: "Add your sites and stores",
      help: "Factories, godowns and stores decide who sees what (scope) and where stock is kept.",
      check: async (tx) => Boolean(await tx.selectFrom("kernel.org_unit").select("id").where("kind", "=", "site").executeTakeFirst()),
    },
    {
      key: "users.invited",
      area: "users",
      label: "Invite your team and give them roles",
      check: async (tx) => {
        const r = await tx.selectFrom("kernel.tenant_membership").select(sql<string>`count(*)`.as("n")).where("status", "=", "active").executeTakeFirstOrThrow();
        return BigInt(r.n) >= 2n;
      },
    },
    {
      key: "users.mfa",
      area: "users",
      label: "Owner, admin and accountant use two-step sign-in",
      help: "Required for privileged roles (ADR-0032): an authenticator app or a passkey.",
      check: async (tx) => {
        const holders = await tx
          .selectFrom("kernel.role_assignment as a")
          .innerJoin("kernel.role as r", "r.id", "a.role_id")
          .innerJoin("kernel.tenant_membership as m", "m.id", "a.membership_id")
          .select("m.user_id")
          .distinct()
          .where("r.privileged", "=", true)
          .where("m.status", "=", "active")
          .execute();
        for (const h of holders) if (!(await options.mfaEnabled(h.user_id as string))) return false;
        return true;
      },
    },
    { key: "configuration.numbering", area: "configuration", label: "Review document numbering", help: "Invoice series cannot change once the first invoice is posted." },
    { key: "configuration.settings", area: "configuration", label: "Review settings (tolerances, rounding, defaults)" },
  ];
}
