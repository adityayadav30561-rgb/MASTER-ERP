# ADR-0013: One Party master with roles (customer, vendor, transporter …)

- **Status:** Accepted (founder, 2026-10-03)
- **Date:** 2026-10-03
- **Discovery step:** [Step 2 §4.5](../01-discovery/STEP-02-DOMAIN-MODEL.md#45-customer-and-vendor--one-party-with-roles); answers [Q-07](../tracking/OPEN-QUESTIONS.md#q-07)

## Context

The same legal entity is often both a customer and a vendor. For example, a paper mill sells
paper to a printer and buys back its trimmed waste. Separate masters duplicate GSTIN, addresses
and contacts, and give no combined view of the relationship.

## Decision

One **Party** master in the Business Foundation holds the legal identity: name, PAN, GSTINs,
addresses and contacts. **Roles** (customer, vendor, transporter, job worker …) hold
role-specific data. Each role's data is owned by the module that uses it: customer credit limit
and price list by Sales, vendor terms by Purchase, bank details by Accounting.

## Consequences

- Permissions can differ per role: Sales sees the customer role but not vendor bank details.
- Duplicate detection works on one identity (PAN/GSTIN).
- Screens show the party with tabs per active role.
