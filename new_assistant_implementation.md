# New Assistant Implementation

## Purpose

This release makes the Tallybook assistant feel like a local task agent while preserving the application's offline-first accounting rules. It reads authoritative records from existing IndexedDB services, sends no business data to a cloud model, and never writes a sale, purchase, payment, stock correction, or created record without the existing confirmation flow.

## Implemented capabilities

### Deterministic plans, evidence, and follow-ups

`taskPlanner.ts` detects compound read-only requests such as “check sales, stock, and customer debt” and turns them into typed `AssistantPlan` steps. Plans identify their read-only nature, expose a Run action, execute locally, and return combined evidence. Insight answers include calculated facts and useful next actions such as slow-mover or reorder follow-ups. Ordinary single-domain questions continue through their existing services.

### Local vocabulary and persistent assistant data

`aliases.ts` provides deterministic local normalization for shop phrases, typos, Pidgin-style wording, and shorthand. Aliases never change products, customers, prices, quantities, or ledger records. `assistantLocalStore.ts` persists custom workflows, learned aliases, and command history in a separate IndexedDB database. Workflows are device-local and do not run while the browser is closed.

### Safe simulations and reversals

`dryRun.ts` simulates hypothetical sales, purchases, and repayments without writing. `reversals.ts` prepares an explicit preview and records a confirmed additive reversal in an atomic IndexedDB transaction. Original sales remain immutable; stock is restored through visible reversal movements; debt and reports apply derived reversal deltas; and submission keys make repeated confirmation idempotent. The tool registry separates read and prepare-write capabilities and rejects direct assistant writes.

### Universal In-App Assistant

`appKnowledge.ts` is a verified application-language registry derived from the real route registry. It supports navigation, feature discovery, application help, explanations, and conservative typo tolerance for destinations such as Home, Business, Stock, Customers, Sales, Reports, End of day, Purchases/Suppliers, Expenses, Business Health, Backup, and Assistant.

Examples include `where can I find suplier`, `open custmer`, `inventry`, `expence section`, `supplier dey where`, `how do I add a supplier`, and `take me go reports`. The assistant does not invent unsupported routes such as reconciliation when no such route exists. Navigation actions are read-only verified links. Existing bookkeeping queries and explicit transaction requests retain precedence.

### Existing assistant capabilities retained

The release preserves period-aware sales, best-seller, customer, debtor, inventory, supplier, and activity queries; sales comparison, reorder estimates, slow movers, and empty-history wording; batch transactions; session context for recent customer/product references; record creation; stock counts; error recovery; transaction previews; duplicate protection; stale-preview protection; and confirmation-gated writes.

## Offline and data-safety contract

The assistant has no required network dependency, cloud model, or API key. IndexedDB remains the source of truth. Plans, recommendations, and simulations are read-only. Reversals are additive corrections and never delete or edit original sales. Vague requests are clarified rather than guessed. Customer context is shown only when it materially influenced a customer-related reply.

Company deletion removes sale reversals and assistant audit entries. Backup restore keeps audit data outside the backup and clears stale audit entries during restore. Backup and restore remain local file operations.

## Extreme-language stress hardening

The assistant was tested with Pidgin-style slang, broken grammar, shorthand, typos, incomplete phrases, and multi-turn context. New normalization covers examples such as `how much Kwame dey owe me`, `wetin I sell today`, `wetin dey low for shop`, `stock wey remain`, `who buy eggs`, `which product no dey move`, `make I know who owe pass`, `show me wetin assistant do today`, `supplier dey where`, `open custmer`, `inventry`, `expence section`, `how I fit record sale`, `abeg show me sales`, `Kwame don pay me 100`, `what if I sell 2 eggs to Kwame`, and `undo am`.

Payment shorthand enters the normal confirmation flow. If the method is missing, the assistant asks whether the payment was cash, mobile money, or card and saves nothing. Explicit stock commands retain their clarification flow, while vague statements such as `I bought goods from supplier` no longer become write-ready stock receipts. What-if sales remain dry runs.

## Files added or changed

