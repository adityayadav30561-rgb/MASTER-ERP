/**
 * Spike S1 — run the official CEL conformance suite (google/cel-spec, packaged by @bufbuild/cel-spec)
 * against JavaScript CEL libraries. Only tests that use plain values are applicable: tests that need
 * protobuf messages (TestAllTypes, wrappers, enums) are skipped, because ERP data reaches CEL as plain maps.
 *
 * Run: node spikes/s1-cel/src/conformance.ts
 */
import { tests as conformance } from "@bufbuild/cel-spec/testdata/conformance.js";
import * as buf from "@bufbuild/cel";
import * as marc from "@marcbachmann/cel-js";

/** Value in google.api.expr Value JSON form, as stored in the test data. */
type ValueJson = Record<string, unknown>;

interface ConformanceTest {
  name: string;
  expr: string;
  value?: ValueJson;
  evalError?: unknown;
  bindings?: Record<string, { value?: ValueJson }>;
  container?: string;
  typeEnv?: unknown[];
  checkOnly?: boolean;
  disableMacros?: boolean;
}

interface Suite {
  name: string;
  suites?: Suite[];
  tests?: { original: ConformanceTest }[];
}

export interface Case {
  section: string;
  test: ConformanceTest;
}

export function collect(): { applicable: Case[]; skipped: number } {
  const applicable: Case[] = [];
  let skipped = 0;
  const walk = (suite: Suite, path: string[]) => {
    for (const t of suite.tests ?? []) {
      const test = t.original;
      const text = JSON.stringify(test);
      const needsProto =
        /TestAllTypes|google\.protobuf|NestedTestAll|objectValue|enumValue|typeValue|proto2|proto3|GlobalEnum/.test(text) ||
        test.container !== undefined ||
        (test.typeEnv?.length ?? 0) > 0;
      if (needsProto || test.checkOnly || (!test.value && !test.evalError) || test.disableMacros) skipped++;
      else applicable.push({ section: path.slice(1, 2).join("/"), test });
    }
    for (const s of suite.suites ?? []) walk(s, [...path, s.name]);
  };
  walk(conformance as unknown as Suite, [conformance.name]);
  return { applicable, skipped };
}

/* ---------- canonical comparison form ---------- */

type Canon = string;

function canonExpected(v: ValueJson): Canon {
  if ("int64Value" in v) return `int:${String(v.int64Value ?? "0")}`;
  if ("uint64Value" in v) return `uint:${String(v.uint64Value ?? "0")}`;
  if ("doubleValue" in v) return `double:${canonDouble(v.doubleValue)}`;
  if ("stringValue" in v) return `string:${JSON.stringify(v.stringValue ?? "")}`;
  if ("boolValue" in v) return `bool:${String(v.boolValue ?? false)}`;
  if ("nullValue" in v) return "null";
  if ("bytesValue" in v) return `bytes:${String(v.bytesValue ?? "")}`;
  if ("listValue" in v) {
    const values = ((v.listValue as { values?: ValueJson[] }).values ?? []).map(canonExpected);
    return `list:[${values.join(",")}]`;
  }
  if ("mapValue" in v) {
    const entries = ((v.mapValue as { entries?: { key: ValueJson; value: ValueJson }[] }).entries ?? [])
      .map((e) => `${canonExpected(e.key)}=>${canonExpected(e.value)}`)
      .sort();
    return `map:{${entries.join(",")}}`;
  }
  return `unsupported:${JSON.stringify(v)}`;
}

function canonDouble(d: unknown): string {
  if (d === "NaN" || (typeof d === "number" && Number.isNaN(d))) return "NaN";
  if (d === "Infinity" || d === Infinity) return "Infinity";
  if (d === "-Infinity" || d === -Infinity) return "-Infinity";
  return String(Number(d ?? 0));
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/** Convert a library's result to the canonical form. */
function canonActual(v: unknown): Canon {
  if (typeof v === "bigint") return `int:${v.toString()}`;
  if (typeof v === "number") return `double:${canonDouble(v)}`;
  if (typeof v === "string") return `string:${JSON.stringify(v)}`;
  if (typeof v === "boolean") return `bool:${String(v)}`;
  if (v === null || v === undefined) return "null";
  if (v instanceof Uint8Array) return `bytes:${base64(v)}`;
  // @marcbachmann/cel-js declares UnsignedInt in its types but does not export it at runtime.
  if (typeof v === "object" && v.constructor.name === "UnsignedInt") return `uint:${String((v as { value: unknown }).value)}`;
  if (buf.isCelUint(v)) return `uint:${String(v.value)}`;
  if (Array.isArray(v)) return `list:[${v.map(canonActual).join(",")}]`;
  if (buf.isCelList(v)) return `list:[${[...(v as Iterable<unknown>)].map(canonActual).join(",")}]`;
  if (v instanceof Map || buf.isCelMap(v)) {
    const entries = [...(v as Map<unknown, unknown>).entries()].map(([k, x]) => `${canonActual(k)}=>${canonActual(x)}`).sort();
    return `map:{${entries.join(",")}}`;
  }
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>).map(([k, x]) => `${canonActual(k)}=>${canonActual(x)}`).sort();
    return `map:{${entries.join(",")}}`;
  }
  return `unknown:${String(v)}`;
}

