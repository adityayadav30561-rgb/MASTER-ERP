// ESLint flat config. Rules that protect accepted ADRs are commented with the ADR they enforce.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

/** ADR-0053 decimal rule: money, quantities and rates never pass through JavaScript `number`. */
const decimalRule = {
  "no-restricted-globals": [
    "error",
    { name: "parseFloat", message: "ADR-0053: use Decimal.from(string) — never floating point for money or quantities." },
  ],
  "no-restricted-properties": [
    "error",
    { object: "Number", property: "parseFloat", message: "ADR-0053: use Decimal.from(string)." },
    { property: "toFixed", message: "ADR-0053: use Decimal#round / Money#toString — Number#toFixed rounds binary floats." },
  ],
  "no-restricted-imports": [
    "error",
    {
      paths: [{ name: "big.js", message: "ADR-0053: the decimal library stays behind @master-erp/kernel/decimal." }],
    },
  ],
};

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "**/out/**", "docs/**"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: "module" },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-extraneous-class": ["error", { allowWithDecorator: true }], // NestJS modules
    },
  },
  { files: ["platform/**/*.ts", "modules/**/*.ts", "packages-config/**/*.ts", "tenants/**/*.ts"], rules: decimalRule },
  // The one place allowed to use the decimal library (whose toFixed is exact, unlike Number#toFixed).
  {
    files: ["platform/kernel/src/decimal/**/*.ts"],
    rules: {
      "no-restricted-imports": "off",
      "no-restricted-properties": ["error", { object: "Number", property: "parseFloat" }],
    },
  },
  { files: ["**/*.cjs"], languageOptions: { sourceType: "commonjs", globals: globals.node } },
);
