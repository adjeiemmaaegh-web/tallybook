# V19 — cash return / stock and FIFO cross-link continuation (11 October 2026)

**Release decision: NO-GO / INCOMPLETE.** Input was the exact verified `TALLYBOOK_V19_CASH_RETURN_REVIEW_CONTINUATION_2026-10-11_SOURCE.zip`, SHA-256 `6b4d7e1e66cfd93ee0943f03c0b68b1077a205d647213411c15a6be6e358e1eb`. No old source was substituted.

## Implemented locally

- Added a pure, read-only `assertCashReturnStockLinks` validator that requires each prior cash return's saved stock movement and FIFO restoration to match its original sale line, issue, product, company, quantity and posting timestamp. It independently checks duplicate/missing identifiers, stock movement conservation and deterministic original FIFO receipt allocations across repeated returns.
- The read-only Sales cash-return preview obtains prior return movements and cost events in the **same Dexie read transaction** and fails closed when historical records no longer match. The UI still cannot invoke `recordConfirmedCashPartialReturn` or hand out cash.
- The narrow `recordConfirmedCashPartialReturn` service now checks historical refund/stock/FIFO linkage inside its **write transaction**, before making another return. This guards against issuing another refund against a corrupted earlier physical/cost posting. Existing final per-return finance and staff authorization checks remain.
- Added seven dependency-free native reconciliation tests and two UNEXECUTED IndexedDB/Vitest tests simulating tampered prior return movements/events.

## Evidence

- Linux Node 22.16.0 / OpenSSL 3.5.5: **325/325 native Node/QA tests passed**, zero failures/skips, including seven new tests. `artifacts/continuation-2026-10-11-return-links/native-final.log`.
- Separate local mock gateway contract: **4/4 passed**. `artifacts/continuation-2026-10-11-return-links/mock-final.log`.
- Five changed TS/declaration files syntax parsed successfully; full `tsc --noEmit` failed because Node and Vite types were not installed. `artifacts/continuation-2026-10-11-return-links/tsc.log`.
- pnpm/pinned Node 24 and project dependency installation unavailable; **Vitest, actual IndexedDB, production build, browser UI, historic migration and real crash tests NOT RUN**. Client changes are **implemented-unverified**, not a certified pass.

## Limitations and priorities

This is a narrow **historical stock/FIFO cross-link safety increment**. It does NOT validate all global inventory movements, authorize a cashier to issue money, change the read-only UI into a posting UI, cover providers, MoMo, wallet, credit, customers, batch disposition or damaged goods, resolve global cross-tab recovery, or close FIN-001/FIN-002/FIN-005/FIN-013/FIN-014. Other unverified source behavior remains unverified. Next agent must resume from the resulting stock-links continuation ZIP; run pinned client suite before activating any physical cash refund controls.
