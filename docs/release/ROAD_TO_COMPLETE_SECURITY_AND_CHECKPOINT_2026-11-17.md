# Security repair and development checkpoint — 2026-11-17

This is development evidence, not stage acceptance or commercial release approval. Production and main remain unchanged.

## Exact sources and observed results

- Main baseline: `41d4bab619db1808f21471299bd7760eee1a6836`.
- Review candidate `10355725d814dd04422debe717c2903435ab4a0a`: [Release validation 44039335537](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/44039335537) passed 1,193 native tests, 1,896 client tests in 237 files, semantic TypeScript, production build, 30 Chromium checks across seven configurations and the moderate-or-higher dependency advisory gate (no known vulnerabilities reported).
- Security run 44039335831 correctly failed: 12 High CodeQL findings and 632 historical secret-pattern matches. The older analyzer-only success did not certify absence of findings.
- Triage source `1e27e3fa5b824348039abfb6e08f81c14215f67a`: [run 44042644861](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/44042644861) found zero High/Critical CodeQL findings and passed descriptor, certificate-authenticated TLS and actual HTTP throttling regressions. A lower-severity test-CA file-flow finding remains reviewable; no query was excluded or severity lowered.
- Source-verification scan at `001b19d2b67cd1de61cd12aac940f672d9ccd9cf`, [run 44043308220](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/44043308220), verified 599 historical SHA-256 metadata values, 30 fixture submission identifiers, one locally available Git object and one intended browser-public Supabase publishable key. It correctly retained one unclassified historical Git ref rather than silently ignoring it.
- That final ref, `a4b83363552c43de77124fa87d8a8c183a644605`, was independently retrieved through the repository commit API: “Step 2B.1: redirect existing sessions away from sign-in.” It is the value of `feat/auth-gate-2b1` in the historical branch-cleanup manifest, not a credential. The next candidate pins this one read-verified object because fetched current refs no longer retain its Git object.

## Working fixes

TLS key/certificate validation now checks and reads one open descriptor with a size cap instead of reopening an inspected path. Offline evidence verifiers likewise use bounded reads from one descriptor. QA output files use exclusive creation and one descriptor. The HTTPS regression now trusts the generated local certificate and validates its SAN; certificate verification is enabled. The font-blocking browser-test regex is anchored to the actual URL origin.

A standard pinned Express limiter now guards all server API routes before request parsing and private I/O, and independently guards the mountable tenant router. Existing stricter access-operation limits remain. Its key uses the direct socket peer, never caller-supplied forwarded headers; an actual HTTP regression verifies rejected requests cannot reach parsing or writes. This is process-local defense; distributed deployments still need an approved shared enforcement design.

The historical scanner writes any matched values only to permission-restricted ephemeral files, suppresses scanner output and deletes those files on exit. Retained output contains only rule/path/line/commit/fingerprint/classification. The gate accepts only reviewed noncredential classes with original Git source evidence and rejects unknown findings. A new private key or arbitrary API credential is not ignored because it occurs in a test or manifest. Scan scope remains bounded to 20 MB targets, archive depth one and 180 seconds; this does not certify larger nested archives.

POSIX no-follow protects final file components where the runtime exposes it. Windows link semantics and hostile writable parent directories still require platform acceptance; these changes do not claim a secure multi-user filesystem sandbox.

## Stage 32 engineering

The new checkpoint packager records clean exact source/tree identity, pinned toolchain, file-content SHA-256s, unapplied SQL migration source, the full 119-task disposition register and a production dependency name/version inventory. It packages the web build, not credentials, customer databases or a new live server configuration. It refuses symlinks, path traversal, duplicate entries, missing service workers, stale/dirty source, file corruption, unlisted payloads and forged GO/owner-approval metadata.

CI builds twice in the same isolated Linux job, requires identical manifests and verifies the retained package. This establishes same-environment repeatability only if that new job passes; independent-machine reproducibility, physical devices and the final customer distribution remain open. New source has not yet passed that verification at the time of this commit.

The artifact is explicitly a **development checkpoint / NO-GO**, not the frozen final release candidate. It never applies SQL, rotates secrets, deploys, moves money or grants release approval.

## Remaining and handoff

Register dispositions after this increment: 1 verified, 84 partial, 4 missing, 21 owner/external blocked and 9 unreviewed; 119 total. Only evidence-backed task closure changes these counts. No stage is declared fully accepted. Mandatory source work still includes production-grade provider settlements, approved complete financial replication, and other finance/inventory/commerce/privacy/recovery requirements recorded individually. Owner-controlled leaked-password protection remains disabled and unchanged.

The local execution workspace became unavailable during this session. Work continued with review-branch source commits and isolated GitHub CI; exact local tree equivalence after the outage is not claimed. Retained GitHub artifacts expire after 14 days, so an accepted release needs a separately retained evidence package.

Next: run full CI on the integrated checkpoint source, inspect every failure, then continue the nine unreconciled finance/inventory/sync tasks and remaining mandatory engineering. Main merge, production configuration, field acceptance and live payments remain separately gated.
