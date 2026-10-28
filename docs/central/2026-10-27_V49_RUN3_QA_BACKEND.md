# V49 isolated Run3 backend candidate

*Test project only:* \`lmneuqxfyxplrxjswpma\`. This is not a production migration.

- The single SECURITY DEFINER RPC carries out owner invitation, recipient acceptance, owner revocation, invitation cancellation and member listing as atomic SQL statements. Only \`service_role\` can EXECUTE; \`anon\` and \`authenticated\` cannot.
- The API must independently verify each bearer token via Supabase Auth.getUser, confirm the account ID and JWT session claim, and require the active \`auth.sessions\` record inside the SQL transaction.
- Invitation token bytes must be randomly generated server-side and **only SHA-256 token digests** retained in the DB. 15-minute expiration, target-account binding, owner role recheck and audit are mandatory.
- All financial, customer and local PIN data remain local. Member status never grants POS authority.
- Revocation fails closed if active device or staff bindings remain; explicit revocation workflow is required before user deletion.
- The Edge endpoint must reject production project configuration; this migration must **never** run against \`qfyydfxwvifdvffdfgeu\`.
- The tested mobile/browser journey still requires consenting inbox-controlled Auth accounts and an isolated preview client. No production deployment authorized.
