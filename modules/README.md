# modules/

Business modules (L2): `sales/`, `purchase/`, `inventory/`, `manufacturing/`, `quality/`, `accounting/` (Step 3, ADR-0014).

Each module has four folders:

| Folder | Visibility | Contains |
| --- | --- | --- |
| `contract/` | **Public** | Commands, queries, events and JSON Schemas other modules may use |
| `domain/` | Private | Business rules in plain TypeScript (no framework) |
| `application/` | Private | Use cases that orchestrate the domain |
| `infrastructure/` | Private | Database access (own schema only), adapters |

A module imports another module's `contract/` only. The build fails otherwise (`pnpm boundaries`, ADR-0015).
