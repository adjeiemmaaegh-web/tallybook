# Tallybook Offline Intent/Entity Model Evaluation

**Status: benchmark only — no production routing, schema, business data, or dependency changes were made.**

## Question

Can a small on-device classifier trained from Tallybook’s existing intent definitions, aliases, evaluation corpus, and conversational examples generalize to unseen requests such as:

- `opin sto`
- `opn stk`
- `what do I still have?`
- broken grammar, shorthand, and informal financial requests

The experiment had to remain compatible with Tallybook’s offline-first TypeScript/Vite stack and could not introduce Python into production.

## Experiment design

The benchmark uses a dependency-free TypeScript classifier that can run in the existing JavaScript runtime:

- Character 2–5-gram features plus word features.
- One normalized centroid per intent.
- Cosine similarity for prediction.
- A small deterministic slot extractor for customer, product, supplier, amount, and quantity.
- No neural runtime, backend, network request, Python dependency, or native module.
- JSON export that can be imported by TypeScript/Vite.

Training material:

| Source | Examples |
|---|---:|
| Existing non-known-gap evaluation corpus | 242 |
| Application capability aliases | 174 |
| Conversational follow-up examples | 5 |
| **Total** | **421** |

A deterministic 80/20-style hash split produced **337 training examples** and **84 held-out examples**. The unseen set contains **25 deliberately compositional, abbreviated, slang, typo, ambiguous, and safety-sensitive phrases** that are not used for training.

The benchmark compares the model with the existing application-aware parser: application navigation is evaluated through `parseApplicationRequest`, while business requests use `parseCommand`.

## Results

### Model footprint and speed

| Measurement | Result |
|---|---:|
| Export format | JSON, directly usable from TypeScript/Vite |
| Uncompressed model | **413,323 bytes / ~404 KiB** |
| Gzipped model | **60,747 bytes / ~59 KiB** |
| Model vocabulary/features | 6,334 |
| Intent classes | 26 |
| Measured heap delta during inference loop | **~1.36 MB** |
| p50 inference latency | **~188 µs** |
| p95 inference latency | **~300 µs** |
| p99 inference latency | **~544 µs** |

Latency and memory were measured under Node 22 in the sandbox. They are useful order-of-magnitude figures, not a promise for every low-end phone or browser.

### Intent accuracy

| Dataset | Tiny model | Existing parser |
|---|---:|---:|
| Held-out in-domain phrases, 84 cases | **65.5%** | **86.9%** |
| Unseen variations, 25 cases | **64.0%** | **72.0%** |

The existing parser currently wins both on the held-out corpus and on the deliberately unseen set.

### Entity accuracy

The prototype model’s constrained slot extractor did **not** achieve acceptable entity accuracy on the current expected-entity cases. Exact entity-record accuracy was **0%**, and field-level entity accuracy was also **0%** in this benchmark. The existing parser scored **100%** on the evaluated entity cases.

This is the decisive limitation: correctly recognizing an intent is not enough for Tallybook. A financial assistant must also reliably extract the customer, product, supplier, quantity, amount, payment method, currency, period, and ambiguity state.

### Unseen-phrase behavior

The model correctly handled many familiar semantic shapes, but failed or confused several important unseen forms:

- `view sto` → unknown instead of navigation.
- `bring up inventory` → unknown instead of navigation.
- `what do I still have` → activity query instead of inventory query.
- `which tins no dey move` → customer-purchase query instead of slow-mover insight.
- `suplier dey where` → create-supplier instead of navigation.
- `show expence page` → feature discovery instead of navigation.
- `rpts` → unknown instead of reports discovery.
- `delete the last sale` → sales query instead of unsupported/destructive-action handling.
- `pay john 500` → unknown instead of customer payment.

The existing language layer/parser performed better overall, but the benchmark also exposes areas where the parser should continue to receive explicit vocabulary and safety tests.

## Ambiguity and financial-action safety

One raw model prediction would have met a naïve confidence threshold for a sale. That is unacceptable because confidence from a small centroid model is not calibrated proof of user intent.

The production-safe gate used in this evaluation therefore treats every model transaction prediction as **suggestion-only**:

1. The model may suggest a candidate intent.
2. The deterministic parser and domain validators remain authoritative.
3. Entity resolution must succeed against local records.
4. Ambiguous wording must produce clarification, not execution.
5. Financial writes must still produce the existing preview and confirmation flow.
6. The model itself never receives write authority.

With that gate, **0 model financial actions were auto-executed** and all transaction candidates were deferred. This is the only acceptable safety result for the current prototype.

## Decision

### Can a small local model be exported and run in Tallybook?

**Yes, technically.** The exported JSON is small enough for local delivery, has sub-millisecond benchmark inference, uses no Python, and can be loaded by the current TypeScript/Vite stack without a machine-learning runtime.

### Is this model good enough to replace the existing parser?

**No.** It is currently worse on intent accuracy, worse on unseen-phrase accuracy, and unacceptable for entity extraction. It also demonstrates unsafe high-confidence misclassification around financial language if confidence is interpreted as permission to act.

### Is it useful as a future component?

**Yes, but only as a read-only candidate generator or vocabulary-discovery aid**, for example:

- Suggest an alternative intent when the deterministic parser is below its clarification threshold.
- Rank possible application destinations.
- Provide diagnostics for phrases worth adding to aliases or compositional rules.
- Never bypass parser/entity validation, ambiguity checks, confirmation, or domain services.

The current recommendation is **do not ship this model in production yet**. Continue improving the existing deterministic language layer first. A future model stage should be approved only after it has:

- A substantially larger and stratified corpus.
- Separate train/dev/test splits by phrase family, not only hash.
- Proper entity labels for every financial action.
- Calibrated confidence and reject/abstain behavior.
- Explicit adversarial tests for refunds, deletion, reversals, discounts, debt changes, and ambiguous money/stock wording.
- Device-level browser benchmarks on representative low-end hardware.
- A parser/model ensemble whose financial safety is no worse than the parser alone.

## Reproducibility

From the project root:

```bash
pnpm exec tsx tools/intent-model-benchmark.ts
pnpm exec tsc --noEmit --pretty false
```

The benchmark writes:

- `artifacts/intent-model/tallybook-intent-model.json`
- `artifacts/intent-model/benchmark-report.json`
- `artifacts/intent-model/benchmark-console.json`

The benchmark source is:

- `tools/intent-model-benchmark.ts`

No Python code or Python runtime is required. No production application file was changed by this evaluation.
