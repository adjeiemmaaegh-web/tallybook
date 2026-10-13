# Stage 7 — V14 Complete Offline Business Suite: development progress

## Baseline and stage 6 handoff
Stage 7 began on `tallybook-v13-stage6-directory-security.zip` at the user's direction. Stage 6 cannot be certified complete: exhaustive authorization/staff attribution review remains unfinished, and browser WebAuthn, actual IndexedDB migrations, Vitest, semantic TypeScript checks, and Vite production build are unexecuted. These are carried into the final release blocker log, not claimed as passed.

## Stage 7 build 1: local stock alert center
Added an `/alerts` page accessible from desktop navigation, displaying company-scoped low and out-of-stock product thresholds from the existing authoritative inventory snapshot. It ignores service products, rejects inconsistent stock records rather than showing misleading alerts, never mutates inventory, and requires no cloud or OS notification permissions. Refreshes on company change and browser focus; does not promise background notifications. Added pure regression tests.

## Remaining Stage 7 implementation
Unified onboarding/navigation review; customer-facing POS display; printer/device compatibility work; notification preferences and optional permission-based delivery (currently in-app only); encrypted backup and restore verification; accessibility and performance; end-to-end Stage 1–7 integration.

## Testing
Regression tests are written but not executed unless separately recorded; unavailable dependencies prevent Vitest/semantic type-check/Vite build. Real browser and hardware testing deferred. Production status: NOT CERTIFIED.

## Stage 7 build 2: company-scoped alert display preferences
Added explicit per-company, per-device severity filters to `/alerts`, with verified storage writes and fail-closed handling for malformed preference records. These filters never mutate inventory, stock thresholds, or authoritative financial records. Added a switch-company snapshot guard to reduce the risk of showing stale cross-company alerts. No background push delivery is claimed. Added regression tests for isolation, defaults, damaged records and storage failures.

### Build 2 verification and deferred QA
Direct preferences runtime checks and archive checks are recorded in `STAGE7_V14_BUILD2_QA.md`; full Vitest, semantic TypeScript compilation, production build, and browser company-switch testing remain unverified until dependencies and browsers are available. Stage 6 security audit remains an unresolved prelaunch code blocker.

## Consolidated Stage 7 implementation and audit
Customer-facing read-only cart, arithmetic-safe display totals, local foreground notification action with explicit permission, and accessibility Escape/close behavior added. See `STAGE7_V14_COMPLETION_AUDIT.md`. Stage 7 completion remains blocked by full-suite/build and device/browser integration verification. Stage 8 not started.
