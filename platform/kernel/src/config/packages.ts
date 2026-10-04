/**
 * K12 Configuration packages (ADR-0011, ADR-0024, ADR-0025, Step 5A §2).
 * A package is a folder of YAML files validated by JSON Schema; packages are merged by layer
 * (localization → industry → tenant) with three rules: override, extend, lock.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Type } from "@sinclair/typebox";
import type { Static, TSchema } from "@sinclair/typebox";
import { Ajv2020 } from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";
import semver from "semver";
import type { FieldDefinition } from "../metadata/fields.ts";

/** Version of the platform (kernel + modules) that packages declare compatibility with. */
export const PLATFORM_VERSION = "0.1.0";

export const LAYERS = ["localization", "industry", "tenant"] as const;
export type PackageType = (typeof LAYERS)[number];

const Id = Type.String({ pattern: "^[a-z][a-z0-9-]{1,40}$" });
const Key = Type.String({ pattern: "^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$" });

export const ManifestSchema = Type.Object(
  {
    id: Id,
    type: Type.Union(LAYERS.map((l) => Type.Literal(l))),
    version: Type.String({ description: "SemVer" }),
    name: Type.Optional(Type.String()),
    platform: Type.String({ description: "SemVer range of compatible platform versions" }),
    requires: Type.Optional(
      Type.Object(
        {
          modules: Type.Optional(Type.Array(Type.String({ pattern: "^[a-z][a-z0-9_]*$" }))),
          packages: Type.Optional(Type.Record(Type.String(), Type.String())),
        },
        { additionalProperties: false },
      ),
    ),
    locks: Type.Optional(Type.Array(Type.String({ pattern: "^(settings|terminology|fields|numbering|roles)\\..+$" }))),
  },
  { additionalProperties: false },
);
export type Manifest = Static<typeof ManifestSchema>;

