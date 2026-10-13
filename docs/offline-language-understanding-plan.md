# Offline Language Understanding Layer Plan

**Status: implementation complete; waiting for owner acceptance testing.**

## Owner problem

Allow Tallybook owners to use unseen abbreviations, missing vowels, typos, short commands, word-order variations, and informal phrasing without requiring a separate hard-coded phrase for every sentence.

## In scope

- A reusable, deterministic, offline language interpretation layer.
- Canonical action/entity vocabulary derived from existing Tallybook routes and assistant intents.
- Lightweight token-level fuzzy matching for domain words only.
- Compositional interpretation for application navigation/discovery and safe read-only requests.
- Parser preprocessing that preserves original raw input and existing entity extraction.
- Confidence bands, ambiguity penalties, and development diagnostics.
- Language-pack-shaped vocabulary structure so later languages can be added without rewriting scoring.
- Unseen semantic-variation, contextual, negative/safety, and performance tests.
- Developer documentation and acceptance results.

## Explicit exclusions

- No LLM, cloud NLU, API, remote embeddings, or network call.
- No direct financial writes from the language layer.
- No replacement of existing business services, previews, confirmation, audit, or IndexedDB source of truth.
- No unrestricted automatic learning or permanent aliases from one correction.
- No new database schema or migration.
- No attempt to support every human language in this stage; the vocabulary pack is English-first with existing local shop/Pidgin variants.

## Invariants

- Raw user input remains available in `ParsedCommand.raw` and assistant history.
- Financial writes remain preview/confirmation-gated.
- Low-confidence or ambiguous financial interpretations clarify instead of guessing.
- Existing aliases and deterministic intent precedence remain active.
- Existing routes remain the only navigation destinations.
- Performance remains bounded by a small vocabulary and token-level comparisons.

## Acceptance tests

- `opin sto`, `opn stk`, `show stk`, `view sto`, `bring up inventory`, and unseen variants resolve to Stock navigation or discovery.
- Domain typos and abbreviations resolve compositionally without one-off full-phrase aliases.
- Similar but unsafe terms such as `store` do not silently become Stock.
- Ambiguous money/stock and destructive requests clarify or remain unsupported.
- Existing focused and full test suites pass.
- Type-check, production build, and a lightweight interpretation benchmark pass.
- Documentation distinguishes exact, alias, fuzzy, contextual, and generalized interpretation.

## Checklist

- [x] Requirements review
- [x] Scope definition
- [x] Data/migration analysis: no schema change required
- [x] Implementation
- [x] Verification
- [x] Release handover
- [ ] Owner acceptance gate
