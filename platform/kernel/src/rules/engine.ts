/**
 * Rules engine (ADR-0028, ADR-0068): CEL through @marcbachmann/cel-js, behind this port so the library can be
 * replaced (fallback: @bufbuild/cel). Money and quantities are exact: a `decimal` CEL type backed by the
 * kernel Decimal, with exact arithmetic and comparisons, also against integer literals (`doc.total > 50000`).
 */
import { Environment } from "@marcbachmann/cel-js";
import { Decimal } from "../decimal/index.ts";

export class RuleError extends Error {
  override name = "RuleError";
  readonly expression: string;
  constructor(message: string, expression: string, cause?: unknown) {
    super(`${message} — in rule: ${expression}`, { cause });
    this.expression = expression;
  }
}

/** Parse-time limits for tenant-written expressions (ADR-0068). */
export const RULE_LIMITS = { maxAstNodes: 500, maxDepth: 30, maxListElements: 200, maxMapEntries: 200, maxCallArguments: 8 } as const;
export const MAX_EXPRESSION_LENGTH = 2000;

export interface CompiledRule {
  readonly expression: string;
  /** Result type found by the type checker ("bool", "dyn", …). */
  readonly type: string;
  evaluate(facts: Record<string, unknown>): unknown;
  /** Evaluate a condition: anything other than true/false is an error, never silently false. */
  test(facts: Record<string, unknown>): boolean;
}

function buildEnvironment(): Environment {
  const env = new Environment({ unlistedVariablesAreDyn: true, limits: RULE_LIMITS });
  env.registerType("decimal", Decimal as never);
  env.registerFunction("decimal(string): decimal", (s: string) => Decimal.from(s));
  env.registerFunction("decimal(int): decimal", (i: bigint) => Decimal.from(i));
  env.registerFunction("round(decimal, int): decimal", (d: Decimal, scale: bigint) => d.round(Number(scale), "half-up"));
  env.registerFunction("abs(decimal): decimal", (d: Decimal) => d.abs());
  const ops = { ">": (c: number) => c > 0, ">=": (c: number) => c >= 0, "<": (c: number) => c < 0, "<=": (c: number) => c <= 0, "==": (c: number) => c === 0 };
  for (const [op, ok] of Object.entries(ops)) {
    env.registerOperator(`decimal ${op} decimal`, (a: Decimal, b: Decimal) => ok(a.compare(b)));
    env.registerOperator(`decimal ${op} int`, (a: Decimal, b: bigint) => ok(a.compare(Decimal.from(b))));
    if (op !== "==") env.registerOperator(`int ${op} decimal`, (a: bigint, b: Decimal) => ok(Decimal.from(a).compare(b))); // == is symmetric: registered by the library
  }
  env.registerOperator("decimal + decimal", (a: Decimal, b: Decimal) => a.plus(b));
  env.registerOperator("decimal - decimal", (a: Decimal, b: Decimal) => a.minus(b));
  env.registerOperator("decimal * decimal", (a: Decimal, b: Decimal) => a.times(b));
  env.registerOperator("decimal * int", (a: Decimal, b: bigint) => a.times(Decimal.from(b)));
  env.registerOperator("decimal + int", (a: Decimal, b: bigint) => a.plus(Decimal.from(b)));
  env.registerOperator("decimal - int", (a: Decimal, b: bigint) => a.minus(Decimal.from(b)));
  return env;
}

export class RuleEngine {
  readonly #env = buildEnvironment();
  readonly #cache = new Map<string, CompiledRule>();

  /** Compile and type-check once (when configuration is saved), evaluate many times. */
  compile(expression: string): CompiledRule {
    const cached = this.#cache.get(expression);
    if (cached) return cached;
    if (expression.length > MAX_EXPRESSION_LENGTH) throw new RuleError(`Expression longer than ${MAX_EXPRESSION_LENGTH} characters`, expression.slice(0, 80));
    let parsed: ReturnType<Environment["parse"]>;
    try {
      parsed = this.#env.parse(expression);
    } catch (error) {
      throw new RuleError((error as Error).message, expression, error);
    }
    const checked = parsed.check();
    if (!checked.valid) throw new RuleError(checked.error?.message ?? "Type error", expression, checked.error);
    const type = checked.type ?? "dyn";
    const rule: CompiledRule = {
      expression,
      type,
      evaluate(facts) {
        try {
          return parsed(facts);
        } catch (error) {
          throw new RuleError((error as Error).message, expression, error);
        }
      },
      test(facts) {
        const result = rule.evaluate(facts);
        if (typeof result !== "boolean") throw new RuleError(`Condition returned ${typeof result}, expected true or false`, expression);
        return result;
      },
    };
    this.#cache.set(expression, rule);
    return rule;
  }

  /** Validate a condition at configuration time: must parse, type-check and be boolean (or dynamic). */
  validateCondition(expression: string): void {
    const rule = this.compile(expression);
    if (rule.type !== "bool" && rule.type !== "dyn") throw new RuleError(`A condition must be true/false, this is ${rule.type}`, expression);
  }
}

/**
 * Turn application data into CEL facts (ADR-0053): Decimal values stay exact, whole numbers become CEL ints,
 * decimal-text fields named in `decimalFields` become Decimal. Fractional JavaScript numbers are refused.
 */
export function toFacts(value: unknown, decimalFields: ReadonlySet<string> = new Set(), key = ""): unknown {
  if (value instanceof Decimal || typeof value === "bigint" || value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new RuleError("Fractional JavaScript numbers cannot be used in rules (ADR-0053)", key);
    return BigInt(value);
  }
  if (typeof value === "string") return decimalFields.has(key) ? Decimal.from(value) : value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((v) => toFacts(v, decimalFields, key));
  if (typeof value === "object" && value !== undefined) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toFacts(v, decimalFields, k)]));
  }
  return value;
}
