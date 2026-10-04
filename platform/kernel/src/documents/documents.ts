/**
 * K6 Document framework (ADR-0005, ADR-0006, ADR-0007, ADR-0049): one registry row per document,
 * lifecycle transitions with guards, numbering, links, cancel and amend.
 */
import { sql } from "kysely";
import { Decimal } from "../decimal/index.ts";
import { newId } from "../ids/index.ts";
import type { Tx } from "../db/database.ts";
import type { ExecutionContext } from "../db/context.ts";
import { allocateNumber, findSeries, NumberingError } from "./numbering.ts";
import { LifecycleError } from "./lifecycle.ts";
import type { DocumentSnapshot, DocumentTypeRegistry, Guard, TransitionDefinition } from "./lifecycle.ts";

export type LinkType = "created_from" | "fulfils" | "settles" | "references";

/** Domain event raised by the document framework; the events module (K8) delivers it. */
export interface DocumentEvent {
  type: string; // "<module>.<object>.<past tense>"
  subject: string; // document id
  data: Record<string, unknown>;
}

export type DocumentEventSink = (tx: Tx, ctx: ExecutionContext, event: DocumentEvent) => Promise<void>;

/** Configured (tenant) additions: extra guards and allowed sub-statuses (Step 5 §5 #5, #8). */
export interface DocumentConfiguration {
  extraGuards?(documentType: string, action: string): readonly Guard[];
  subStatuses?(documentType: string, state: string): readonly string[] | undefined;
}

export interface CreateDocumentInput {
  documentType: string;
  companyId: string;
  siteId?: string;
  date: string; // YYYY-MM-DD
  partyId?: string;
  currency?: string;
  totalAmount?: Decimal | string;
  anchor?: { type: string; id: string };
  ext?: Record<string, unknown>;
  seriesCode?: string;
}

export class DocumentError extends Error {
  override name = "DocumentError";
}

const SNAPSHOT = [
  "id", "document_type", "state", "sub_status", "number", "company_id", "site_id", "party_id",
  "total_amount", "currency", "document_date", "posted_at", "created_by", "ext",
] as const;

export class DocumentService {
  readonly #registry: DocumentTypeRegistry;
  readonly #sink: DocumentEventSink | undefined;
  readonly #config: DocumentConfiguration;

  constructor(registry: DocumentTypeRegistry, options: { events?: DocumentEventSink; configuration?: DocumentConfiguration } = {}) {
    this.#registry = registry;
    this.#sink = options.events;
    this.#config = options.configuration ?? {};
  }

  get registry(): DocumentTypeRegistry {
    return this.#registry;
  }

  async create(tx: Tx, ctx: ExecutionContext, input: CreateDocumentInput): Promise<DocumentSnapshot> {
    const def = this.#registry.get(input.documentType);
    const company = await tx.selectFrom("kernel.org_unit").select("kind").where("id", "=", input.companyId).executeTakeFirst();
    if (company?.kind !== "company") throw new DocumentError("A document belongs to exactly one company (ADR-0004)");
    const id = newId();
    let numbering: { number: string; series_id: string; fiscal_year: string } | undefined;
    const series = await findSeries(tx, input.documentType, input.companyId, input.siteId, input.seriesCode);
    if (series?.allocation === "creation") {
      const n = await allocateNumber(tx, series, input.date);
      numbering = { number: n.number, series_id: n.seriesId, fiscal_year: n.fiscalYear };
    }
    await tx
      .insertInto("kernel.document")
      .values({
        id,
        document_type: input.documentType,
        company_id: input.companyId,
        site_id: input.siteId ?? null,
        temp_ref: `DRAFT-${id.replace(/-/g, "").slice(-6).toUpperCase()}`,
        state: def.initial,
        locked: !(def.states[def.initial]?.editable ?? false),
        document_date: input.date,
        party_id: input.partyId ?? null,
        currency: input.currency ?? null,
        total_amount: input.totalAmount === undefined ? null : Decimal.from(input.totalAmount).round(2, "half-up").toString(),
        anchor_type: input.anchor?.type ?? null,
        anchor_id: input.anchor?.id ?? null,
        ext: JSON.stringify(input.ext ?? {}),
        number: numbering?.number ?? null,
        series_id: numbering?.series_id ?? null,
        fiscal_year: numbering?.fiscal_year ?? null,
      })
      .execute();
    const doc = await this.get(tx, id);
    await this.#emit(tx, ctx, `${input.documentType}.created`, doc, {});
    return doc;
  }

  async get(tx: Tx, id: string, forUpdate = false): Promise<DocumentSnapshot> {
    let q = tx.selectFrom("kernel.document").select(SNAPSHOT).where("id", "=", id);
    if (forUpdate) q = q.forUpdate();
    const doc = (await q.executeTakeFirst()) as DocumentSnapshot | undefined;
    if (!doc) throw new DocumentError("Document not found");
    return doc;
  }

