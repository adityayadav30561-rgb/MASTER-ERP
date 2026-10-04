/** Every /api/v1 request needs a session bound to this sub-domain's tenant (ADR-0069). */
import { Inject, Injectable, UnauthorizedException, ForbiddenException } from "@nestjs/common";
import type { CanActivate, ExecutionContext as NestContext } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { Identity, ResolvedSession } from "@master-erp/kernel/identity";
import { IDENTITY } from "./tokens.ts";

export type AuthenticatedRequest = FastifyRequest & { session?: ResolvedSession };

export function headersOf(request: FastifyRequest): Headers {
  const h = new Headers();
  for (const [k, v] of Object.entries(request.headers)) {
    if (typeof v === "string") h.set(k, v);
    else if (Array.isArray(v)) for (const x of v) h.append(k, x);
  }
  return h;
}

/** Paths a privileged user may use before enrolling two-factor login. */
const MFA_ENROLMENT_PATHS = ["/api/v1/me"];

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(IDENTITY) private readonly identity: Identity) {}

  async canActivate(context: NestContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = await this.identity.resolve(headersOf(request));
    if (!session) throw new UnauthorizedException("Sign in required");
    if (session.mfaEnrolmentRequired && !MFA_ENROLMENT_PATHS.includes(request.url.split("?")[0] ?? "")) {
      throw new ForbiddenException("Set up two-factor login first");
    }
    request.session = session;
    return true;
  }
}
