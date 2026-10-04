import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{platform,modules,packages-config,tools,spikes,apps}/*/src/**/*.test.ts", "{platform,modules,packages-config,tools,spikes,apps}/*/test/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
