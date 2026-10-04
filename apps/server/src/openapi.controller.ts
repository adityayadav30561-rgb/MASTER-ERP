/** The API description (OpenAPI 3.1), generated from the same @Api specs that validate requests. */
import { Controller, Get } from "@nestjs/common";
import { buildOpenApi } from "./api.ts";
import { API_CONTROLLERS } from "./controllers.ts";

let cached: Record<string, unknown> | undefined;

@Controller("api/v1/openapi.json")
export class OpenApiController {
  @Get()
  document() {
    cached ??= buildOpenApi(API_CONTROLLERS, { title: "MASTER-ERP API", version: "1.0.0-slice0" });
    return cached;
  }
}
