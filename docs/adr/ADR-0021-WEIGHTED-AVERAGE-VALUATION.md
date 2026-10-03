# ADR-0021: Moving weighted-average valuation for purchased stock in the MVP

- **Status:** Accepted (founder, 2026-10-03)
- **Date:** 2026-10-03
- **Discovery step:** [Step 4D §6](../01-discovery/STEP-04D-INVENTORY-AND-QUALITY.md#6-valuation--moving-weighted-average); question [Q-17](../tracking/OPEN-QUESTIONS.md#q-17)

## Context

Material issues to jobs need a cost, and stock needs a value for the accountant and for job
costing. Indian accounting standards allow FIFO or weighted average; SMEs and Tally commonly use
average methods.

## Options considered

| Option | Pros | Cons |
| --- | --- | --- |
| **Moving weighted average** (per item per company) | Simple; stable costs; easy to explain | Less precise when prices swing |
| FIFO | Precise layers | Layer tracking on every issue and return; harder to explain and correct |
| Standard cost | Variance analysis | Needs cost maintenance; unfamiliar to SMEs |

## Decision

Purchased material uses a **moving weighted average** per item per company, including landed
costs (freight). Finished goods are valued at **actual job cost per unit**. Scrap is valued at a
configurable realisable rate. Customer-owned stock has no value. The valuation method is designed
behind an extension point, so FIFO can be added later.

## Consequences

- Back-dated receipts after issues need average recalculation rules (Step 8).
- The closing stock value report feeds the accountant's period-end entry in Tally.
