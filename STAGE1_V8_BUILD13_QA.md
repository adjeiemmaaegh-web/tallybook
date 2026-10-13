# Tallybook V8 Stage 1 — Build 13 QA

## Implemented
- Preserve an existing parked draft, including malformed saved data, instead of overwriting it.
- Read back a freshly parked draft to detect silent browser-storage failures before clearing the active cart.
- Disable parking when a draft already exists or checkout recovery is unresolved.
- Surface specific parking errors to cashiers.
- Added regression cases for overwrite, damaged data, and silent storage write failure.

## Deferred QA
- Full Vitest regression suite and production build (project dependencies missing).
- End-to-end offline browser checkout, receipt and camera scanning on real phones.
- Printer compatibility and physical thermal printing.
- Full testing in Work after the *entire* Tallybook project is finished, per project instruction.
