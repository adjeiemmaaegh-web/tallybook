# Development dependency audit — 2026-10-25

`pnpm audit --prod --json` initially found six production advisories: Zod (<4.6.6), body-parser (<2.4.0), and four fast-uri advisories (<3.1.9). The lockfile update resolved Zod to 4.6.7 and fast-uri to 3.1.9. A scoped `express>body-parser` override resolves body-parser to 2.4.0.

The final production audit exits 0 with 0 reported advisories. The exact JSON outputs are retained in the reconciliation evidence logs outside this Git worktree. This check covers published package advisories only; it does not establish application security or production readiness.

TypeScript semantic checking and both client and server bundles pass after the dependency change. Full unit and browser regressions remain required.