  /** Edit registry fields of a draft, with optimistic locking. */
  async updateDraft(
    tx: Tx,
    id: string,
    expectedVersion: number,
    patch: Partial<Pick<CreateDocumentInput, "date" | "partyId" | "currency" | "totalAmount" | "siteId" | "ext">>,
  ): Promise<void> {
    const values: Record<string, unknown> = {};
    if (patch.date !== undefined) values.document_date = patch.date;
    if (patch.partyId !== undefined) values.party_id = patch.partyId;
    if (patch.currency !== undefined) values.currency = patch.currency;
    if (patch.siteId !== undefined) values.site_id = patch.siteId;
    if (patch.totalAmount !== undefined) values.total_amount = Decimal.from(patch.totalAmount).round(2, "half-up").toString();
    if (patch.ext !== undefined) values.ext = JSON.stringify(patch.ext);
    const r = await tx.updateTable("kernel.document").set(values).where("id", "=", id).where("version", "=", expectedVersion).executeTakeFirst();
    if (r.numUpdatedRows !== 1n) throw new DocumentError("The document was changed by someone else, or is not a draft — reload and try again");
  }

  async setSubStatus(tx: Tx, ctx: ExecutionContext, id: string, subStatus: string | null): Promise<void> {
    const doc = await this.get(tx, id, true);
    const allowed = this.#config.subStatuses?.(doc.document_type, doc.state);
    if (subStatus !== null && allowed && !allowed.includes(subStatus)) {
      throw new DocumentError(`Sub-status "${subStatus}" is not configured for state "${doc.state}"`);
    }
    await tx.updateTable("kernel.document").set({ sub_status: subStatus }).where("id", "=", id).execute();
    await this.#emit(tx, ctx, `${doc.document_type}.sub_status_changed`, doc, { from: doc.sub_status, to: subStatus });
  }

