# ADR-0068: CEL library — `@marcbachmann/cel-js` with an exact decimal type, behind a RuleEngine port

- **Status:** Accepted (founder, 2026-10-04)
- **Date:** 2026-10-04
- **Step:** Phase 1 spike S1 ([results §4](../03-implementation/PHASE-1-SPIKE-RESULTS.md#4-s1--the-rules-language-cel)); question [Q-67](../tracking/OPEN-QUESTIONS.md#q-67)
- **Refines:** [ADR-0028](ADR-0028-CEL-AND-DECISION-TABLES.md) (CEL + decision tables), [ADR-0057](ADR-0057-CONTRACTS-RULES-TEMPLATES-PDF.md) ("CEL library selected after a spike")
- **Standard:** CEL language definition and conformance tests (google/cel-spec)

## Context

Configuration uses CEL for approval conditions, record rules, validations and computed fields. Many of these conditions compare **money and quantities** (e.g. "PO total above ₹50,000"). CEL itself has no decimal type, only integers and binary floating-point numbers, and the decimal rule (ADR-0053) forbids floating point for money.

Spike S1 ran the official CEL conformance suite (1,400 applicable tests) and our ERP expressions against three JavaScript libraries.

## Options considered

| Option | Core conformance | Exact money | Limits | Maintenance |
| --- | --- | --- | --- | --- |
| **A. `@marcbachmann/cel-js`** | 86.9% (891/1,025) | ✅ custom `decimal` type with exact operators | ✅ built in | One active maintainer, zero dependencies |
| B. `@bufbuild/cel` | **99.3%** (1,018/1,025) | ❌ money only as a double (exact for comparing up to 15 digits; no safe arithmetic) | ❌ our own AST checks | Buf (company), needs `@bufbuild/protobuf` |
| C. `cel-js` | 33% | ❌ | ❌ | Older, no integer type |
| D. CEL via WebAssembly (cel-go) | ~100% | ❌ same as B | ✅ | Large binary, slower start, two runtimes |

## Decision

- Use **option A** behind a kernel **`RuleEngine` port**, so the library can be swapped without touching configuration or modules.
- Register a CEL type **`decimal`** backed by the kernel `Decimal`. Decimal fields reach CEL as `decimal` values, with exact `+ − × < <= > >= ==` and comparison with integer literals (`doc.total > 50000`).
- Set parse-time limits for every tenant expression: AST nodes ≤ 500, depth ≤ 30, list/map literals ≤ 200, call arguments ≤ 8.
- Type-check expressions when a package or setting is saved, never only at run time.
- **Guard in CI** on every library upgrade:
  - the ERP expression suite must pass 100%;
  - the conformance gate must stay ≥ 85% of the core tests.
- **Fallback: option B.** Decimals are passed as doubles for comparison only, and a validator rejects arithmetic on decimal fields.

## Consequences

- ✅ Money conditions and computed fields are exact, consistent with ADR-0053.
- ✅ Fast: ~3.7 µs per evaluation of a parsed rule, which suits row-level record rules on list screens.
- ⚠️ About 13% of core conformance tests fail. They are edge cases we do not use: mixed-type list literals, bytes, and cross-type numeric equality. Configuration authors must use homogeneous lists, and the type checker enforces this.
- ⚠️ Single-maintainer risk ([R-32](../tracking/RISK-REGISTER.md)): mitigated by the port, pinned versions, CI guards and the documented fallback.

## Review triggers

The library is unmaintained for 6 months, a security issue goes unfixed, or `@bufbuild/cel` gains custom types.
