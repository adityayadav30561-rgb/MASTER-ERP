# ADR-0002: Seven-layer product model with an integration axis

- **Status:** Accepted (founder, 2026-10-03)
- **Date:** 2026-10-03
- **Discovery step:** [Step 1 §2](../01-discovery/STEP-01-PLATFORM-DEFINITION.md#2-the-layered-product-model)

## Context

The brief's formula is *Core + Configuration + Modules + Industry Packages + Integrations*.
Two things don't fit it: shared business masters (Item, Party, UOM) needed by independently sold
modules, and country rules (GST) that vary independently of industry.

## Options considered

| Option | Pros | Cons |
| --- | --- | --- |
| Brief's 5 parts as-is | Simple to explain | Masters forced into core or into one module; localization mixed with industry → "Printing-India", "Printing-UAE" combinations |
| **7 layers: Kernel, Business Foundation, Modules, Localization, Industry, Tenant Configuration, Tenant Customization + Integrations axis** | Each layer has one reason to change; independent axes for country and industry | More vocabulary |
| Plugin-everything (everything is an app, like Odoo) | Maximum flexibility | Weak guarantees about what depends on what; harder for a solo developer to keep coherent |

## Decision

Adopt the seven-layer model. Dependencies point **only downward**. Higher layers extend lower
ones only through **published extension points**. Industry packages consist of
**configuration + optional code extensions**; they never modify module internals.
Core modification for a single customer is forbidden.

## Consequences

- Modules must publish extension points (calculators, validators, converters) deliberately.
- Localization is applied **per company**, not per tenant.
- Requires a package loader (kernel K12) and versioned packages.
- A clear "where does this belong?" rule for every new requirement (Step 1 §10).

## What is configurable / what stays fixed

Fixed: layer boundaries and the downward-dependency rule. Configurable: which modules,
localization packs and industry package a tenant uses.
