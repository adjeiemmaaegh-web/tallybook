# Stage 9 Round 1 account/navigation integration (2026-10-14)
**Candidate only, NOT DEPLOYED, release NO-GO.**

The newer premium AppShell showed its account button but routed it to `/staff`, a local PIN control. The router already defines `/account`. This candidate corrects the header account button to point to the actual account page while preserving all premium navigation and keeping AuthGate off by default.

The new native source-contract QA checks that the premium header opens `/account`, that the route exists, that AuthGate wraps DatabaseProvider, and that the cloud auth feature flag is opt-in. It is intentionally a static integration guard; it does not validate browser clicks or actual session/logout flows.

The reviewed PR #7 security changes since `99adfd37...` contain seven paths, including new negative tests and updates to private owner/recovery flows. Their exact Git blob versions are staged here for review, but real database tests, privileged server execution and safe identity-recovery acceptance are still outstanding.

Vercel protection is enabled for previews, but automatic branch deployments are permitted. This Git commit is unreferenced to prevent a new branch push; neither main nor the multi-store branch is moved. No production feature flags, Supabase schema, cloud data or Vercel configuration were changed.
