# Tallybook Tiny NLU v2 — Stage 1 Plan

> **STATUS: STAGE 1 IMPLEMENTED. The isolated Tiny NLU v2 artifact is complete; production routing, schema, PWA configuration, business records, and ledger behavior remain unchanged.**

## Owner problem

Tallybook users should be able to express bookkeeping and in-app navigation requests with abbreviations, typos, missing vowels, phonetic spellings, informal Ghanaian/Pidgin wording, incomplete phrases, and conversational wording without requiring a sentence-level alias for every variation.

Stage 1 will determine whether a small compositional local NLU can materially improve the existing deterministic assistant without weakening financial safety or offline behavior.

## Current implementation findings

The real assistant subsystem was inspected before planning:

- `client/src/features/assistant/intentParser.ts` is the deterministic canonical intent parser and entity extractor.
- `client/src/features/assistant/languageUnderstanding.ts` already performs bounded vocabulary interpretation and safe token rewrites.
- `client/src/features/assistant/appKnowledge.ts` derives navigation from verified application routes.
- `client/src/features/assistant/entityMatcher.ts` resolves names against real local records and returns explicit ambiguity/suggestion states.
- `client/src/features/assistant/conversation.ts` handles bounded conversational memory and pronoun/follow-up resolution.
- `client/src/features/assistant/assistant.ts` routes queries and writes; writes already require preview and confirmation before existing business services.
- `client/src/features/assistant/types.ts` defines the current canonical intent taxonomy, parsed entities, previews, replies, and session contracts.
- Existing tests cover parser accuracy, navigation, entity ambiguity, extreme language, context, no-write behavior, previews, reversals, and business-service integration.
- The previous centroid model is an artifact/benchmark only and is not production-routed.

The project directory is not a Git working tree in the current sandbox, so the stage will use explicit file lists and before/after checks rather than relying on Git status.

## Stage 1 scope

### Included

1. Build a **compositional Tiny NLU v2 prototype** as an isolated, dependency-free TypeScript module.
2. Separate prediction heads/factors for:
   - mode
   - action
   - object
   - modifier
   - safety
3. Add a bounded lexical candidate generator for abbreviations, typos, deletion/insertion/substitution, transposition, and cautious phonetic similarity.
4. Add a modular Ghanaian informal-language concept resource, using reusable concepts rather than complete sentence aliases.
5. Add deterministic composition/mapping from semantic factors to the existing canonical Tallybook intents.
6. Add open-set rejection with calibration on validation data, including confidence, margin, reject threshold, and threshold metrics.
7. Add deterministic safety pre-checks for destructive/unsupported language before any model interpretation is considered.
8. Add separate role extraction for customer, product, supplier, amount, quantity, date/period, and payment method; live entity resolution remains delegated to the existing resolver.
9. Generate a substantially expanded corpus from the real assistant ontology, with controlled augmentation and duplicate/near-duplicate checks.
10. Create grouped train, validation, unseen-family, safety, OOD, ambiguity, and multi-turn-context benchmark sets.
11. Benchmark:
    - existing deterministic parser
    - existing centroid artifact
    - new compositional model
    - hashed feature sizes 4096, 8192, and 16384 where practical
    - float32 and compact/quantized representation where practical
12. Produce the exported local model artifact, inference implementation, benchmark harness, measurements, regression report, and developer handover.

### Explicitly excluded from Stage 1

- No production routing change in `assistant.ts`.
- No automatic fallback activation for users.
- No model-driven ledger write, entity mutation, confirmation bypass, or business-service replacement.
- No IndexedDB schema change or migration.
- No modification of historical records, stock, balances, receipts, payments, purchases, expenses, reversals, or audit data.
- No cloud API, API key, remote embedding, external model call, network dependency, or Python runtime in production.
- No general-purpose language model or neural runtime unless benchmark evidence first proves the linear/compositional approach cannot meet the target.
- No memorization of customer/product/supplier names in model weights.
- No permanent automatic learning from user corrections.
- No broad language support claim beyond the deliberately supported domain language resource.
- No UI evidence-panel or production assistant experience changes; those are a later stage.

