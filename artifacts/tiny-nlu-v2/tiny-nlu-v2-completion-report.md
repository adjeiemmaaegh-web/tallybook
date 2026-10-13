# Tallybook Tiny NLU v2 — Stage 1 Completion Report

**Stage:** 1 — isolated compositional NLU artifact and benchmark

**Status:** Implemented and validated as an isolated research/benchmark component. **NO-GO for production routing.**

## What was implemented

The approved Stage 1 scope produced a dependency-free TypeScript Tiny NLU v2 component under `client/src/features/assistant/tinyNluV2/`.

The implementation contains independent semantic factor handling for mode, action, object, modifier, and safety; hashed character/word features; bounded abbreviation, typo, deletion, and phonetic candidate generation; a modular English/Ghanaian informal concept pack; role extraction for customer/product/supplier/amount/quantity/period/payment method; deterministic compositional mapping to existing canonical Tallybook intents; open-set rejection; and a deterministic safety pre-check.

The benchmark tooling is `tools/tiny-nlu-v2-benchmark.ts`. It generates grouped training/validation data, an unseen challenge suite, trains compact linear heads, exports a JSON artifact, compares against the existing parser and previous centroid benchmark, measures safety behavior, and writes machine-readable reports.

## Production boundary preserved

No production assistant routing was added. `assistant.ts`, existing entity resolution, context memory, transaction previews, confirmation, audit, IndexedDB schema, business services, and ledger writes were not changed.

The Tiny NLU output is suggestion-level only. It has no write authority. Deterministic destructive-language handling takes precedence. Financial-write candidates are marked `FINANCIAL_WRITE` and remain deferred; they cannot execute a sale, stock receipt, payment, adjustment, reversal, or any other business mutation.

No network request, cloud model, API key, Python runtime, external model call, or new database migration was introduced.

## Artifacts

- `client/src/features/assistant/tinyNluV2/types.ts`
- `client/src/features/assistant/tinyNluV2/lexicalCandidates.ts`
- `client/src/features/assistant/tinyNluV2/languagePack.ts`
- `client/src/features/assistant/tinyNluV2/features.ts`
- `client/src/features/assistant/tinyNluV2/model.ts`
- `client/src/features/assistant/tinyNluV2/composition.ts`
- `client/src/features/assistant/tinyNluV2/safety.ts`
- `client/src/features/assistant/tinyNluV2/index.ts`
- `client/src/features/assistant/tinyNluV2/tinyNluV2.test.ts`
- `tools/tiny-nlu-v2-benchmark.ts`
- `artifacts/tiny-nlu-v2/tallybook-tiny-nlu-v2.json`
- `artifacts/tiny-nlu-v2/corpus-metadata.json`
- `artifacts/tiny-nlu-v2/benchmark-report.json`

## Measurements

| Measurement | Result | Target/status |
|---|---:|---|
| Generated corpus | 2,128 examples | substantially larger than previous 421-example corpus |
| Train/validation split | 1,702 / 426 | grouped benchmark tooling present |
| Unseen challenge suite | 1,310 expressions | exceeds required minimum of 500 |
| Feature space | 8,192 hashed features | one compact configuration implemented |
| Exported model JSON | 454,694 bytes | below 1 MB compressed preference before transport compression |
| In-domain accuracy | 47.2% | below target |
| In-domain macro-F1 | 48.9% | **below required 92%** |
| Unseen accuracy | 35.9% | **below required 85%** |
| Unseen macro-F1 | 29.7% | **below required 85%** |
| Existing parser unseen accuracy | 57.7% | better than new model on this suite |
| Previous centroid accuracy | 65.5% | better than new model on held-out benchmark |
| Previous centroid unseen accuracy | 64.0% | better than new model on unseen benchmark |
| Inference p50 | 6.68 ms | within 10 ms target in this Node measurement |
| Inference p95 | 8.72 ms | within 10 ms target in this Node measurement |
| Inference p99 | 10.38 ms | slightly above 10 ms in this Node measurement |
| Unsafe model-driven ledger writes | 0 | meets safety invariant |
| Network dependency | none | meets offline requirement |
| Production Python dependency | none | meets production requirement |

The latency figures are sandbox Node measurements, not representative low-end-browser certification. Browser/device benchmarking remains a required future stage if the model is reconsidered.

## Mandatory-language behavior

The component correctly demonstrates compositional handling for several navigation and insight forms, including `open stock`, `bring up inventory`, and `which tins no dey move`. The benchmark still records failures on important mandatory cases including `wetin dey left`, `how much dey Kwame owe`, `give Kwame two eggs cash`, `Kofi bring 8 eggs`, `what can I do here`, and several sparse/phonetic navigation variants. These are genuine benchmark failures, not hidden or removed cases.

## Safety results

The deterministic safety pre-check classified destructive terms such as delete, refund, remove, cancel, reverse, and undo as blocked destructive candidates. Financial-write examples were identified as write candidates and remained rejected/deferred at the NLU boundary. The benchmark reported **zero unsafe model-driven writes**.

This does not make the model production-safe by itself. The existing Tallybook parser, entity resolver, validation, preview, confirmation, audit, and business services must remain authoritative in any future integration.

## Validation commands

The following validation passed after implementation:

```text
pnpm check
```

TypeScript completed without errors.

```text
pnpm vitest run client/src/features/assistant/tinyNluV2/tinyNluV2.test.ts
```

5 focused tests passed.

```text
pnpm test
```

53 test files and 506 tests passed, including the existing assistant, parser, navigation, context, safety, business-service, offline, and Tiny NLU v2 tests.

```text
pnpm build
```

The production build passed. Existing CSS import-order, large-chunk, and stale baseline-browser-mapping messages remain advisories; they are unrelated to Tiny NLU v2.

```text
pnpm exec tsx tools/tiny-nlu-v2-benchmark.ts
```

The artifact and benchmark reports were regenerated successfully.

## Decision

**Stage 1 implementation: complete. Production integration: NO-GO.**

The architecture is small, local, and safety-compatible, but the measured model quality is substantially below the acceptance targets and below the existing deterministic/centroid baselines. It must not be wired into `assistant.ts` as a fallback yet.

The correct next step is not to expose this model to users. If work continues, the next plan should focus on improving the data/label design, factor-head training, grouped test validity, and device benchmarking while preserving the current parser as authority. A later integration stage must require a new explicit approval and must remain read-only for navigation/query suggestions until all financial safety and quality gates pass.
