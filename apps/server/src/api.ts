/**
 * API conventions in one place (API-AND-INTEGRATION-ARCHITECTURE §2):
 * - @Api(spec) declares summary, permission and TypeBox schemas; requests are validated against them and the
 *   same specs generate the OpenAPI 3.1 document (one source, no drift);
 * - TenantApi.run() opens the tenant transaction, runs the eight authorization checks and hands the work the
 *   tenant's configuration; denials are written to the security log outside the rolled-back transaction;
 * - ETag / If-Match carry the record version (optimistic locking).
 */
import { applyDecorators, HttpException, HttpStatus, Inject, Injectable, SetMetadata, UseInterceptors } from "@nestjs/common";
import type { CallHandler, ExecutionContext as NestContext, NestInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { RequestMethod } from "@nestjs/common";
import type { TSchema } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";
import type { Observable } from "rxjs";
import { logSecurityEvent } from "@master-erp/kernel/audit";
import { AuthorizationError } from "@master-erp/kernel/authz";
import type { AuthorizationService, AuthRecord, Decision, Principal } from "@master-erp/kernel/authz";
import { newTraceId, withTenant } from "@master-erp/kernel/db";
import type { AnyDb, ExecutionContext, Tx } from "@master-erp/kernel/db";
import { ValidationError } from "@master-erp/kernel/metadata";
import type { FieldError } from "@master-erp/kernel/metadata";
import type { PackageCatalog, TenantConfiguration } from "./catalog.ts";
import type { AuthenticatedRequest } from "./session.guard.ts";
import { APP_DB, AUTHZ, CATALOG } from "./tokens.ts";

export interface ApiSpec {
  summary: string;
  tags: string[];
  /** Permission checked by TenantApi.run (e.g. "foundation.party.read"); omitted = any signed-in member. */
  permission?: string;
  params?: TSchema;
  query?: TSchema;
  body?: TSchema;
  response?: TSchema;
  status?: number;
  /** Request or response is a file (media type), not JSON. */
  requestMedia?: string;
  responseMedia?: string;
}

export const API_SPEC = "master-erp:api-spec";
export type ApiRequest = AuthenticatedRequest & { apiSpec?: ApiSpec };

const ajv = new Ajv2020({ allErrors: true, strict: false, coerceTypes: false, useDefaults: true });
const queryAjv = new Ajv2020({ allErrors: true, strict: false, coerceTypes: true, useDefaults: true });
const compiled = new WeakMap<TSchema, ValidateFunction>();

function validator(schema: TSchema, query: boolean): ValidateFunction {
  let v = compiled.get(schema);
  if (!v) {
    v = (query ? queryAjv : ajv).compile(schema);
    compiled.set(schema, v);
  }
  return v;
}

function toFieldErrors(prefix: string, errors: readonly ErrorObject[] | null | undefined): FieldError[] {
  return (errors ?? []).map((e) => {
    const path = e.instancePath.split("/").filter(Boolean).join(".");
    const missing = e.keyword === "required" ? (e.params as { missingProperty: string }).missingProperty : undefined;
    const extra = e.keyword === "additionalProperties" ? (e.params as { additionalProperty: string }).additionalProperty : undefined;
    const field = [prefix, path, missing ?? extra].filter(Boolean).join(".");
    return { field, message: missing ? "is required" : extra ? "is not a known field" : (e.message ?? "is invalid") };
  });
}

@Injectable()
export class ValidateInterceptor implements NestInterceptor {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  intercept(context: NestContext, next: CallHandler): Observable<unknown> {
    const spec = this.reflector.get<ApiSpec | undefined>(API_SPEC, context.getHandler());
    const request = context.switchToHttp().getRequest<ApiRequest & { params: unknown; query: unknown; body: unknown }>();
    if (spec) {
      request.apiSpec = spec;
      const errors: FieldError[] = [];
      for (const [part, schema] of [["params", spec.params], ["query", spec.query], ["body", spec.requestMedia ? undefined : spec.body]] as const) {
        if (!schema) continue;
        const v = validator(schema, part !== "body");
        if (!v(request[part] ?? {})) errors.push(...toFieldErrors(part === "body" ? "" : part, v.errors));
      }
      if (errors.length > 0) throw new ValidationError(errors);
    }
    return next.handle();
  }
}

/** Declare an endpoint: documentation, permission and request validation. */
export function Api(spec: ApiSpec) {
  return applyDecorators(SetMetadata(API_SPEC, spec), UseInterceptors(ValidateInterceptor));
}

export interface Scope extends TenantConfiguration {
  tx: Tx;
  ctx: ExecutionContext;
  principal: Principal;
  decision: Decision | undefined;
}

const DENIED = Symbol("denied");

@Injectable()
export class TenantApi {
  constructor(
    @Inject(APP_DB) private readonly db: AnyDb,
    @Inject(AUTHZ) private readonly authz: AuthorizationService,
    @Inject(CATALOG) private readonly catalog: PackageCatalog,
  ) {}

  /** Run `work` in the caller's tenant after the permission of the endpoint's @Api spec is granted. */
  async run<T>(request: ApiRequest, work: (s: Scope) => Promise<T>, options: { mode?: "read" | "write"; record?: AuthRecord; permission?: string; reason?: string } = {}): Promise<T> {
    const session = request.session;
    if (!session) throw new HttpException("Sign in required", HttpStatus.UNAUTHORIZED);
    const principal = session.principal;
    const permission = options.permission ?? request.apiSpec?.permission;
    const ctx: ExecutionContext = { tenantId: principal.tenantId, actor: { kind: principal.authMethod === "device-pin" ? "device" : "user", userId: principal.userId }, traceId: newTraceId() };
    let denied: Decision | undefined;
    try {
      return await withTenant(
        this.db,
        ctx,
        async (tx) => {
          let decision: Decision | undefined;
          if (permission) {
            decision = await this.authz.decide(tx, ctx, principal, permission, options.record ?? {});
            if (!decision.allowed) {
              denied = decision;
              throw DENIED;
            }
          }
          const tenant = await this.catalog.forTenant(tx, principal.tenantId);
          return work({ tx, ctx, principal, decision, ...tenant });
        },
        { mode: options.mode ?? (request.method === "GET" ? "read" : "write"), ...(options.reason ? { reason: options.reason } : {}) },
      );
    } catch (error) {
      if (error !== DENIED || !denied) throw error;
      if (denied.failedCheck !== 7) {
        await logSecurityEvent(this.db, { type: "authz.denied", outcome: "denied", userId: principal.userId, tenantId: principal.tenantId, details: { permission, check: denied.failedCheck, reason: denied.reason } });
      }
      throw new AuthorizationError(denied);
    }
  }
}

/** Sensitive admin actions need a recent password re-entry (step-up, ADR-0032). */
export class StepUpRequiredError extends Error {
  override name = "StepUpRequiredError";
}

/* ---------- ETag / If-Match (RFC 9110 §8.8.3, §13.1.1) ---------- */

export const etag = (version: number) => `"v${version}"`;

export class PreconditionError extends Error {
  override name = "PreconditionError";
  constructor(readonly status: 412 | 428, message: string) {
    super(message);
  }
}

/** The version the client last saw, from If-Match. Updates without it are refused (lost-update protection). */
export function expectedVersion(request: ApiRequest): number {
  const header = request.headers["if-match"];
  if (typeof header !== "string") throw new PreconditionError(428, "Send If-Match with the ETag you last received");
  const m = /^(?:W\/)?"v(\d+)"$/.exec(header.trim());
  if (!m) throw new PreconditionError(412, "If-Match does not match a version of this record");
  return Number(m[1]);
}

/* ---------- shared schemas ---------- */

export const Id = Type.String({ format: "uuid", pattern: "^[0-9a-f-]{36}$" });
export const IdParams = Type.Object({ id: Id }, { additionalProperties: false });
export const ListQuery = Type.Object(
  {
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 50 })),
    cursor: Type.Optional(Type.String({ maxLength: 500 })),
    search: Type.Optional(Type.String({ maxLength: 100 })),
  },
  { additionalProperties: true },
);
export const Page = <T extends TSchema>(item: T) => Type.Object({ items: Type.Array(item), nextCursor: Type.Union([Type.String(), Type.Null()]) });
export const ProblemSchema = Type.Object({
  type: Type.String(),
  title: Type.String(),
  status: Type.Integer(),
  detail: Type.Optional(Type.String()),
  instance: Type.Optional(Type.String()),
  errors: Type.Optional(Type.Array(Type.Object({ field: Type.String(), message: Type.String() }))),
});

