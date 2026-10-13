# Stage 1 V8 — Build 11: recovery access and storage durability

## Changes
- Keep the Sales screen reachable when inventory is empty but there is a pending/damaged/unavailable checkout journal or a recently saved receipt. This prevents the empty-inventory onboarding gate from hiding required recovery controls.
- Before a financial write, verify that the locally stored checkout journal can be read back with the original submission key. Reject checkout if the browser silently drops the write or throws an exception, e.g. storage quota exceeded.
- Add regression cases for silent storage-write failure and quota failures.

## QA limits and deferred validation
- Requires full Vitest and TypeScript build in a dependency-enabled environment.
- Browser test: start uncertain checkout, archive all products, reload Sales screen, ensure recovery warning/action remains reachable.
- Browser test: denied/quota-exhausted localStorage prevents `completeSale` from being invoked.
- Run complete offline, scanner, thermal receipt, interrupted-save, and mobile-device test matrix before production.
- These tests are deferred until the full project is finished and the user moves final validation to Work.