## Architecture and boundaries

The planned isolated pipeline is:

```text
raw text
  → existing sanitization/preparation
  → bounded abbreviation/typo/phonetic candidate generation
  → concept features
  → tiny compositional factor heads
  → action/mode/object/modifier/safety candidates
  → deterministic canonical-intent composition
  → open-set rejection and ambiguity handling
  → benchmark result only
```

If a later stage is approved for integration, the production pipeline will remain:

```text
user
  → normalization and Tiny NLU suggestion
  → existing deterministic parser in parallel
  → parser authority / safe read-only fallback only
  → existing entity resolver and context
  → validation
  → clarification or preview
  → existing confirmation
  → existing business service
```

The Tiny NLU will never be authoritative for ledger mutation. High model confidence will never bypass deterministic validation or confirmation.

## Proposed implementation files

New files are preferred to minimize regression risk:

- `client/src/features/assistant/tinyNluV2/types.ts`
- `client/src/features/assistant/tinyNluV2/lexicalCandidates.ts`
- `client/src/features/assistant/tinyNluV2/languagePack.ts`
- `client/src/features/assistant/tinyNluV2/features.ts`
- `client/src/features/assistant/tinyNluV2/model.ts`
- `client/src/features/assistant/tinyNluV2/composition.ts`
- `client/src/features/assistant/tinyNluV2/safety.ts`
- `client/src/features/assistant/tinyNluV2/contextAdapter.ts` (read-only adapter/tests only if needed)
- `client/src/features/assistant/tinyNluV2/index.ts`
- `client/src/features/assistant/tinyNluV2/*.test.ts`
- `tools/tiny-nlu-v2-benchmark.ts`
- `tools/tiny-nlu-v2-data.ts` or generated corpus tooling
- `artifacts/tiny-nlu-v2/` for model, datasets metadata, metrics, and reports

Existing parser and business files will not be modified during Stage 1 except for additive test exports if a compile-safe test seam is genuinely required.

## Data and model design

### Semantic factors

The model will predict independently:

- **Mode:** navigation, query, action, help, explanation, discovery, unsupported, unknown.
- **Action:** open, show, view, check, list, find, search, create, add, record, pay, receive, adjust, compare, explain, delete, remove, cancel, refund, undo.
- **Object:** stock, product, customer, supplier, sale, payment, purchase, expense, report, balance, insight, category, feature, activity.
- **Modifier:** today, yesterday, last, last month, remaining, low stock, best, top, slow moving, outstanding, bought, paid.
- **Safety:** read-only, financial write, destructive, ambiguous, unsupported, OOD.

The deterministic composition table will map valid factor combinations to existing intents such as `NAVIGATE`, `INVENTORY_QUERY`, `CUSTOMER_BALANCE`, `BEST_SELLING`, `RECORD_SALE`, `RECORD_CUSTOMER_PAYMENT`, and `RECEIVE_STOCK`. Invalid or conflicting combinations will yield alternatives, ambiguity, or abstention rather than invented intent.

### Features and footprint

The first implementation will use compact hashed features:

- character n-grams approximately 2–6
- word unigrams and bigrams
- token prefix/suffix and shape features
- abbreviation/deletion signals
- normalized domain concepts
- optional bounded phonetic features

Use class-balanced regularized linear/softmax heads, not one centroid per intent. Compare 4096, 8192, and 16384 feature spaces, and float32 against compact quantized weights where practical. Select the smallest artifact that meets targets; do not select by accuracy alone.

### Entity separation

The model will output role mentions only. It will not store live names in weights. A later integration benchmark will pass those mentions into `entityMatcher.ts` and report exact match, field precision/recall/F1, wrong-entity rate, unresolved rate, and ambiguity rate.

## Data and evaluation design

The corpus must be derived from the actual ontology and capabilities, not invented generic intent labels. It will include several thousand base/augmented expressions while preventing duplicates and near-duplicates.

