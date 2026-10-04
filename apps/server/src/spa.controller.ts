/** Client-side routes (/parties/…, /admin/…) get the web app's index.html; files come from @fastify/static. */
import { Controller, Get, Inject, NotFoundException, Req, Res } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Config } from "./config.ts";
import { CONFIG } from "./tokens.ts";

@Controller()
export class SpaController {
  constructor(@Inject(CONFIG) private readonly config: Config) {}

  @Get("*")
  index(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    if (!this.config.WEB_DIR || request.url.startsWith("/api/") || request.url.startsWith("/health/")) throw new NotFoundException("Not found");
    void reply.header("cache-control", "no-cache").sendFile("index.html");
  }
}
