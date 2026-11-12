# Merged security and offline reconciliation branch retirement (2026-11-13)

This one-time cleanup removes **only** the two exact GitHub branch refs whose feature work is already fully merged:

- PR #77 — Run 5 nested tenant and trusted context authorization, merged as `941e44ec3cc9f5f586c31d23b54ecdda95fe0f66`.
- PR #78 — offline sale input, replay, idempotency collision and financial receipt validation, merged as `b92803585d88a40de1fa275d29737dea01c56498`.

Before deletion, the read-only dry run and the one-time main job each validate unchanged exact branch tip, merged PR identity, merge commit contained in main, branch protection and absence of open-PR head/base dependencies. The retirement command is only permitted on the uniquely marked main merge. All original PRs #16 and #26 and their open draft branches are preserved (as are other finance, commerce, UI and cloud drafts).

This change does not alter application source, Supabase, customer data, payments or Vercel. Remove the temporary write-enabled workflow and script after the deletion log and branch inventory are verified. Keep the pinned manifest and this note.