const FieldSchema = Type.Object(
  {
    key: Type.String(),
    label: Type.Record(Type.String(), Type.String()),
    type: Type.String(),
    precision: Type.Optional(Type.Integer()),
    scale: Type.Optional(Type.Integer()),
    values: Type.Optional(Type.Array(Type.String())),
    objectType: Type.Optional(Type.String()),
    expression: Type.Optional(Type.String()),
    required: Type.Optional(Type.Union([Type.Boolean(), Type.String()])),
    appliesWhen: Type.Optional(Type.String()),
    min: Type.Optional(Type.String()),
    max: Type.Optional(Type.String()),
    maxLength: Type.Optional(Type.Integer()),
    pattern: Type.Optional(Type.String()),
    validation: Type.Optional(Type.Object({ condition: Type.String(), message: Type.String() }, { additionalProperties: false })),
    fieldGroup: Type.Optional(Type.String()),
    classification: Type.Optional(Type.Union([Type.Literal("normal"), Type.Literal("confidential"), Type.Literal("personal")])),
    searchable: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

const GuardSchema = Type.Object({ condition: Type.String(), message: Type.String() }, { additionalProperties: false });
const NumberingSchema = Type.Object(
  {
    pattern: Type.Optional(Type.String()),
    resetPolicy: Type.Optional(Type.Union(["never", "fiscal_year", "calendar_year", "monthly"].map((x) => Type.Literal(x)))),
    allocation: Type.Optional(Type.Union([Type.Literal("creation"), Type.Literal("posting")])),
    gapless: Type.Optional(Type.Boolean()),
    fyStartMonth: Type.Optional(Type.Integer({ minimum: 1, maximum: 12 })),
    maxLength: Type.Optional(Type.Integer({ minimum: 1 })),
    allowedPattern: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
const RoleSchema = Type.Object(
  {
    code: Type.String({ pattern: "^[a-z][a-z0-9_]*$" }),
    name: Type.String(),
    description: Type.Optional(Type.String()),
    privileged: Type.Optional(Type.Boolean()),
    shopFloor: Type.Optional(Type.Boolean()),
    permissions: Type.Array(
      Type.Union([
        Type.String(),
        Type.Object(
          {
            permission: Type.String(),
            condition: Type.Optional(Type.String()),
            limit: Type.Optional(Type.Object({ amount: Type.String(), currency: Type.String() }, { additionalProperties: false })),
          },
          { additionalProperties: false },
        ),
      ]),
    ),
    fieldGroups: Type.Optional(
      Type.Array(Type.Object({ objectType: Type.String(), group: Type.String(), access: Type.Union([Type.Literal("read"), Type.Literal("write")]) }, { additionalProperties: false })),
    ),
  },
  { additionalProperties: false },
);
export type RoleTemplate = Static<typeof RoleSchema>;
export type NumberingDefaults = Static<typeof NumberingSchema>;
export type GuardDefinition = Static<typeof GuardSchema>;

const CONTENT = {
  fields: Type.Array(FieldSchema),
  terminology: Type.Record(Type.String(), Type.String()),
  sub_statuses: Type.Record(Type.String(), Type.Record(Type.String(), Type.Array(Type.String()))),
  guards: Type.Record(Type.String(), Type.Record(Type.String(), Type.Array(GuardSchema))),
  settings: Type.Record(Key, Type.Unknown()),
  numbering: Type.Record(Type.String(), NumberingSchema),
  role: RoleSchema,
} satisfies Record<string, TSchema>;

export interface LoadedPackage {
  manifest: Manifest;
  checksum: string;
  /** objectType → field definitions */
  fields: Record<string, FieldDefinition[]>;
  /** language → key → label */
  terminology: Record<string, Record<string, string>>;
  subStatuses: Record<string, Record<string, string[]>>;
  guards: Record<string, Record<string, GuardDefinition[]>>;
  settings: Record<string, unknown>;
  numbering: Record<string, NumberingDefaults>;
  roles: RoleTemplate[];
}

export class PackageError extends Error {
  override name = "PackageError";
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validators = new Map<TSchema, ReturnType<typeof ajv.compile>>();

function check<T>(schema: TSchema, data: unknown, where: string): T {
  let v = validators.get(schema);
  if (!v) {
    v = ajv.compile(schema);
    validators.set(schema, v);
  }
  if (!v(data)) {
    const first = v.errors?.[0];
    throw new PackageError(`${where}: ${first?.instancePath || "/"} ${first?.message ?? "is invalid"}`);
  }
  return data as T;
}

function yamlFiles(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort() : [];
}

/** Read and validate one package folder. */
export function loadPackage(dir: string): LoadedPackage {
  const hash = createHash("sha256");
  const read = (path: string): unknown => {
    const text = readFileSync(path, "utf8");
    hash.update(path.slice(dir.length)).update(text);
    try {
      return parseYaml(text);
    } catch (error) {
      throw new PackageError(`${path}: ${(error as Error).message}`);
    }
  };
  const manifest = check<Manifest>(ManifestSchema, read(join(dir, "manifest.yaml")), `${dir}/manifest.yaml`);
  if (!semver.valid(manifest.version)) throw new PackageError(`${manifest.id}: version "${manifest.version}" is not SemVer`);
  if (!semver.validRange(manifest.platform)) throw new PackageError(`${manifest.id}: platform range "${manifest.platform}" is invalid`);

  const pkg: LoadedPackage = { manifest, checksum: "", fields: {}, terminology: {}, subStatuses: {}, guards: {}, settings: {}, numbering: {}, roles: [] };
  for (const f of yamlFiles(join(dir, "fields"))) {
    pkg.fields[f.replace(/\.yaml$/, "")] = check<FieldDefinition[]>(CONTENT.fields, read(join(dir, "fields", f)), `${manifest.id}/fields/${f}`);
  }
  for (const f of yamlFiles(join(dir, "terminology"))) {
    pkg.terminology[f.replace(/\.yaml$/, "")] = check(CONTENT.terminology, read(join(dir, "terminology", f)), `${manifest.id}/terminology/${f}`);
  }
  const single = <T>(file: string, schema: TSchema): T | undefined => (existsSync(join(dir, file)) ? check<T>(schema, read(join(dir, file)), `${manifest.id}/${file}`) : undefined);
  pkg.subStatuses = single("processes/sub_statuses.yaml", CONTENT.sub_statuses) ?? {};
  pkg.guards = single("rules/guards.yaml", CONTENT.guards) ?? {};
  pkg.settings = single("settings/defaults.yaml", CONTENT.settings) ?? {};
  pkg.numbering = single("numbering/series.yaml", CONTENT.numbering) ?? {};
  for (const f of yamlFiles(join(dir, "roles"))) pkg.roles.push(check<RoleTemplate>(CONTENT.role, read(join(dir, "roles", f)), `${manifest.id}/roles/${f}`));
  pkg.checksum = hash.digest("hex");
  return pkg;
}