Semantic-family grouping is mandatory. A phrase family or equivalent wording must not appear across training and unseen test partitions. Required sets:

- train
- validation
- unseen semantic-family test
- safety test
- OOD test
- ambiguity test
- multi-turn context test

The unseen challenge suite will contain at least 500 expressions, including variants of every mandatory seed in the supplied requirements, without placing those exact evaluation phrases into training.

Metrics:

- accuracy, macro precision/recall/F1
- per-intent precision/recall/F1 and confusion matrix
- unseen-family accuracy/F1
- abbreviation, typo, phonetic, Ghanaian-language, and compositional accuracy
- OOD rejection and calibrated threshold performance
- ambiguity handling
- entity precision/recall/F1 and wrong-entity rate
- context accuracy
- critical financial intent precision/recall
- destructive detection
- unsafe model-driven writes (must be zero)
- model size, load/parse time, memory, p50/p95/p99 latency, repeated-query CPU cost

## Acceptance targets

Stage 1 is **GO** only if the measured new model reaches or clearly documents the gap to these OK-stage targets:

- in-domain macro F1 ≥ 92%
- unseen-family accuracy/F1 ≥ 85%
- 100% on mandatory seed examples
- critical financial precision ≥ 98%
- critical financial recall ≥ 95%
- applicable deterministic entity resolution ≥ 98%
- destructive-action detection ≥ 99%
- zero unsafe model-driven ledger writes
- OOD rejection ≥ 98%
- p95 browser/device inference ≤ 10 ms where device testing is available
- model plus inference runtime preferably ≤ 1 MB compressed
- zero network dependency and zero production Python dependency

If any target is missed, the report must state the exact failure and mark the result **NO-GO** for production integration. The artifact may still be retained as a benchmark/research deliverable.

## Data safety and invariants

- Existing IndexedDB records remain the only business source of truth.
- No schema migration is proposed.
- No historical record, receipt, stock quantity, balance, payment, purchase, expense, reversal, or audit entry is rewritten.
- No production write path changes.
- The benchmark uses synthetic/disposable records only when testing the existing deterministic entity resolver; it never reads or alters owner data.
- If browser benchmarks are added, they use isolated test data and do not alter business data.
- Offline behavior is preserved: the artifact is local and has no network requirement.

## Validation plan

1. TypeScript type-check with `pnpm check`.
2. Focused Tiny NLU v2 unit tests.
3. Corpus integrity and partition leakage checks.
4. Benchmark harness across parser, old centroid model, and new model.
5. Safety regression tests for delete/remove/cancel/refund/reverse/undo/erase/clear/change/edit.
6. Mandatory seed and 500-expression unseen suite.
7. Existing full suite with `pnpm test`.
8. Production build with `pnpm build`.
9. Browser/PWA benchmark where practical: load, parse, memory, repeated-query latency, and offline shell/runtime check.
10. Final artifact size and zero-network verification.

## Owner acceptance gate

Implementation begins only after explicit owner approval of this Stage 1 plan and its boundaries.

Approval must mean: **build and benchmark Tiny NLU v2 in isolation, but do not route it through production `assistant.ts` and do not change any financial execution path.**

After Stage 1 is completed, delivery will stop for owner testing and a separate decision on whether a later stage may add a read-only fallback for navigation/query requests.

## Checklist

- [x] Requirements review from `pasted_content_5.txt`
- [x] Existing assistant, parser, context, entity, route, preview, confirmation, and business-service inspection
- [x] Scope and exclusions defined
- [x] Data/schema/migration analysis completed: no migration proposed
- [x] Safety invariants and acceptance targets defined
- [x] Owner explicitly approves Stage 1 implementation
- [x] Implement isolated Tiny NLU v2 artifact and inference
- [x] Implement grouped data generation and benchmark harness
- [x] Run focused and full validation
- [x] Write completion report and developer handover
- [ ] Owner acceptance testing

> **Stop gate:** no production behavior changes will be made until this plan is explicitly approved, and no production fallback integration will be started as part of Stage 1.
