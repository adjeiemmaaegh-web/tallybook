> **Current status: see [CURRENT_STATUS.md](CURRENT_STATUS.md).** Everything below is the October V19 release register and earlier handover notes. It is kept as historical evidence, and the "NO-GO / INCOMPLETE" decisions in it describe those snapshots, not the present shared shop.

**12 October 2026 — latest FIN-002 period reporting continuation:** Daily and expense-category projections independently reconcile to management headline totals, reject malformed historical dates and unsafe per-day monetary precision. Native QA 449/449, separate mock 4/4 pass; full client/build/browser not run. NO-GO. See `FIN002_PERIOD_CONSERVATION_CONTINUATION_2026-10-12.md`.

**Latest local update (10 October 2026):** Security helper continuation at [SECURITY_CONTINUATION_2026-10-10.md](SECURITY_CONTINUATION_2026-10-10.md) reports 171/171 local native tests, with client/build and external gates still unverified. Previous handover evidence below is historical.

# V19 release completion evidence

Release decision: **NO-GO / INCOMPLETE**. This directory is the current release register; historical stage notes remain evidence of their original snapshots and are not current certification.

Start with [the consolidated release report](RELEASE_REPORT.md), [local operations and recovery](OPERATIONS.md), and [the staging proposal awaiting approval](STAGING_PROPOSAL.md). Final local evidence: 696 client tests, type check, production build, six browser scenarios and four mock-payment tests pass. The full Windows Node/server gate remains failed (123 pass, 28 fail, one skip); remote Linux CI, hardware, live provider and staging verification remain open. Updated toolchain: Node 24.19.0 tested, pnpm 10.34.0, schema 26. Owner decisions: tax configurable/off by default; mock payments only; no approved provider or external deployment.

Authority: the user explicitly instructed this session to follow `TALLYBOOK_V19_DEVELOPMENT_AGENT_MASTER_PROMPT.md`, with `TALLYBOOK_V19_FULL_RELEASE_AUDIT_2026-10-10.md` as the audit. Copies are preserved under `source/`.

The initial working folder matched all 543 archive files, by individual SHA-256 comparison, in `tallybook-v19-stage12-cost-cutoff-hardening.zip`. Archive SHA-256: `C1202F98A9C132525EE4A386D2383602633E6DA5030D2A9D2BB1C4BD03EF82FE`. The folder initially had no Git repository and no installed dependencies. The source baseline is Git commit `a944037` on `codex/v19-release-completion`. A complete local backup, including local configuration, is retained in ignored `artifacts/release-v19/source-before-changes.zip`; do not publish this private backup.

Initial host: Windows, Node 24.19.0; package manager pinned by the source to pnpm 10.4.1. The audit's 152-test result was from a different environment. The initial local Node run returned 114 passes, 30 failures, and 1 skip (145 discovered tests; two suites could not load). Failures include missing TypeScript, a hard-coded Linux global TypeScript path, and server storage adapters that assume POSIX paths/permissions. TLS integration skipped because OpenSSL was not on PATH. These are failed/unexecuted gates, not source certification.

`traceability.json` tracks individual stage acceptance units and their source documents, implementation paths, required checks, dependencies, and status. `blockers.json` tracks release issues and evidence. A status of `implemented-unverified` means source exists but does not establish the complete acceptance criterion. `missing` includes partially implemented units whose required behavior is incomplete. Nothing is expressly excluded without product-owner approval.

Full execution logs and the source identity manifest are retained in `artifacts/release-v19/`. Do not interpret a successful subset of checks as permission to enable payments, inventory reservations, cloud financial replay, or authoritative multi-store operations.
