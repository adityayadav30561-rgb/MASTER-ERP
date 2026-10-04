/**
 * Merge packages into the effective configuration a tenant runs on (Step 5 §2):
 *   override — a higher layer replaces a value (terminology, settings, numbering, role templates)
 *   extend   — a higher layer adds items (fields, sub-statuses, guards)
 *   lock     — a lower layer forbids changes above it (manifest `locks`)
 */
import semver from "semver";
import { ExtensionValidator, validateDefinitions } from "../metadata/fields.ts";
import type { FieldDefinition } from "../metadata/fields.ts";
import { RuleEngine, toFacts } from "../rules/engine.ts";
import type { DocumentConfiguration } from "../documents/documents.ts";
import type { DocumentSnapshot, Guard } from "../documents/lifecycle.ts";
import { LAYERS, PackageError, PLATFORM_VERSION } from "./packages.ts";
import type { GuardDefinition, LoadedPackage, NumberingDefaults, RoleTemplate } from "./packages.ts";

const rules = new RuleEngine();

interface Origin {
  packageId: string;
}

export class EffectiveConfiguration {
  readonly packages: readonly { id: string; version: string; checksum: string }[];
  readonly #fields = new Map<string, FieldDefinition[]>();
  readonly #terminology = new Map<string, Map<string, string>>();
  readonly #subStatuses = new Map<string, string[]>(); // "docType|state"
  readonly #guards = new Map<string, (GuardDefinition & Origin)[]>(); // "docType|action"
  readonly #settings = new Map<string, unknown>();
  readonly #numbering = new Map<string, NumberingDefaults>();
  readonly #roles = new Map<string, RoleTemplate>();
  readonly #locks = new Map<string, string>(); // lock key → package that set it
  readonly #validators = new Map<string, ExtensionValidator>();
  readonly #seed = new Map<string, unknown[]>();
  readonly #demo = new Map<string, unknown[]>();

  constructor(packages: readonly LoadedPackage[]) {
    const ordered = [...packages].sort((a, b) => LAYERS.indexOf(a.manifest.type) - LAYERS.indexOf(b.manifest.type));
    this.#checkDependencies(ordered);
    this.packages = ordered.map((p) => ({ id: p.manifest.id, version: p.manifest.version, checksum: p.checksum }));
    for (const p of ordered) this.#apply(p);
    for (const [objectType, defs] of this.#fields) validateDefinitions(objectType, defs);
    for (const list of this.#guards.values()) for (const g of list) rules.validateCondition(g.condition);
  }

  #checkDependencies(ordered: readonly LoadedPackage[]): void {
    const present = new Map<string, LoadedPackage>();
    for (const p of ordered) {
      if (present.has(p.manifest.id)) throw new PackageError(`Package ${p.manifest.id} included twice`);
      present.set(p.manifest.id, p);
    }
    for (const p of ordered) {
      if (!semver.satisfies(PLATFORM_VERSION, p.manifest.platform)) {
        throw new PackageError(`${p.manifest.id} ${p.manifest.version} needs platform ${p.manifest.platform}, this is ${PLATFORM_VERSION}`);
      }
      for (const [dep, range] of Object.entries(p.manifest.requires?.packages ?? {})) {
        const d = present.get(dep);
        if (!d) throw new PackageError(`${p.manifest.id} requires package ${dep} ${range}`);
        if (!semver.satisfies(d.manifest.version, range)) throw new PackageError(`${p.manifest.id} requires ${dep} ${range}, found ${d.manifest.version}`);
        if (LAYERS.indexOf(d.manifest.type) > LAYERS.indexOf(p.manifest.type)) throw new PackageError(`${p.manifest.id} cannot depend on the higher layer ${dep}`);
      }
    }
  }

  #locked(key: string, by: string): void {
    const owner = this.#locks.get(key);
    if (owner && owner !== by) throw new PackageError(`${by} changes "${key}", which ${owner} locks`);
  }