| File | Change |
|---|---|
| `client/src/features/assistant/taskPlanner.ts` | Typed compound read-only plans |
| `client/src/features/assistant/taskPlanner.test.ts` | Planner, workflow, and alias tests |
| `client/src/features/assistant/workflows.ts` | Built-in and local reusable workflows |
| `client/src/features/assistant/aliases.ts` | Deterministic local phrase, typo, slang, and Pidgin normalization |
| `client/src/features/assistant/assistantLocalStore.ts` | Local workflows, aliases, and history store |
| `client/src/features/assistant/toolRegistry.ts` | Read and prepare-write tool registry |
| `client/src/features/assistant/dryRun.ts` | Hypothetical sale, purchase, and repayment simulations |
| `client/src/features/assistant/reversals.ts` | Auditable reversal preview and atomic execution |
| `client/src/features/assistant/phase1Services.test.ts` | Reversal and simulation regression tests |
| `client/src/features/assistant/appKnowledge.ts` | Verified application registry and interpreter |
| `client/src/features/assistant/appKnowledge.test.ts` | Application route and negative evaluation cases |
| `client/src/features/assistant/universalAssistant.test.ts` | End-to-end application conversations |
| `client/src/features/assistant/slangStress.test.ts` | Extreme-language, context, and no-write stress tests |
| `client/src/features/assistant/intentParser.ts` | Slang-safe parser confidence and ambiguity handling |
| `client/src/features/assistant/assistant.ts` | Routing, plans, context, reversal refresh, and application replies |
| `client/src/features/assistant/types.ts` | Typed plan, app intent, and navigation contracts |
| `client/src/features/assistant/index.ts` | Public assistant exports |
| `client/src/features/assistant/text.ts` | Alias application before parser matching |
| `client/src/features/assistant/languageUnderstanding.ts` | Canonical vocabulary and compositional offline interpretation |
| `client/src/features/assistant/languageUnderstanding.test.ts` | Unseen variations, safety, diagnostics, and performance tests |
| `client/src/pages/AssistantPage.tsx` | Plan cards, evidence, and verified navigation links |
| `client/src/db/TallybookDB.ts` | Additive reversal and assistant-audit schema tables |
| `client/src/features/backup/backup.ts` | Reversal backup compatibility and audit cleanup on restore |
| `client/src/features/business/activeCompany.ts` | Complete reversal cleanup during company deletion |
| `client/src/features/credit/credit.ts` | Reversal-aware debt calculations |
| `client/src/features/reports/reports.ts` | Reversal-aware totals and balances |
| `docs/offline-language-understanding-plan.md` | Stage scope and acceptance checklist |
| `docs/offline-language-understanding.md` | Architecture, interpretation categories, examples, and limitations |
| `new_assistant_implementation.md` | This developer handover |
| `docs/assistant-intelligence-stage-plan.md` | Initial intelligence scope and acceptance criteria |
| `docs/universal-assistant-stage-plan.md` | Universal Assistant scope and acceptance criteria |

## Deliberate future increments

Command-history detail views and export formatting remain separate. A device-local model adapter may be connected later only through the schema-validated interface and must never receive direct write authority. Mixed multi-step write plans should be added only after each transaction type has its own preview, validation, and idempotent service. These are optional local safety increments, not cloud requirements.

## Validation

The parser evaluation reports 252 total cases, 242 counted cases, 100% counted accuracy, 100% checked entity accuracy, and zero dangerous transaction classifications. The Universal Assistant focused suite passes 125 tests. The extreme-language stress suite passes 5 tests. The final complete suite passes **501 tests across 52 files** with zero failures. `pnpm check` passes. `pnpm build` passes; existing CSS import-order, large-chunk, and baseline-browser-mapping messages are advisories only.

## 2026-10-08 — Offline compositional language understanding

Added `client/src/features/assistant/languageUnderstanding.ts`, a reusable offline interpreter with a structured English-first Tallybook vocabulary pack. It resolves action and entity concepts independently, handles abbreviations and domain typos, applies bounded fuzzy matching only to vocabulary terms, and preserves unknown names, amounts, punctuation, dates, and possessives. The existing parser and verified application router consume its safe normalized form; all financial execution remains in the existing validation, preview, confirmation, audit, and IndexedDB services.

The layer distinguishes exact matches, supported aliases, fuzzy candidates, contextual interpretation, and compositional generalization. `opin sto` is interpreted as `open` plus `stock` and routes to the verified Stock application capability. It is not a one-off phrase rule. The unseen-variation suite covers more than twenty additional Stock combinations such as `opn stk`, `show stk`, `view sto`, `bring up inventory`, `open inv`, `go to stk screen`, and `show my products`.

The implementation intentionally preserves existing words such as `paid`, `sales`, `bought`, and `customers` so mature parser patterns remain stable. Only compact abbreviations and domain typos are rewritten. Ambiguous `store` is not silently mapped to Stock. A compositional write such as `pay john 500` stays below the high-confidence band and continues through clarification/preview safety.

New files:

- `client/src/features/assistant/languageUnderstanding.ts`
- `client/src/features/assistant/languageUnderstanding.test.ts`
- `docs/offline-language-understanding-plan.md`
- `docs/offline-language-understanding.md`

Focused validation for this stage:

- New language tests: **6 passed**, including more than 20 unseen variations, safety negatives, diagnostics, and performance.
- Existing application/parser/planner/slang regression tests: **97 passed**.
- Parser evaluation: **242/242 counted cases correct**, 100% entity accuracy, zero dangerous classifications.
- TypeScript check: passed.
