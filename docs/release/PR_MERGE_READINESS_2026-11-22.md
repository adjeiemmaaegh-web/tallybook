# Pull request audit and recommended merge order (2026-11-22)

**No PR was merged, closed or modified. Production remains NO-GO.** Merging needs the owner's explicit approval.

## Evidence
| PR | Head | State | CI (check runs) | vs `main` (`c2792d1`) |
|---|---|---|---|---|
| **#112** Stage 21 + refunds/loyalty, sync/payment simulations, ops docs | `a78e17e` | open, ready | **14/14 accounted for: 13 success, 1 skipped by design** (live public HTTPS check). macOS WebKit failed once (`browser-release.spec.mjs:49`, owner-unlock), passed on rerun of the same SHA. CodeQL + security-extended, redacted full-history secret scan, financial/TLS/package regressions, Pinned Node 24 developer QA, 100x20 assistant replies, visual-integration, Chrome/Firefox/Edge: success | 80 commits, 308 files, **0 merge conflicts** (`git merge-tree`) |
| **#111** ST24-05 ledger encryption (draft) | `de63cf8` | open, draft | **9/9 success** incl. WebKit, Edge, real Dexie v39 job, CodeQL | 62 commits, 56 files, **0 conflicts with main** |
| **#105** Stages 21-32 checkpoint (draft) | `7b3815a` | open, draft | last green runs are from 2026-11-17 | **1 conflict with main** (`server/index.ts`); based on an old main (`41d4bab`, 5 behind, 40 ahead) |
| #85 production fresh-start release doc | `636e57a` | open, draft, docs only | not re-run | based on a much older main; **not a merge candidate** |

**Dependencies found**
- **#105 is already contained in #112** (`git merge-base --is-ancestor` true). Merging #112 delivers all of #105's commits, so #105 becomes redundant, and its one conflict never needs resolving.
- **#111 vs #112: 2 trivial content conflicts** (`client/src/features/customers/customers.ts` both sides add one import; `playwright.device-engines.config.mjs` both sides extend the test list). I resolved them in a **scratch merge that is not pushed**: `tsc` clean and the **full client suite 273 files / 2153 tests pass** on the combined tree. Whichever merges second needs the same two-line resolution.
- #111 is **opt-in encryption**, but it touches the ledger open path (DBCore middleware), so it should be merged only after the acceptance steps below.

**Incomplete work**
- #111: encrypted-ledger **schema upgrade** not built (safe refusal today), real-device and independent security review pending, hardware security key not implemented. Its PR body still says "NOT active-ledger encryption" and is stale (the ledger encryption is wired and tested; the description predates that).
- #112: Stage 21 register still shows 94 partial / 4 missing / 20 owner-blocked tasks; it is a development checkpoint, **not a production release**.
- Known flaky test: macOS WebKit owner-unlock (see `WEBKIT_STAFF_UNLOCK_INVESTIGATION_2026-11-19.md`, now two recorded occurrences, passes on rerun; root cause still unproven).

## Recommended order (safest, based on the evidence above)
1. **#112 into `main`** (green, conflict-free, contains #105). Take it only after you accept it as a development checkpoint; it does not apply database migrations or deploy anything.
2. **Then #111** (after resolving the 2 trivial conflicts as in the scratch merge, re-running CI on the merge result, and ideally after the section D encryption drill). Keep encryption opt-in.
3. **Then close #105** as superseded (your decision; I did not close it) and keep or retire #85 on your judgement.
4. **Database migrations are independent of the PR merges** (merging does not apply them): see `MIGRATION_STAGING_PLAN_2026-11-22.md`. Do not apply until staging is chosen and approved.

## Decisions for the owner
Approve/decline the merge of #112; approve/decline #111 after conflict resolution; confirm #105 may be closed as superseded; decide whether #111's stale PR description should be rewritten.


---
## Update after owner decisions (2026-11-22, later): #112 review and #105 proof

**Approved order: #112, then #111. Nothing merged, closed or pushed outside permissions.** #112 is not merged until you accept this review.

### #112 change and dependency review (head includes everything below; `git diff origin/main...HEAD`)
| Area | Files | Review finding |
|---|---|---|
| `client/src` | 142 (+6.8k/-0.3k) | Refund policy/allocation + loyalty reversal, wallet/split-tender returns, WebAuthn step-up (new, not yet wired to any screen), reports/integrity/backup updates. Covered by 2153 client tests (scratch-merge run) and CI. |
| `server` | 7 | Payment settlement service + webhook route (**not mounted anywhere**: `mountPaymentWebhookRoute` has no caller, so no webhook endpoint exists), retention/alert modules (off by default, no I/O), sync simulation test, and one `server/index.ts` change: startup failure now exits non-zero and prints no configuration. |
| `supabase` | 14 | The six migrations + rollbacks. **Merging does not apply them.** |
| `.github/workflows` | 3 | Adds Firefox/Chrome device jobs, evidence upload (14-day retention), a repeat-build checkpoint, CodeQL SARIF gate. No deploy steps, no new secrets, permissions stay `contents: read`. Cosmetic cruft: a push filter for a stale branch name `codex/road-to-complete-security-triage`. |
| dependencies | 0 | `package.json` and `pnpm-lock.yaml` are **unchanged**. |
| `docs/release` | 88 | Evidence/plans; the register states 94 partial / 4 missing / 20 owner-blocked, i.e. **not production-ready**. |
| other | `vite.config.ts` (+2: notices file not answered with the app shell), `client/public/third-party-notices.txt` (licence text, published), `artifacts/ui-visual/*.png` (6 screenshots, ~2.5 MB committed binaries, repo-hygiene note), `candidate_modules/batch5` (test tweak). |
Native suite exactly as CI runs it: **1357 pass / 0 fail** (`node --experimental-strip-types --test scripts/historical-costing-check.mjs qa/*.test.mjs qa/*.test.cjs server/tests/*.test.mjs`). Not claimed: real devices, hosted behaviour, provider behaviour.
**Review conclusion:** no blocking defect found; remaining concerns are non-blocking hygiene (stale workflow filter, committed screenshots) and the intermittent WebKit flake. Recommend merge after your acceptance.

### #105: proof that it is covered
- Commits in #105 not reachable from #112: **0** (`git rev-list main..codex/road-to-complete --not <#112 head>`). Tip `7b3815a` is an ancestor of the #112 head.
- Of the 195 files #105 touches, #112 contains all of them (nothing deleted); 14 differ only because #112 later modified them.
- #105's stated outstanding scope maps to: whole-ledger encryption -> **#111**; multi-tender/partial refunds -> **#112** (`4ba8b6d`); provider adapter/settlement/refund/dispute handling -> **#112** sandbox ledger + webhook (real provider still unapproved); migrations 38/39 unapplied -> **migration plan**; every remaining item is tracked in `MASTER_COMPLETION_REGISTER.md`.
- **Recommendation: close #105 as superseded once #112 is merged** (not before; I did not close it). Its retained ref `codex/checkpoint-20261117-3a87d295` should stay.
