# packages-config/

Localization (L3) and industry (L4) packages: YAML configuration validated by JSON Schema, plus small extension code (ADR-0011, ADR-0025).

- `india/` — GST, e-invoice, HSN/UQC lists, Indian rounding rules. Slice 0 (v0.1).
- `printing-packaging/` — attributes, categories, roles, terminology for printers. Slice 0 (v0.1).

Country and industry rules live here, **never** in the kernel or the modules (ADR-0002).