  #apply(p: LoadedPackage): void {
    const id = p.manifest.id;
    // extend: fields (a higher layer may refine label/rules of an existing field, never its type)
    for (const [objectType, defs] of Object.entries(p.fields)) {
      const current = this.#fields.get(objectType) ?? [];
      for (const def of defs) {
        const i = current.findIndex((f) => f.key === def.key);
        if (i < 0) {
          current.push(def);
          continue;
        }
        this.#locked(`fields.${objectType}.${def.key}`, id);
        if (current[i]?.type !== def.type) throw new PackageError(`${id} changes the type of ${objectType}.${def.key}`);
        current[i] = { ...current[i], ...def } as FieldDefinition;
      }
      this.#fields.set(objectType, current);
    }
    // override: terminology
    for (const [lang, labels] of Object.entries(p.terminology)) {
      const map = this.#terminology.get(lang) ?? new Map<string, string>();
      for (const [k, v] of Object.entries(labels)) {
        this.#locked(`terminology.${k}`, id);
        map.set(k, v);
      }
      this.#terminology.set(lang, map);
    }
    // extend: sub-statuses and guards
    for (const [docType, states] of Object.entries(p.subStatuses)) {
      for (const [state, list] of Object.entries(states)) {
        const k = `${docType}|${state}`;
        this.#subStatuses.set(k, [...new Set([...(this.#subStatuses.get(k) ?? []), ...list])]);
      }
    }
    for (const [docType, actions] of Object.entries(p.guards)) {
      for (const [action, list] of Object.entries(actions)) {
        const k = `${docType}|${action}`;
        this.#guards.set(k, [...(this.#guards.get(k) ?? []), ...list.map((g) => ({ ...g, packageId: id }))]);
      }
    }
    // override: settings, numbering (per property), role templates
    for (const [k, v] of Object.entries(p.settings)) {
      this.#locked(`settings.${k}`, id);
      this.#settings.set(k, v);
    }
    for (const [docType, n] of Object.entries(p.numbering)) {
      for (const prop of Object.keys(n)) this.#locked(`numbering.${docType}.${prop}`, id);
      this.#numbering.set(docType, { ...this.#numbering.get(docType), ...n });
    }
    for (const r of p.roles) {
      this.#locked(`roles.${r.code}`, id);
      this.#roles.set(r.code, r);
    }
    // extend: seed and demo records (lower layers first, so referenced codes exist)
    for (const [kind, records] of Object.entries(p.seed)) this.#seed.set(kind, [...(this.#seed.get(kind) ?? []), ...records]);
    for (const [kind, records] of Object.entries(p.demo ?? {})) this.#demo.set(kind, [...(this.#demo.get(kind) ?? []), ...records]);
    // locks declared by this package apply to the layers above it
    for (const lock of p.manifest.locks ?? []) this.#locks.set(lock, id);
  }

  fields(objectType: string): readonly FieldDefinition[] {
    return this.#fields.get(objectType) ?? [];
  }

  validator(objectType: string): ExtensionValidator {
    let v = this.#validators.get(objectType);
    if (!v) {
      v = new ExtensionValidator(objectType, this.fields(objectType));
      this.#validators.set(objectType, v);
    }
    return v;
  }

  /** Label in the user's language, falling back to English, then to the key itself. */
  label(key: string, lang = "en"): string {
    return this.#terminology.get(lang)?.get(key) ?? this.#terminology.get("en")?.get(key) ?? key;
  }

  setting(key: string): unknown {
    return this.#settings.get(key);
  }

  isLocked(key: string): boolean {
    return this.#locks.has(key);
  }

  numbering(documentType: string): NumberingDefaults | undefined {
    return this.#numbering.get(documentType);
  }

  /** Seed records by object type, merged across layers. */
  seed(): Record<string, unknown[]> {
    return Object.fromEntries(this.#seed);
  }

  demo(): Record<string, unknown[]> {
    return Object.fromEntries(this.#demo);
  }

  roleTemplates(): RoleTemplate[] {
    return [...this.#roles.values()];
  }

  /** Configured additions to document lifecycles, in the shape the document framework expects. */
  asDocumentConfiguration(): DocumentConfiguration {
    return {
      subStatuses: (docType, state) => this.#subStatuses.get(`${docType}|${state}`),
      extraGuards: (docType, action): Guard[] =>
        (this.#guards.get(`${docType}|${action}`) ?? []).map((g) => (doc: DocumentSnapshot) => {
          const facts = { record: toFacts({ ...doc, ext: doc.ext, total_amount: doc.total_amount ?? "0" }, new Set(["total_amount"])) };
          return rules.compile(g.condition).test(facts) ? undefined : g.message;
        }),
    };
  }
}

