# Offline Language Understanding

## Summary

Tallybook now has a lightweight, deterministic language-understanding layer that sits before the existing parser and application knowledge router. It runs entirely in the browser/runtime with no LLM, cloud API, remote NLU, embeddings, or network dependency.

The pipeline is:

`raw input → existing preparation/aliases → canonical domain concepts → safe token rewrites → existing intent/application scoring → entity validation → preview/confirmation → existing business service`

The layer never reads or writes financial records and never bypasses the existing validation, preview, confirmation, audit, or IndexedDB services.

## Integration points

- `client/src/features/assistant/languageUnderstanding.ts` contains the reusable vocabulary pack, token candidate generation, abbreviation/typo resolution, compositional normalization, confidence, and diagnostics.
- `client/src/features/assistant/intentParser.ts` uses the normalized interpretation only at the public `parseCommand` entry point. The raw command is still returned as `ParsedCommand.raw`.
- `client/src/features/assistant/appKnowledge.ts` uses the same interpretation before matching verified application routes.
- `client/src/features/assistant/index.ts` exposes `interpretLanguage`, `explainLanguage`, and the vocabulary pack for diagnostics and future language packs.

## Concept model

The current English-first pack contains reusable actions such as `open`, `show`, `add`, `record`, `sell`, `buy`, `pay`, and `receive`, plus domain entities such as `stock`, `product`, `customer`, `supplier`, `sale`, `expense`, `report`, `backup`, and `balance`. Each concept has canonical wording and variants rather than a list of complete sentences.

The pack is structured as `VocabularyConcept` records so a future language pack can provide the same concepts without rewriting the interpreter or intent engine. This stage includes the existing informal shop/Pidgin variants needed by Tallybook users, but it does not claim automatic multilingual understanding.

## Interpretation categories

| Category | Meaning | Example |
|---|---|---|
| Exact | The input already uses a canonical domain word. | `stock` → `stock` |
| Alias | A known abbreviation, typo, or supported variant maps to a concept. | `stk` → `stock`, `custmr` → `customer` |
| Fuzzy | A close domain-token candidate passes a threshold and margin check. | `stok` → candidate `stock` |
| Contextual | Existing conversation memory resolves a pronoun, period, or remembered entity. | `she paid 100` after an Adwoa turn |
| Compositional/generalized | Independent action and entity concepts combine without a full-sentence alias. | `opin sto` → `open` + `stock` → Stock navigation |

Normal inflected bookkeeping words such as `paid`, `sales`, `bought`, and `customers` are preserved for the existing parser. Only abbreviations and domain typos are rewritten into parser-safe text, preventing this layer from destabilizing mature rules.

## Generalization examples

The unseen-variation suite covers more than twenty Stock navigation combinations, including:

- `opin sto`
- `opn stk`
- `show stk`
- `view sto`
- `bring up inventory`
- `let me see my stock`
- `check inventry`
- `open the goods`
- `display my items`
- `go stock page`
- `show my stk`
- `bring up the stock screen`
- `see my goods`
- `open inv`
- `show product list`
- `go to stk screen`
- `bring inventory page`
- `view items`
- `check stock`
- `show my products`
- `open the stock section`

These are interpreted by matching action/entity concepts, not by registering each complete sentence.

## Confidence and safety

The language layer uses token similarity, a minimum fuzzy threshold, and a best-candidate margin. It does not accept fuzzy similarity as permission to write. High-confidence read-only navigation can proceed. A compositional financial write such as `pay john 500` is deliberately returned below the high-confidence threshold and must continue through the existing clarification/preview path. Existing financial writes still require confirmation even when the language is exact.

Ambiguous words remain conservative. `open store` is not silently treated as Stock, and unsupported concepts such as reconciliation remain unrecognized. Vague stock statements remain clarification-safe, and destructive requests retain their existing strict handling.

## Performance

The language test runs 250 interpretations of a deliberately long input and requires less than 1.5 seconds in the test environment. The implementation uses a small in-memory vocabulary and bounded token-level Levenshtein comparisons; it adds no dependency and no background worker.

## Limitations

The layer is not a general English model and does not infer arbitrary world knowledge. It does not reliably understand an unknown product or customer name without the existing entity-resolution step. It asks for clarification when a typo could change a money amount, customer, product, supplier, or destructive action. The current language pack is English-first with selected informal shop/Pidgin variants; adding another language requires a deliberate vocabulary pack and tests. Context remains bounded by the existing conversation-memory expiry and does not become unrestricted memory.
