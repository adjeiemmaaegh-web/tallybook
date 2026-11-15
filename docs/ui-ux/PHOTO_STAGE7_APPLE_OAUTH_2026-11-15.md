# Photo stages 7 and 25 — Apple OAuth (source integration)

Added Apple as an optional Supabase OAuth identity provider on the existing verified sign-in page. The button is hidden unless VITE_APPLE_OAUTH_ENABLED=true at build time and a Supabase URL and publishable key are configured. Google and email flows are unchanged.

Enabling the UI flag is not equivalent to making authentication work. Before enabling in any hosted environment:
1. Establish and verify lawful Apple Developer team, Services ID, domain and Sign in with Apple private key/secret; configure Supabase Auth provider and approved callback origins.
2. Verify the Tallybook origin's OAuth redirect allowlist, nonce/session handling, Safari/iOS behavior and verified sign-out/return.
3. Confirm Apple private-relay email does not accidentally associate a different Tallybook member or grant staff access. Membership remains tied to verified account ID and an owner-issued invitation.
4. Test account switching, revoked sessions, direct navigation and failed/cancelled provider redirects on real devices.
5. Only then explicitly enable the flag in approved build settings and perform full exact-head CI/QA.

No Apple credentials are stored in repository source. No external provider was configured or live login attempted. Treat this as implemented-unverified, not accepted Apple login.
