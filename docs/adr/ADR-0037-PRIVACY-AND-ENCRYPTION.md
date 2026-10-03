# ADR-0037: Privacy (DPDP Act) roles, data classification, minimisation, India hosting, encryption and secrets

- **Status:** Proposed
- **Date:** 2026-10-03
- **Discovery step:** [Step 6A §1, §4](../01-discovery/STEP-06A-ISOLATION-AUDIT-PRIVACY-AND-OPERATIONS.md#4-privacy-and-data-protection-dpdp-act-2023); question [Q-35](../tracking/OPEN-QUESTIONS.md#q-35)

## Context

The Digital Personal Data Protection Act, 2023 (and its Rules) applies to personal data in the ERP: users, contact persons, individual parties, operators. Customers will ask where data lives and who can see it.

## Decision

- **Roles:** the customer is the **Data Fiduciary**; we are the **Data Processor**, under a data processing agreement and a published sub-processor list.
- **Classification:** four classes (Public, Internal, Confidential, Restricted), stored in field metadata and driving masking, export and logging rules.
- **Minimisation:** no Aadhaar numbers, biometrics or sensitive categories. No employee salary or bank data in the MVP.
- **Rights:** tools to export, correct and anonymise a person's data. Statutory retention prevails for books-relevant records.
- **Breach:** we notify the customer without delay with the facts; the customer notifies the Board and the individuals.
- **Hosting:** in **India**, with a backup region also in India.
- **Encryption:** TLS (1.3 preferred) in transit; at-rest encryption; **field-level encryption** for Restricted data.
- **Secrets:** kept in a **secret manager**, never in Git, packages or logs.

## Consequences

- Data processing agreement and sub-processor list are needed before the first paying customer.
- Hosting provider choice (Step 9) must offer Indian regions.
