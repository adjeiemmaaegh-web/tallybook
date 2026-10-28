# V50 isolated server-side sale pull boundary

*QA database only:* \`lmneuqxfyxplrxjswpma\`. Not for production.

This intentionally read-only RPC requires **all**: an active live
\`auth.sessions\` row, canonical company membership, an owner-approved active
device public key mapped to the same Auth user and active local staff identity,
a current grant in the specific store, and an active staff/store assignment.

An attendant can see only event claims they authored in their assigned store.
The owner can see the assigned store's events. Each response has a stable
\`(received_at_utc,operation_id)\` cursor with up to 10 records and preserves
the distinction \`evidence_status=upload_claim_only\`: a signed client
claim is not independent proof of a real transaction.

The RPC is \`service_role\`-only; there are no direct browser Data API grants.
**It does not mount an HTTP route and does not turn on upload/replication.**
Positive authentication and device enrollment acceptance are still required.
