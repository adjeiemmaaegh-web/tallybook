# Tallybook V19 — Master Development Source

This is a **single consolidated development archive**, not a finished release.

## Canonical source
The October 24 consolidated local source is the primary working tree, retained at its original relative paths to avoid breaking imports, tests, and tooling. Do not confuse `candidate_modules/` with integrated production code.

## Historical differences
Six files differed from the uploaded Stage 11 company-isolation increment. Their earlier versions are preserved under `engineering/stage11_prior_versions/`, outside executable app paths. Review differences before any future merge.

## Orientation
- `client/`: frontend application and Dexie persistence
- `server/`: server code and tests
- `shared/`: shared contracts and types (where present)
- `qa/`: native QA tests
- `candidate_modules/`: exploratory/checker/test candidates, not all integrated
- `docs/`: existing project documentation and blocker tracking
- `scripts/`: tooling and QA scripts
- `engineering/`: this master handover and historical differences

## Release status
NO-GO / INCOMPLETE. No deployment, live payment, or cloud/database change was made. No full build, browser, database, or semantic TypeScript verification was performed by this packaging operation. Prior reported test counts are not independently re-run here.

## Next engineering steps
Resolve authoritative Dexie v30 vs separately reported v33 branch; complete remaining finance and central integration development; run full pinned-toolchain automated tests; defer physical acceptance with explicit blocker tracking.
