# Local advisory review completion

The existing Insights review panel now permits owners and reports-authorized supervisors to acknowledge or reopen an advisory with a factual note. This enables local review only; `RUN17_AUTOMATIC_ACTIONS_ENABLED` remains false. No customer message, purchase, payment, stock adjustment or cloud operation is performed.

Before enabling the previously gated write path, the evidence read and journal/audit writes were moved into one coordinated IndexedDB transaction over their source tables. The UI sends the evidence key it actually displayed. A changed finding is rejected and requires refresh; the app does not silently acknowledge a newer finding. Retry keys are bound to the actor and exact decision. Company and staff identity are checked before returning, including after the audit write. Failed audit writes and session changes roll back the review event too.

Verification: six client integration tests pass. They exercise restart persistence, exact retries, reopening, backup validation, unchanged products/no financial writes, stale evidence, unauthorized cashier/locked sessions, audit failure rollback, session-change rollback, concurrent acknowledgements and cross-company denial. TypeScript and Vite/PWA build pass. See `artifacts/advisory-review-{client,types,build}.log`.

This completes the local manual-review workflow; it does not satisfy S11-05's separate requirement for opted-in scheduled automation and notification verification. That acceptance unit remains incomplete. User acceptance has not been performed.
