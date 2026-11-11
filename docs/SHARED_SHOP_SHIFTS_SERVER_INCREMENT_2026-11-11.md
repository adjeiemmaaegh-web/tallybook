# Cloud Shared Shop — staff shift / activity audit development increment

## Purpose
A shared shop device may be used by day and night attendants. The authenticated identity of each employee, verified server postings, and manual handover declarations must be stable separate historical facts. Never infer theft or negligence from an unexpected stock count.

## Implemented source
- Session-bound public.tallybook_shop_shifts checks auth.uid(), the JWT session ID and existing private.shop_member_role. A user cannot nominate the actual actor, and an attendant can open a shift only in their assigned store.
- shop_staff_shifts stores a client-generated idempotent shift ID, actual authenticated staff ID, authorized store, opening cash declaration, server time, and optional closing/review facts. A staff member may have one open shift per company.
- shop_staff_shift_events is append-only; a replay with identical details does not duplicate the event. Conflicting retries are denied.
- Owner-only auditEvents returns a stable timestamp/key cursor over accepted sales, stock movements, refunds, physical stock counts, purchase receipts, expenses, and shift events. It includes immutable actor IDs, source IDs, server time and appropriate quantity/amount evidence.
- New mobile shift and owner audit screens work through a distinct cloud RPC. No changes to existing sales posting, offline queue or local-device PIN shift logic.
- A missing backend shift migration produces an error only in Shift / Audit screens; the established POS remains available.

## Limitations and release gates
- Opening/closing cash are staff declarations, NOT a reconciled till balance or automatic proof of a difference. The owner reviews these declarations.
- Existing shop sales retain cashier ID and server recorded time. Offline device-claimed time is labeled unverified. This increment does not yet enforce shift_id on each sale or deny a sale outside an open shift.
- A stock difference is not proof of an employee's wrongdoing. Use sale IDs, stock movements, counts, timestamps and witness/manager review.
- Account switching needs online authentication; a previous user's saved sales stay in their original encrypted queue and must be reconciled under that account.
- No production migration, deployment, new payment logic or live data mutation is authorized in this development increment.
- PostgreSQL/PGlite negative security tests, TypeScript, client integration and browser validation must pass; real Android device testing remains required before commercial acceptance.
- Production adoption requires separate schema review, backup, documented rollback risks, rehearsal on a disposable DB and explicit owner authorization.

## Follow-up
Server-verified shift IDs on new sales (including offline replay), till-level cash reconciliation including non-sale cash movements, count witness, and owner reports correlating stock counts with events for human investigation.
