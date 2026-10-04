/** Controllers of the HTTP API, in the order the OpenAPI document lists them. */
import { AdminController } from "./admin.controller.ts";
import { ImportController } from "./import.controller.ts";
import { ItemsController, LookupsController, PartiesController } from "./masters.controller.ts";
import { MeController } from "./me.controller.ts";

export const API_CONTROLLERS = [MeController, PartiesController, ItemsController, LookupsController, ImportController, AdminController] as const;
