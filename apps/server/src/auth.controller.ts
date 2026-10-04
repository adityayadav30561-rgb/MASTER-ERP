/** Bridges /api/auth/* to Better Auth (sign-in, two-factor, passkeys, device PIN, step-up, sign-out). */
import { All, Controller, Inject, Req, Res } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Identity } from "@master-erp/kernel/identity";
import { headersOf } from "./session.guard.ts";
import { IDENTITY } from "./tokens.ts";

@Controller("api/auth")
export class AuthController {
  constructor(@Inject(IDENTITY) private readonly identity: Identity) {}

  @All("*")
  async handle(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const url = new URL(request.url, `${request.protocol}://${request.headers.host ?? "localhost"}`);
    const body = request.method === "GET" || request.method === "HEAD" ? undefined : JSON.stringify(request.body ?? {});
    const response = await this.identity.auth.handler(new Request(url, { method: request.method, headers: headersOf(request), ...(body ? { body } : {}) }));
    void reply.status(response.status);
    response.headers.forEach((value, key) => {
      if (key !== "set-cookie") void reply.header(key, value);
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length) void reply.header("set-cookie", cookies);
    void reply.send(response.body ? Buffer.from(await response.arrayBuffer()) : undefined);
  }
}
