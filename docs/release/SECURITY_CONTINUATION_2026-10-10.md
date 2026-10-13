# Security continuation — local release increment, 10 October 2026

**Release decision: NO-GO / INCOMPLETE.** The owner requested the next locally executable development increment, with no external accounts, hardware, repository machine or staging approval. This increment works from the **previous patched continuation archive**, not the original V19 handover. No runtime flags were enabled and no external deployment or live payments took place.

## Scope and implementation

Issue `SEC-002` addresses a newly identified security defect in the **optional, disabled cloud identity foundations**, specifically file-backed credentials, sessions, directory reads and enrollment:

- `syncLogin.mjs`: converted process-local session issuance queue into a bounded exclusive POSIX file lock with inode recheck on unlink, applied private parent/regular-file/one-link rules, protected rename/sync of private session snapshot, and reauthenticated under the acquired lock to reject a disabling/credential rotation during another writer's wait.
- `syncEnrollment.mjs`: converted process-local enrollment queue into the same cross-process locking discipline for invitation issue/consume/device revoke, and hardened registry read/replace against unsafe links and directory/file modes.
- `syncSessionStore.mjs`: reject world-readable snapshots, hard links, unsafe parent directories and extra root/session fields; always reopen snapshots for revocation checks.
- `syncDirectory.mjs`: replace check-then-read pathname with `O_NOFOLLOW` descriptor-based reads and private parent/file/link checks, preventing a symlink-swap read race.
- Added native regression tests with **five independent Node processes** issuing simultaneous sessions and invitations, plus negative tests for pre-existing locks, concurrent disable, near-capacity session-file preservation, world-readable files, hard links and symlinks.

The stale-lock policy deliberately **fails closed** and requires an operator to investigate and remove a leftover lock. Do **not** delete an existing lock while another writer may still be running. The filesystem lock is an interim POSIX single-host durability boundary; it is **not** a substitute for a production transactional identity database, HA shared storage, robust operator recovery tooling, or comprehensive session/device revocation.

## Actual execution

- Test host: Linux x86_64, Node 22.16.0, OpenSSL installed; source pins Node 24.19.0. Native suite: **171 passed / 171 total, 0 skipped**, command `node --experimental-strip-types --test scripts/historical-costing-check.mjs qa/*.test.mjs qa/*.test.cjs server/tests/*.test.mjs`, exit 0. Log: `artifacts/continuation-2026-10-10-security/native-final.log`.
- Focused suite: session, login, enrollment and directory tests passed; see `artifacts/continuation-2026-10-10-security/targeted-final.log`.
- Node syntax checks (`node --check`) for modified JavaScript modules passed. Git diff whitespace check passed before packaging.
- Client Vitest, semantic TS, frozen install, Vite build, Playwright, remote CI, hardware/WebAuthn and staging remain **NOT VERIFIED** with current source: dependencies and pnpm are absent. See `artifacts/continuation-2026-10-10-security/unavailable-client-gates.log`. The handover's successful client/build tests were for older source.
- `SEC-002` is **implemented-and-tested for the narrow local POSIX helper scope only**. `CLOUD-001`, `SEC-001` and `DATA-002` remain blocked/incomplete at their full acceptance boundary.

## Next order of execution

Retest the pinned Node/pnpm client/types/build/browser gates as soon as an environment with dependencies exists, then resume Phase A full financial/refund/payable reconciliation and Phase B exhaustive client service authorization. Do not enable cloud financial replication, public payments or authoritative multi-store transfers based on these changes. No provider, staging, or physical device was assumed.
