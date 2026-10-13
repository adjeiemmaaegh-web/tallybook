# Universal In-App Assistant — Stage Plan

**Status: implementation approved by owner request on 2026-10-06; this stage remains local-only and does not add an LLM, API, network dependency, or business-data schema migration.**

## Owner outcome
Users can describe what they want in ordinary, imperfect, or typo-filled language and Tallybook can distinguish business questions, app navigation, feature discovery, help, clarification, and financial actions without requiring exact route names or command syntax.

## Scope
- Audit and register the application's real user-facing routes and capabilities.
- Add safe application-navigation, feature-discovery, app-help, and app-explanation intents.
- Add direct actions using only verified application routes.
- Add generalized normalization and conservative fuzzy matching for application terminology.
- Add application-level clarification context and multi-turn follow-ups.
- Extend the existing parser evaluation with navigation, help, typo, context, negative, and transaction-safety cases.
- Fix Phase 2 data-lifecycle defects: reversal cleanup, restore audit cleanup, reversal refresh notification, and misleading context display.

## Exclusions
- No local LLM, API key, cloud AI, remote service, or network request.
- No invented routes, pages, buttons, or capabilities.
- No new accounting meanings, automatic financial writes, or fuzzy transaction execution.
- No changes to the authoritative business-record model beyond required cleanup behavior.

## Invariants and safety
- Existing business services and IndexedDB remain authoritative.
- Navigation/help fuzzy matches may suggest routes, but transaction intents require explicit verbs, validated entities, and existing confirmation.
- Ambiguous feature words ask clarification rather than guessing.
- Unknown or unavailable features are reported honestly.
- Company deletion removes all company-scoped records, including reversals and assistant audit entries.
- Backup restore leaves the restored company free of stale assistant audit entries.

## Validation and owner acceptance
- `pnpm check`, focused universal-assistant tests, full `pnpm test`, and `pnpm build` pass.
- Parser evaluation reports navigation/help/clarification metrics and zero dangerous transaction classifications.
- Route actions resolve only to registered current routes.
- Existing transaction, reversal, backup, and migration tests remain green.
- Owner tests typo-tolerant navigation, feature clarification, help, business-query separation, and multi-turn follow-up while offline.

## Checklist
- [x] Requirements reviewed.
- [x] Scope and exclusions defined.
- [x] Existing routes, navigation, feature modules, and assistant state inspected.
- [ ] Application knowledge registry implemented.
- [ ] Navigation/help/feature-discovery intents implemented.
- [ ] Conservative fuzzy application-language normalization implemented.
- [ ] Application clarification context implemented.
- [ ] Phase 2 lifecycle fixes implemented.
- [ ] Evaluation corpus and focused tests implemented.
- [ ] Type-check, full tests, build, and package verification completed.
- [ ] Completion handover and owner acceptance checklist written.
