/**
 * Setting definitions known to this build. Each module owns its settings; until the sales and inventory
 * modules exist (Slice 1), the definitions their package defaults refer to live here.
 */
import type { SettingDefinition } from "@master-erp/kernel/config";

export const SETTING_DEFINITIONS: readonly SettingDefinition[] = [
  { key: "sales.invoice_round_off", description: "Round the invoice total: to the rupee, or not at all", schema: { enum: ["none", "rupee"] }, default: "none" },
  {
    key: "inventory.over_receipt_tolerance_percent",
    description: "How much more than ordered may be received without approval (%)",
    schema: { type: "string", pattern: "^(100|[0-9]{1,2})(\\.[0-9]{1,2})?$" },
    default: "0",
    perOrgUnit: true,
  },
];
