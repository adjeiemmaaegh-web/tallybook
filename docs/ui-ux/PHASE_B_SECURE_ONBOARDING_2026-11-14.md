# Phase B — Business onboarding and secure employee joining

**Increment 1 (Stage photos 4 and 23; partial improvement of 3 and 22).**
Baseline: GitHub main `59c8b8b98036edade28877549c03875c3bda11f4`.

The authenticated, target-bound invitation system already existed and is **retained**. This work improves its setup UX and identity safety. The one-time token still expires after 24 hours and requires the exact intended authenticated user; no public personal-ID lookup or unverified email assignment is introduced.

Changes:
- Validate private invitation token syntax before submit; distinguish private invitation token from existing eight-character store join code.
- Allow owner to copy the private token securely and show precise recipient account ID instructions, without promising that email alone authorizes a membership.
- Invalidate late invite/list/revoke/accept results on user or business switch to avoid showing another account's token or stale membership status.
- Accessible token form and responsive private-code styling.
- Component tests: invalid code rejected locally, UUID-only owner invitation, late response after account switch discarded, attendant cannot see owner controls.

**Business-type gap:** The live `public.businesses` schema only contains id, owner, name, creation request, and timestamps; it has **no persisted type**. No authoritative business-category selector is claimed in this increment. A separately audited and migrated, owner-scoped business metadata schema is required before Stage 3/22 may be marked complete.

Remaining Phase B: product variant matrix, genuine customer public online ordering, cloud/offline assertions, Apple provider evaluation and accurate marketing routes. Do not conflate 'deployed' with real account/device acceptance. No database mutations, live invite creation, or payment actions were performed in this code review.