/* ---------- bindings ---------- */

type Flavour = "buf" | "marc";

function toInput(v: ValueJson, flavour: Flavour): unknown {
  if ("int64Value" in v) return BigInt(String(v.int64Value ?? "0"));
  if ("uint64Value" in v) {
    const n = BigInt(String(v.uint64Value ?? "0"));
    return flavour === "buf" ? buf.celUint(n) : marc.evaluate(`${n}u`);
  }
  if ("doubleValue" in v) return Number(canonDouble(v.doubleValue));
  if ("stringValue" in v) return v.stringValue ?? "";
  if ("boolValue" in v) return v.boolValue ?? false;
  if ("nullValue" in v) return null;
  if ("bytesValue" in v) return new Uint8Array(Buffer.from(String(v.bytesValue ?? ""), "base64"));
  if ("listValue" in v) return ((v.listValue as { values?: ValueJson[] }).values ?? []).map((x) => toInput(x, flavour));
  if ("mapValue" in v) {
    const entries = ((v.mapValue as { entries?: { key: ValueJson; value: ValueJson }[] }).entries ?? []).map(
      (e) => [toInput(e.key, flavour), toInput(e.value, flavour)] as const,
    );
    return flavour === "buf" ? new Map(entries) : Object.fromEntries(entries.map(([k, x]) => [String(k), x]));
  }
  throw new Error("unsupported binding");
}

function bindings(test: ConformanceTest, flavour: Flavour): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, b] of Object.entries(test.bindings ?? {})) {
    if (b.value) out[name] = toInput(b.value, flavour);
  }
  return out;
}

/* ---------- runners ---------- */

export const libraries: Record<Flavour, { name: string; evaluate: (expr: string, vars: Record<string, unknown>) => unknown }> = {
  buf: {
    name: "@bufbuild/cel",
    evaluate: (expr, vars) => {
      const r = buf.run(expr, vars as never);
      if (buf.isCelError(r)) throw r;
      return r;
    },
  },
  marc: { name: "@marcbachmann/cel-js", evaluate: (expr, vars) => marc.evaluate(expr, vars) },
  // cel-js 0.8.2 scored 462/1,400 (33%) on 2026-10-04 and was then removed: it has no int type, and its
  // dependency chain (chevrotain → lodash-es) carries a high-severity advisory (GHSA-r5fr-rjxr-66jc).
};

export interface Score {
  library: string;
  passed: number;
  total: number;
  bySection: Record<string, { passed: number; total: number }>;
  failures: string[];
}

export function score(flavour: Flavour, cases: readonly Case[]): Score {
  const lib = libraries[flavour];
  const result: Score = { library: lib.name, passed: 0, total: cases.length, bySection: {}, failures: [] };
  for (const { section, test } of cases) {
    const s = (result.bySection[section] ??= { passed: 0, total: 0 });
    s.total++;
    let ok = false;
    try {
      const actual = lib.evaluate(test.expr, bindings(test, flavour));
      if (test.value) {
        const expected = canonExpected(test.value);
        const got = canonActual(actual);
        ok = got === expected;
      }
    } catch {
      ok = test.evalError !== undefined;
    }
    if (ok) {
      result.passed++;
      s.passed++;
    } else if (result.failures.length < 400) {
      result.failures.push(`${section}/${test.name}: ${test.expr}`);
    }
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { applicable, skipped } = collect();
  console.log(`Applicable conformance tests: ${applicable.length} (skipped ${skipped} that need protobuf messages)`);
  const scores = (["buf", "marc"] as const).map((f) => score(f, applicable));
  for (const s of scores) console.log(`${s.library.padEnd(22)} ${s.passed}/${s.total} = ${((100 * s.passed) / s.total).toFixed(1)}%`);
  const sections = Object.keys(scores[0]?.bySection ?? {});
  console.log("\nsection".padEnd(26) + scores.map((s) => s.library.padEnd(22)).join(""));
  for (const sec of sections) {
    console.log(sec.padEnd(25) + scores.map((s) => `${s.bySection[sec]?.passed}/${s.bySection[sec]?.total}`.padEnd(22)).join(""));
  }
  if (process.argv.includes("--failures")) for (const s of scores) console.log(`\n${s.library}\n  ` + s.failures.slice(0, 60).join("\n  "));
}
