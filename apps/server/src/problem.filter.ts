/** Errors as RFC 9457 problem details (application/problem+json), without leaking internals. */
import { Catch, HttpException } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { TenantAccessError } from "@master-erp/kernel/db";
import { AuthorizationError } from "@master-erp/kernel/authz";
import { DocumentError, LifecycleError, NumberingError } from "@master-erp/kernel/documents";
import { SettingsError } from "@master-erp/kernel/config";
import { FileError } from "@master-erp/kernel/files";
import { DecimalError } from "@master-erp/kernel/decimal";

interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  [extension: string]: unknown;
}

export function toProblem(error: unknown): Problem {
  if (error instanceof HttpException) {
    const status = error.getStatus();
    return { type: "about:blank", title: error.message, status };
  }
  if (error instanceof AuthorizationError) {
    return { type: "https://errors.master-erp.in/authorization", title: "Not allowed", status: 403, detail: error.message, check: error.decision.failedCheck };
  }
  if (error instanceof TenantAccessError) return { type: "https://errors.master-erp.in/tenant", title: "Account not accessible", status: 403, detail: error.message };
  if (error instanceof LifecycleError || error instanceof DocumentError || error instanceof NumberingError) {
    return { type: "https://errors.master-erp.in/document", title: "Action not possible", status: 409, detail: error.message };
  }
  if (error instanceof SettingsError || error instanceof FileError || error instanceof DecimalError) {
    return { type: "https://errors.master-erp.in/validation", title: "Invalid input", status: 422, detail: error.message };
  }
  return { type: "about:blank", title: "Internal Server Error", status: 500 }; // details go to the log, not the client
}

@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const reply = http.getResponse<FastifyReply>();
    const request = http.getRequest<FastifyRequest>();
    const problem = { ...toProblem(error), instance: request.url.split("?")[0] };
    if (problem.status >= 500) request.log.error({ err: error }, "unhandled error");
    void reply.status(problem.status).header("content-type", "application/problem+json").send(problem);
  }
}
