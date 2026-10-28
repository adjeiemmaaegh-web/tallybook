# Supabase Edge Function: tallybook-run3-qa
For **isolated** Supabase project \`lmneuqxfyxplrxjswpma\` only.
Deploy with \`verify_jwt=true\`. Requires \`SUPABASE_URL\` and server-only
\`SUPABASE_SERVICE_ROLE_KEY\` supplied by the platform. The function checks
the project URL before it can use the secret.

Default accepted Origin is the **isolated project's own HTTPS origin**
(for server-side test scripts). To allow a separately deployed HTTPS QA
browser, set exactly one \`RUN3_QA_ALLOWED_ORIGIN\` in the isolated Supabase
function secrets. Never configure the live Tallybook domain as the QA origin.

Membership routes:
\`/functions/v1/tallybook-run3-qa/invite\`
\`/functions/v1/tallybook-run3-qa/accept\`
\`/functions/v1/tallybook-run3-qa/revokeMember\`
\`/functions/v1/tallybook-run3-qa/revokeInvite\`
\`/functions/v1/tallybook-run3-qa/listMembers\`

Requires \`Authorization: Bearer <real Supabase JWT>\`,
\`apikey: <test publishable key>\`, \`Origin\`, JSON body.
The function re-validates JWT through Auth.getUser. The test SQL RPC
verifies \`auth.sessions\` and owner/member scopes inside one transaction.
No offline client can call these routes without a live Auth session.
All financial operations remain unavailable.

V53 draft routes `pullChallenge` and `pullSales` remain **disabled** unless
`RUN3_QA_SIGNED_PULL_ENABLED=true` is explicitly set in this isolated project.
They also require the V53 one-use challenge schema, a live approved device key,
and an Ed25519 signature over the company, account, device, challenge and exact
cursor. A consumed or expired challenge cannot be replayed. The currently
deployed version remains disabled; the V53 schema has only been checked in a
transaction that was rolled back. Do not enable or deploy V53 until real
owner/attendant and enrolled-device acceptance can be run.

*No production rollout or claim of real-browser acceptance.*
