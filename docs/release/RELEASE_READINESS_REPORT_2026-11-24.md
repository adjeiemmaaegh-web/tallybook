# Tallybook release-readiness report (2026-11-24)

**Decision: NO-GO for production.** Developer-owned engineering moved forward this round, but required release gates are owner-, external- or database-dependent and are not satisfied. Nothing was deployed, no PR was merged in this round, and no hosted database was changed (database migration work belongs to ChatGPT; see `DATABASE_MIGRATION_HANDOFF_FOR_CHATGPT_2026-11-24.md`).

## 1. Completed this round (developer-owned), with evidence
| Area | Change | Evidence |
|---|---|---|
| CI blocker (#111) | Third-party notices regenerated for `@noble/ciphers`/`@noble/hashes` (native regression failed on `57a1387`) | native 1399/1399 on `f3cc0b0` |
| Encryption (#111) | **Encrypted-ledger schema upgrade**: crash-safe re-projection under a durable marker; no downgrade; interrupted changes refused; UI "Update your encrypted records" | `st24SchemaUpgrade.test.ts` 5 tests, 7 deliberate breaks caught; client 276 files/2169 tests; forced-encrypted 2115 pass/54 skipped/0 fail; `docs/security/ST24_05_ENCRYPTED_SCHEMA_UPGRADE_2026-11-24.md` |
| Financial integrity | **Partial returns of batch/expiry-tracked lines** restore units to their source batches (newest allocation first, never more than a batch supplied); journal audit refuses forged batch evidence | `batchLineReturn.test.ts` 4 tests, 6 deliberate breaks caught |
| Multi-device sync | **Owner-only, audited, write-once conflict resolution** (keep-local / duplicate-delivery / escalate by conflict kind, mandatory reason; ledger outside the transaction scope); integrity audit cross-checks resolutions | `conflictResolution.test.ts` 5 tests, 6 deliberate breaks caught |
| CI blocker (both branches) | Full-history secret scan: reviewed placeholder key in the inactive Resend adapter test classified (scoped to that file) | local gitleaks 8.30.1 full history: 0 unclassified; CI security audit success on `411e95c` and on #111 |
| CI flake root cause | WebKit failures explained: tests acted while the app's start-up held the exclusive data lock; product refused safely. Shared fixture now waits for a lock-quiet page and retries only that refusal | WebKit job: the previously failing tax test passed on #111 `aa54a1b`; keyring spec fixed in `9fc9e14` (Chromium local 14/14 twice); WebKit re-run pending |
| Register | ST24-05, ST28-03, ST28-04 moved from missing to **partial** with evidence; ST22-02 and ST26-04 updated | `node scripts/road-to-complete-register.mjs`: 0 errors; 1 verified, 97 partial, 1 missing (real payment adapter), 20 owner/external-blocked |

## 2. Test results at the time of writing
- Client (vitest), branch `claude/cool-ride-cf8i8r` at `fd2fc30`: **266 files / 2084 tests pass**.
- Native/server (exactly as CI): **1372 pass / 0 fail**. PR #111 branch: **1399 / 0**.
- Type-check clean on both branches.
- CI on `411e95c` (branch, manual dispatch): security code audit **success**, device engines (Chrome/Firefox/Edge/WebKit) **success**, release validation **in progress**. CI on `aafca98`: release validation **success**, device engines **success**.
- CI on PR #111 latest head: running at time of writing (previous head: everything green except WebKit start-up race, now fixed in the spec).

## 3. Release gates
| Gate | Status | Owner |
|---|---|---|
| CI green on the exact release candidate | Branch: green except release validation pending; #111: pending re-run | Claude (verify) |
| PR #111 merged | **Not merged**; needs owner acceptance (real-device/clean-device recovery drill, independent review) | Owner |
| Six database migrations applied to staging, then production | Staging half-started (only #2 applied); production not applied | **ChatGPT** (staging), owner approval for production |
| Real-device, printer, security-key, restore-drill acceptance | Procedures written; not performed | Owner (scheduling pending) |
| Independent security review | Not started | Owner (reviewer pending) |
| Retention periods and legal bases | Proposal written; counsel verification pending; no deletion executor | Owner + counsel |
| Alerts (Resend) | Adapter inactive; recipients, sender domain, DNS, API key missing | Owner |
| Real payment provider | Not selected; simulations only | Owner |
| Ghana VAT on returns | Needs a certified tax-correction process | Owner + tax adviser |
| Register: 97 partial / 1 missing / 20 owner-blocked | Open | Mixed |

## 4. Remaining developer-owned work (next, in order)
1. Confirm CI on the latest heads (both branches) and fix anything red.
2. Owner-facing screen for sync-conflict resolution (API and audit done).
3. Restore redeemed loyalty points on returned sales; service-line returns; credit-note rows in the debt timeline UI.
4. Per-action/role/tenant permission matrix extension for new entry points (conflict resolution, security keys, batch returns).
5. Partial store-transfer receipts and store-specific batch provenance (ST23).
6. Continue the per-criterion reconciliation of the 97 partial register rows.

**Production remains NO-GO** until every gate in section 3 is satisfied and the owner explicitly authorizes release.
