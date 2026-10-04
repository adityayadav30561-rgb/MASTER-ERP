/**
 * Module-boundary rules (Step 9 §4.3, ADR-0002, ADR-0014, ADR-0015, ADR-0054).
 * A violation fails the build.
 */
module.exports = {
  forbidden: [
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
    {
      name: "nothing-imports-spikes",
      comment: "Spikes are throw-away experiments; production code never depends on them.",
      severity: "error",
      from: { pathNot: "^spikes/" },
      to: { path: "^spikes/" },
    },
    {
      name: "kernel-depends-on-nothing-above",
      comment: "ADR-0002: dependencies point downward only. The kernel (L0) knows nothing above it.",
      severity: "error",
      from: { path: "^platform/kernel/" },
      to: { path: "^(platform/foundation|modules|packages-config|apps|tenants)/" },
    },
    {
      name: "foundation-depends-only-on-kernel",
      severity: "error",
      from: { path: "^platform/foundation/" },
      to: { path: "^(modules|packages-config|apps|tenants)/" },
    },
    {
      name: "modules-use-only-other-modules-contracts",
      comment: "ADR-0015: a module may import another module's contract/ folder only.",
      severity: "error",
      from: { path: "^modules/([^/]+)/" },
      to: { path: "^modules/[^/]+/", pathNot: ["^modules/$1/", "^modules/[^/]+/contract/"] },
    },
    {
      name: "modules-never-import-packages-or-apps",
      comment: "ADR-0002: industry and localization packages sit above the modules.",
      severity: "error",
      from: { path: "^modules/" },
      to: { path: "^(packages-config|apps|tenants)/" },
    },
    {
      name: "decimal-library-behind-kernel",
      comment: "ADR-0053: only platform/kernel/src/decimal may use the decimal library.",
      severity: "error",
      from: { pathNot: "^platform/kernel/src/decimal/" },
      to: { path: "node_modules/(\\.pnpm/)?big\\.js" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)(dist|coverage|out)/" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: { exportsFields: ["exports"], conditionNames: ["import", "require", "node", "default", "types"] },
  },
};
