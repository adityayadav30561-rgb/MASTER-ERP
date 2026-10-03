# ADR-0023: Standards-first — follow recognised industry standards wherever they exist

- **Status:** Accepted (founder's instruction, 2026-10-03)
- **Date:** 2026-10-03
- **Discovery step:** Cross-cutting

## Context

The founder instructed that the platform follow the best industry standards. Inventing our own
formats, notations and conventions costs time, creates integration friction and reduces customer
and auditor trust.

## Decision

Where a recognised standard, law or widely accepted convention exists, we follow it. The
[Industry Standards Register](../00-context/STANDARDS.md) lists them with status
(Adopted / Planned / Reference). Every ADR touching such an area cites the standard. Deviations
need an ADR that explains why.

## Consequences

- Design choices are anchored in legal requirements first: GST, the audit-trail rule, AS 2.
- The open standards come next: JSON Schema, OpenAPI, OAuth/OIDC, CEL, DMN, ISO codes, SemVer.
- The register is reviewed at every discovery step.
- We do not claim formal compliance or certification (for example ISO 27001) until it is actually achieved.