  /** Apply a lifecycle transition (submit, approve, post, cancel …) inside the caller's transaction. */
  async transition(tx: Tx, ctx: ExecutionContext, id: string, action: string, options: { reason?: string } = {}): Promise<DocumentSnapshot> {
    const doc = await this.get(tx, id, true);
    const def = this.#registry.get(doc.document_type);
    const t = this.#registry.transition(doc.document_type, doc.state, action);
    if (t.amends) throw new DocumentError(`Use amend() for "${action}"`);

    const guards = [...(t.guards ?? []), ...(this.#config.extraGuards?.(doc.document_type, action) ?? [])];
    for (const guard of guards) {
      const problem = await guard(doc);
      if (problem) throw new LifecycleError(problem);
    }
    if (t.cancels && !options.reason) throw new DocumentError("A cancellation needs a reason");
    if (t.cancels) await this.#assertNoFollowOn(tx, doc);

    const values: Record<string, unknown> = {
      state: t.to,
      sub_status: null,
      locked: !(def.states[t.to]?.editable ?? false),
    };
    if (t.assignNumber && doc.number === null) {
      const series = await findSeries(tx, doc.document_type, doc.company_id, doc.site_id ?? undefined);
      if (!series) throw new NumberingError(`No numbering series for ${doc.document_type} in this company`);
      const n = await allocateNumber(tx, series, doc.document_date);
      Object.assign(values, { number: n.number, series_id: n.seriesId, fiscal_year: n.fiscalYear });
    }
    if (t.posts) Object.assign(values, { posted_at: sql`now()`, posted_by: ctx.actor.userId ?? null });
    if (t.cancels) Object.assign(values, { cancelled_at: sql`now()`, cancelled_by: ctx.actor.userId ?? null, cancel_reason: options.reason ?? null });
    await tx.updateTable("kernel.document").set(values).where("id", "=", id).execute();

    const after = await this.get(tx, id);
    await this.#emit(tx, ctx, `${doc.document_type}.${t.event}`, after, { action, from: doc.state, to: t.to });
    return after;
  }

  /**
   * Amend a posted document (ADR-0007): the old revision moves to the transition's target state and stays
   * unchanged; a new draft revision with the same number is created and linked with "created_from".
   */
  async amend(tx: Tx, ctx: ExecutionContext, id: string, action = "amend"): Promise<DocumentSnapshot> {
    const doc = await this.get(tx, id, true);
    const def = this.#registry.get(doc.document_type);
    const t: TransitionDefinition = this.#registry.transition(doc.document_type, doc.state, action);
    if (!t.amends) throw new DocumentError(`"${action}" is not an amend transition`);
    await this.#assertNoFollowOn(tx, doc);
    const old = await tx.selectFrom("kernel.document").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
    await tx.updateTable("kernel.document").set({ state: t.to, locked: true }).where("id", "=", id).execute();
    const newIdValue = newId();
    await tx
      .insertInto("kernel.document")
      .values({
        ...old,
        id: newIdValue,
        state: def.initial,
        sub_status: null,
        locked: false,
        revision: (old.revision as number) + 1,
        amends_id: id,
        posted_at: null,
        posted_by: null,
        temp_ref: `DRAFT-${newIdValue.replace(/-/g, "").slice(-6).toUpperCase()}`,
        ext: JSON.stringify(old.ext ?? {}),
        created_at: sql`now()`,
        created_by: ctx.actor.userId ?? null,
        updated_at: sql`now()`,
        updated_by: null,
        version: 1,
        tenant_id: undefined,
      })
      .execute();
    await this.link(tx, { type: "created_from", sourceDocumentId: id, targetDocumentId: newIdValue });
    const revision = await this.get(tx, newIdValue);
    await this.#emit(tx, ctx, `${doc.document_type}.${t.event}`, revision, { previous: id, revision: (old.revision as number) + 1 });
    return revision;
  }

  /** Delete a draft (posted documents are never deleted; the database refuses too). */
  async deleteDraft(tx: Tx, id: string): Promise<void> {
    const doc = await this.get(tx, id, true);
    const def = this.#registry.get(doc.document_type);
    if (!def.states[doc.state]?.editable || doc.posted_at) throw new DocumentError("Only drafts can be deleted");
    const follow = await tx.selectFrom("kernel.document_link").select("id").where("source_document_id", "=", id).executeTakeFirst();
    if (follow) throw new DocumentError("Other documents were created from this draft");
    await tx.deleteFrom("kernel.document").where("id", "=", id).execute();
  }

  async link(
    tx: Tx,
    input: {
      type: LinkType;
      sourceDocumentId: string;
      sourceLineId?: string;
      targetDocumentId: string;
      targetLineId?: string;
      quantity?: Decimal | string;
      uom?: string;
      amount?: Decimal | string;
      currency?: string;
    },
  ): Promise<string> {
    if (input.type === "fulfils" && (input.quantity === undefined || !input.sourceLineId)) throw new DocumentError("A fulfils link needs a source line and a quantity");
    if (input.type === "settles" && input.amount === undefined) throw new DocumentError("A settles link needs an amount");
    const id = newId();
    await tx
      .insertInto("kernel.document_link")
      .values({
        id,
        link_type: input.type,
        source_document_id: input.sourceDocumentId,
        source_line_id: input.sourceLineId ?? null,
        target_document_id: input.targetDocumentId,
        target_line_id: input.targetLineId ?? null,
        quantity: input.quantity === undefined ? null : Decimal.from(input.quantity).toString(),
        uom: input.uom ?? null,
        amount: input.amount === undefined ? null : Decimal.from(input.amount).toString(),
        currency: input.currency ?? null,
      })
      .execute();
    return id;
  }

  /** Open quantity of a source line = ordered − quantity fulfilled by posted, not cancelled documents. */
  async openQuantity(tx: Tx, sourceLineId: string, ordered: Decimal | string): Promise<Decimal> {
    const r = await sql<{ q: string }>`select kernel.linked_quantity(${sourceLineId}::uuid)::text as q`.execute(tx);
    return Decimal.from(ordered).minus(r.rows[0]?.q ?? "0");
  }

  async openAmount(tx: Tx, sourceDocumentId: string, total: Decimal | string): Promise<Decimal> {
    const r = await sql<{ a: string }>`select kernel.linked_amount(${sourceDocumentId}::uuid)::text as a`.execute(tx);
    return Decimal.from(total).minus(r.rows[0]?.a ?? "0");
  }

  async #assertNoFollowOn(tx: Tx, doc: DocumentSnapshot): Promise<void> {
    const followOn = await sql<{ ref: string }>`
      select coalesce(t.number, t.temp_ref) as ref from kernel.document_link l join kernel.document t on t.id = l.target_document_id
      where l.source_document_id = ${doc.id} and l.link_type <> 'references' and t.cancelled_at is null
      limit 1`.execute(tx);
    const ref = followOn.rows[0]?.ref;
    if (ref) throw new DocumentError(`${doc.number ?? "This document"} has follow-on document ${ref}: cancel that first`);
  }

  async #emit(tx: Tx, ctx: ExecutionContext, type: string, doc: DocumentSnapshot, extra: Record<string, unknown>): Promise<void> {
    if (!this.#sink) return;
    await this.#sink(tx, ctx, {
      type,
      subject: doc.id,
      data: {
        documentType: doc.document_type,
        number: doc.number,
        state: doc.state,
        companyId: doc.company_id,
        siteId: doc.site_id,
        partyId: doc.party_id,
        totalAmount: doc.total_amount,
        currency: doc.currency,
        ...extra,
      },
    });
  }
}
