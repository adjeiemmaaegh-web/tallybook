# Context-First Semantic Resolver Integration

**Status:** Implemented in the local-first assistant. Production behavior remains confirmation-gated and offline.

## Implemented files

- `client/src/features/assistant/tinyNluV2/contextFirstResolver.ts`
- `client/src/features/assistant/tinyNluV2/contextFirstResolver.test.ts`
- `client/src/features/assistant/assistant.ts`

## Production integration boundary

`createAssistant().send()` now performs a context-first semantic preflight after input normalization and before application/generic business routing.

The preflight may directly handle only safe interpretation paths:

- verified application navigation
- application help
- explicit navigation/query ambiguity clarification
- read-only fallback intents when the existing parser returns `UNKNOWN`

Financial writes are not executed by the resolver. Informal write expressions are classified as `FINANCIAL_WRITE` and remain in the existing parser, preview, validation, and owner-confirmation flow. Destructive and out-of-domain requests remain rejected.

Existing parser behavior remains authoritative for specific queries, activity/audit queries, batches, drafts, pending confirmations, reversals, and all transaction execution. The resolver deliberately does not intercept bare/specific queries such as `Egg stock?` or `show assistant activity this month`.

## Pipeline

1. Preserve original input and normalize through the existing language interpreter.
2. Run deterministic safety pre-checks.
3. Match high-priority semantic frames for inventory, balances, help, navigation, sales, stock receipts, and payments.
4. Resolve interaction mode before generic action/object factors.
5. Extract customer, supplier, product, quantity, amount, and payment roles, including informal forms.
6. Resolve application route versus query ambiguity.
7. Compose canonical candidates.
8. Choose a safe disposition: answer, navigate, preview write, ask clarification, or reject.

## Representative behavior

| Input | Result |
|---|---|
| `wetin dey left` | Read-only inventory query |
| `how much dey Kwame owe` | Read-only customer-balance query |
| `what can I do here` | Help response |
| `opn stk` | Navigation response |
| `show stock` | Targeted clarification |
| `give Kwame two eggs cash` | Existing financial preview flow |
| `Kofi bring 8 eggs` | Existing stock-receipt preview flow |
| `delete the last sale` | Rejected destructive request |
| `what is the weather` | Rejected out-of-domain request |

## Safety invariants

- No resolver path writes IndexedDB records.
- Financial writes remain confirmation-gated.
- Existing transaction services remain the only write authority.
- Destructive language is never converted into a normal transaction.
- The resolver is deterministic and has no network or cloud-AI dependency.

## Validation

Passed:

```text
pnpm check
pnpm vitest run client/src/features/assistant/tinyNluV2/contextFirstResolver.test.ts client/src/features/assistant/tinyNluV2/tinyNluV2.test.ts
pnpm vitest run client/src/features/assistant/assistant.test.ts
pnpm vitest run client/src/features/assistant/audit.test.ts
pnpm test
pnpm build
```

Final full-suite result: **54 test files, 512 tests passed**.

The build continues to report existing advisories for CSS import order, large JavaScript chunks, and stale baseline-browser-mapping data. No new schema or migration was introduced.
