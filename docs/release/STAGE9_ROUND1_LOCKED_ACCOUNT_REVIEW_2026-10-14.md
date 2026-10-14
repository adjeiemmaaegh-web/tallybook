# Round 1 — account access while local staff gate locked
On 2026-10-14, a read-only source review of the inactive Round 1 integration candidate found that the newly linked /account page was still blocked by the local staff PIN gate, which only exempted /staff. This defeats safe account access/sign-out for a signed-in user whose local staff PIN is locked.

This review candidate exempts /account alongside /staff from the **local AppShell navigation lock**. It does not unlock sales, inventory, reports, businesses or store writes. Cloud AuthGate remains disabled by default and continues to run before DatabaseProvider when enabled. Updated accessible account link label, existing AppShell test assertion and static route contract regression. Browser login/log-out and account-switch isolation still require validation.

**Safety:** /account is not an authorization grant to local records; its contents must not expose ledger data. No state, session, database, flags, production config or deployment was changed. Release NO-GO.
