# ADR-0009: Market, positioning and first vertical

- **Status:** Accepted (founder, 2026-10-03)
- **Date:** 2026-10-03
- **Discovery step:** [Step 1 §1.4, §12](../01-discovery/STEP-01-PLATFORM-DEFINITION.md#12-assumptions-challenged); answers [Q-01](../tracking/OPEN-QUESTIONS.md#q-01), [Q-02](../tracking/OPEN-QUESTIONS.md#q-02), [Q-05](../tracking/OPEN-QUESTIONS.md#q-05)

## Context

The vision is a multi-industry platform. A solo developer needs one market where the product can
win its first paying customers. Odoo Community and ERPNext are free, so price cannot be the edge.
Pharma has the heaviest regulatory burden (GMP, electronic signatures, validation).

## Options considered

| Option | Pros | Cons |
| --- | --- | --- |
| Generic "cheaper ERP" | Large market | Competes with free products; no differentiation |
| Pharma first | High willingness to pay | Validation and compliance cost is far beyond a solo developer |
| **Printing & Packaging, India first** | Founder familiarity; real pain (estimation, job tracking, paper stock); compliance limited to GST | Smaller market; must reach depth quickly |

## Decision

- **Positioning:** an ERP that already speaks your industry and goes live in weeks. Implementation services fund development in the early years.
- **First vertical:** Printing & Packaging.
- **Pharma:** a *design test* only ("could the model support it?"), not a sales target for now.
- **Second vertical** (later): an adjacent one (corrugated boxes, labels, flexible packaging) or a simpler batch-based industry (food, chemicals).
- **Market:** India first. GST, e-invoice and e-way bill are in the MVP. English UI with translatable text. Multi-currency in the data model from day one.

## Consequences

- The India localization pack and the Printing package are built alongside the first modules.
- Pharma-driven concepts (batches, quarantine, e-signature hooks, audit) are designed to be *possible* but are not built ahead of need.
