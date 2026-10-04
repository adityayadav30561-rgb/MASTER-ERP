/** Server configuration from the environment, validated at start-up (12-factor; secrets from the secret store, ADR-0037). */
import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export const ConfigSchema = Type.Object({
  DATABASE_URL: Type.String({ minLength: 1, description: "Application role (member of erp_app, subject to RLS)" }),
  DATABASE_OWNER_URL: Type.Optional(Type.String({ description: "Owner role: migrations and the worker's job tables only" })),
  BASE_URL: Type.String({ pattern: "^https?://" }),
  AUTH_SECRET: Type.String({ minLength: 32 }),
  FILES_DIR: Type.String({ default: "./var/files" }),
  FILES_SECRET: Type.String({ minLength: 32 }),
  PORT: Type.String({ pattern: "^\\d+$", default: "3000" }),
  WEB_DIR: Type.Optional(Type.String({ description: "Built web app (apps/web/dist) to serve on the same origin" })),
});
export type Config = Static<typeof ConfigSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const withDefaults = Value.Default(ConfigSchema, { ...env });
  const raw = Object.fromEntries(Object.keys(ConfigSchema.properties).map((k) => [k, (withDefaults as Record<string, unknown>)[k]]).filter(([, v]) => v !== undefined));
  if (!Value.Check(ConfigSchema, raw)) {
    const problems = [...Value.Errors(ConfigSchema, raw)].map((e) => `${e.path.slice(1) || "config"}: ${e.message}`);
    throw new Error(`Invalid configuration:\n  ${problems.join("\n  ")}`);
  }
  return raw;
}
