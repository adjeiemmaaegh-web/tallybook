# Stage 4 (V11) Build 1 — Offline Quotations

Independent branch from V10 Stage 3 Build 9. Stage 2 (Manus) and Stage 3 costing integration remain open.

Implemented: Dexie v15 quotations table, immutable quotation lines with price snapshots, company-scoped customer/product validation, draft/issued/accepted/declined status transitions, dedicated /quotations screen. Quotation status changes do not create sales or reserve inventory.

Limitations: accepted quotations are **not automatically converted to sales** (requires careful integration with the finalized Stage 2 pricing/units and POS preview). Backup/restore needs extending for quotation records prior to release. Expiry is enforced on status transitions, and expiry display/automation remains to do. Customer groups, loyalty, wallet, quotation conversion, debt-aging and discounts are future Stage 4 builds.

Verification: TypeScript syntax parsing of edited files and archive integrity. Unit tests authored but cannot run without project dependencies. Database migration tests and browser QA deferred.
