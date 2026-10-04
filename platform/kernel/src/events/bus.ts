/**
 * K8 Event bus (ADR-0040, ADR-0041, ADR-0043).
 * - Envelope: CloudEvents 1.0 with extensions tenantid, traceparent (W3C Trace Context), causationid, actor.
 * - In-transaction subscribers run inside the publishing transaction: reactions required for a valid
 *   business state (postings, statutory numbers, essential automations).
 * - After-commit subscribers become jobs in the same transaction (outbox), delivered at least once,
 *   in order per subject (document), and processed idempotently through the inbox.
 */
import { randomBytes } from "node:crypto";
import { sql } from "kysely";
import { newId } from "../ids/index.ts";
import type { AnyDb, Tx } from "../db/database.ts";
import { withTenant } from "../db/context.ts";
import type { Actor, ExecutionContext } from "../db/context.ts";
import type { DocumentEventSink } from "../documents/documents.ts";

export interface CloudEvent<T = Record<string, unknown>> {
  specversion: "1.0";
  id: string;
  source: string;
  type: string;
  subject: string;
  time: string;
  datacontenttype: "application/json";
  data: T;
  tenantid: string;
  traceparent: string;
  causationid?: string;
  /** How many events led to this one; automation chains stop at MAX_CAUSATION_DEPTH (loop protection). */
  causationdepth: number;
  actor: Actor;
}

export interface HandlerContext {
  tx: Tx;
  ctx: ExecutionContext;
}

export type EventHandler = (event: CloudEvent, h: HandlerContext) => Promise<void>;

export interface Subscription {
  name: string; // stable consumer name, e.g. "inventory.reserve_on_so_confirmed"
  pattern: string; // exact type or prefix wildcard "purchase.purchase_order.*"
  mode: "in-transaction" | "after-commit";
  handler: EventHandler;
  maxAttempts?: number;
}

export const MAX_CAUSATION_DEPTH = 5;
export const EVENT_TASK = "erp_event";

export class EventError extends Error {
  override name = "EventError";
}

function matches(pattern: string, type: string): boolean {
  return pattern.endsWith(".*") ? type.startsWith(pattern.slice(0, -1)) : pattern === type;
}

export interface PublishInput {
  type: string;
  subject: string;
  data: Record<string, unknown>;
}

export class EventBus {
  readonly #subscriptions = new Map<string, Subscription>();

  subscribe(subscription: Subscription): void {
    if (this.#subscriptions.has(subscription.name)) throw new EventError(`Subscriber ${subscription.name} registered twice`);
    if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*(\.\*)?$/.test(subscription.pattern)) throw new EventError(`Bad event pattern ${subscription.pattern}`);
    this.#subscriptions.set(subscription.name, subscription);
  }

  subscriptions(): Subscription[] {
    return [...this.#subscriptions.values()];
  }

  async publish(tx: Tx, ctx: ExecutionContext, input: PublishInput): Promise<CloudEvent> {
    if (!/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(input.type)) {
      throw new EventError(`Event type "${input.type}" must be "<module>.<object>.<past tense>"`);
    }
    const depth = (ctx.causation?.depth ?? -1) + 1;
    if (depth > MAX_CAUSATION_DEPTH) {
      throw new EventError(`Event chain too deep (${depth}) at ${input.type}: possible automation loop`);
    }
    const event: CloudEvent = {
      specversion: "1.0",
      id: newId(),
      source: `/erp/${input.type.split(".")[0]}`,
      type: input.type,
      subject: input.subject,
      time: new Date().toISOString(),
      datacontenttype: "application/json",
      data: input.data,
      tenantid: ctx.tenantId,
      traceparent: `00-${ctx.traceId}-${randomBytes(8).toString("hex")}-01`,
      ...(ctx.causation ? { causationid: ctx.causation.eventId } : {}),
      causationdepth: depth,
      actor: ctx.actor,
    };
    const childCtx: ExecutionContext = { ...ctx, causation: { eventId: event.id, depth } };
    for (const s of this.#subscriptions.values()) {
      if (!matches(s.pattern, event.type)) continue;
      if (s.mode === "in-transaction") {
        await s.handler(event, { tx, ctx: childCtx });
      } else {
        await sql`select kernel.enqueue_job(${EVENT_TASK}, ${JSON.stringify({ subscriber: s.name, event })}::jsonb,
            ${`${ctx.tenantId}:${event.subject}`}, null, null, ${s.maxAttempts ?? 10})`.execute(tx);
      }
    }
    return event;
  }

  /** Adapter so the document framework (K6) publishes through this bus. */
  documentSink(): DocumentEventSink {
    return async (tx, ctx, e) => {
      await this.publish(tx, ctx, e);
    };
  }

  /**
   * Process one delivered job: run the subscriber in its own tenant transaction, exactly once per event
   * thanks to the inbox. Called by the worker; exported for tests.
   */
  async deliver(appDb: AnyDb, payload: { subscriber: string; event: CloudEvent; tenant_id: string }): Promise<"processed" | "duplicate"> {
    const s = this.#subscriptions.get(payload.subscriber);
    if (!s) throw new EventError(`No subscriber ${payload.subscriber}`);
    const event = payload.event;
    if (payload.tenant_id !== event.tenantid) throw new EventError("Job tenant does not match the event tenant");
    const ctx: ExecutionContext = {
      tenantId: event.tenantid,
      actor: { kind: "automation", label: `subscriber: ${s.name}`, onBehalfOf: event.actor.userId },
      traceId: event.traceparent.split("-")[1] ?? newId().replace(/-/g, ""),
      causation: { eventId: event.id, depth: event.causationdepth },
    };
    return withTenant(appDb, ctx, async (tx) => {
      const first = await sql<{ event_id: string }>`insert into kernel.inbox (consumer, event_id) values (${s.name}, ${event.id})
          on conflict do nothing returning event_id`.execute(tx);
      if (first.rows.length === 0) return "duplicate";
      await s.handler(event, { tx, ctx });
      return "processed";
    });
  }
}