/* ---------- OpenAPI 3.1 from the @Api specs ---------- */

const METHODS: Partial<Record<RequestMethod, string>> = {
  [RequestMethod.GET]: "get", [RequestMethod.POST]: "post", [RequestMethod.PUT]: "put", [RequestMethod.PATCH]: "patch", [RequestMethod.DELETE]: "delete",
};

function joinPath(...parts: string[]): string {
  return `/${parts.map((p) => p.replace(/^\/|\/$/g, "")).filter(Boolean).join("/")}`.replace(/:([A-Za-z_]+)/g, "{$1}");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildOpenApi(controllers: readonly (abstract new (...args: any[]) => unknown)[], info: { title: string; version: string }): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const controller of controllers) {
    const base = (Reflect.getMetadata(PATH_METADATA, controller) as string | undefined) ?? "";
    const proto = controller.prototype as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
      const handler = proto[name];
      if (typeof handler !== "function" || name === "constructor") continue;
      const spec = Reflect.getMetadata(API_SPEC, handler) as ApiSpec | undefined;
      const method = METHODS[Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod];
      if (!spec || !method) continue;
      const path = joinPath(base, (Reflect.getMetadata(PATH_METADATA, handler) as string | undefined) ?? "");
      const parameters = [
        ...Object.entries((spec.params as { properties?: Record<string, TSchema> } | undefined)?.properties ?? {}).map(([n, s]) => ({ name: n, in: "path", required: true, schema: s })),
        ...Object.entries((spec.query as { properties?: Record<string, TSchema>; required?: string[] } | undefined)?.properties ?? {}).map(([n, s]) => ({
          name: n, in: "query", required: (spec.query as { required?: string[] }).required?.includes(n) ?? false, schema: s,
        })),
      ];
      const status = String(spec.status ?? (method === "post" ? 201 : 200));
      paths[path] ??= {};
      paths[path][method] = {
        summary: spec.summary,
        tags: spec.tags,
        operationId: `${controller.name.replace(/Controller$/, "")}.${name}`,
        ...(spec.permission ? { "x-permission": spec.permission, description: `Requires permission \`${spec.permission}\`.` } : {}),
        ...(parameters.length ? { parameters } : {}),
        ...(spec.body || spec.requestMedia ? { requestBody: { required: true, content: { [spec.requestMedia ?? "application/json"]: { schema: spec.requestMedia ? { type: "string", contentMediaType: spec.requestMedia } : spec.body } } } } : {}),
        responses: {
          [status]: { description: "OK", ...(spec.response || spec.responseMedia ? { content: { [spec.responseMedia ?? "application/json"]: { schema: spec.responseMedia ? { type: "string", contentMediaType: spec.responseMedia } : spec.response } } } : {}) },
          default: { description: "Problem (RFC 9457)", content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } } },
        },
      };
    }
  }
  return {
    openapi: "3.1.0",
    info,
    servers: [{ url: "/" }],
    security: [{ session: [] }],
    components: {
      securitySchemes: { session: { type: "apiKey", in: "cookie", name: "better-auth.session_token" } },
      schemas: { Problem: ProblemSchema },
    },
    paths,
  };
}
