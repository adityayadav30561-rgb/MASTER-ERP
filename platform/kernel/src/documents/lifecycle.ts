/**
 * Core lifecycles (ADR-0005): each document type declares its fixed states and transitions in module code.
 * Tenants add sub-statuses, approval workflows and extra guards through configuration — never remove core ones.
 */

export interface StateDefinition {
  /** Drafts are editable; leaving an editable state locks the document (ADR-0007). */
  editable?: boolean;
  /** The document is finished (closed, cancelled, superseded). */
  final?: boolean;
}

export interface DocumentSnapshot {
  id: string;
  document_type: string;
  state: string;
  sub_status: string | null;
  number: string | null;
  company_id: string;
  site_id: string | null;
  party_id: string | null;
  total_amount: string | null;
  currency: string | null;
  document_date: string;
  posted_at: Date | null;
  created_by: string | null;
  ext: Record<string, unknown>;
}

/** A guard returns undefined when the transition may proceed, or a message explaining why not. */
export type Guard = (doc: DocumentSnapshot) => string | undefined | Promise<string | undefined>;

export interface TransitionDefinition {
  action: string; // e.g. "post"
  from: readonly string[];
  to: string;
  /** Past-tense event name suffix (ADR-0040): purchase.purchase_order + "released". */
  event: string;
  /** Permission checked by the authorization service; defaults to `<documentType>.<action>`. */
  permission?: string;
  /** Allocate the document number in this transition (statutory numbering at posting, ADR-0029). */
  assignNumber?: boolean;
  /** This is the posting transition: stamps posted_at / posted_by. */
  posts?: boolean;
  /** This is a cancellation: refused while posted follow-on documents exist (ADR-0007). */
  cancels?: boolean;
  /** This transition creates a new revision; the old one moves to `to` (ADR-0007 amend). */
  amends?: boolean;
  guards?: readonly Guard[];
}

export interface LifecycleDefinition {
  documentType: string; // "<module>.<object>", e.g. "purchase.purchase_order"
  initial: string;
  states: Readonly<Record<string, StateDefinition>>;
  transitions: readonly TransitionDefinition[];
}

export class LifecycleError extends Error {
  override name = "LifecycleError";
}

export class DocumentTypeRegistry {
  readonly #types = new Map<string, LifecycleDefinition>();

  register(def: LifecycleDefinition): void {
    if (!/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(def.documentType)) {
      throw new LifecycleError(`Document type "${def.documentType}" must be "<module>.<object>"`);
    }
    if (this.#types.has(def.documentType)) throw new LifecycleError(`Document type ${def.documentType} registered twice`);
    if (!def.states[def.initial]) throw new LifecycleError(`Initial state ${def.initial} is not declared`);
    const actions = new Set<string>();
    for (const t of def.transitions) {
      for (const s of [...t.from, t.to]) {
        if (!def.states[s]) throw new LifecycleError(`${def.documentType}: state "${s}" used by "${t.action}" is not declared`);
      }
      const key = `${t.action}:${t.from.join(",")}`;
      if (actions.has(key)) throw new LifecycleError(`${def.documentType}: transition "${t.action}" declared twice for the same states`);
      actions.add(key);
    }
    this.#types.set(def.documentType, def);
  }

  get(documentType: string): LifecycleDefinition {
    const def = this.#types.get(documentType);
    if (!def) throw new LifecycleError(`Unknown document type ${documentType}`);
    return def;
  }

  transition(documentType: string, state: string, action: string): TransitionDefinition {
    const t = this.get(documentType).transitions.find((x) => x.action === action && x.from.includes(state));
    if (!t) throw new LifecycleError(`"${action}" is not allowed for a ${documentType} in state "${state}"`);
    return t;
  }

  /** Actions available from a state (drives the buttons on a document screen). */
  availableActions(documentType: string, state: string): string[] {
    return this.get(documentType).transitions.filter((t) => t.from.includes(state)).map((t) => t.action);
  }

  list(): LifecycleDefinition[] {
    return [...this.#types.values()];
  }
}
