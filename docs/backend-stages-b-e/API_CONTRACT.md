# Backend action contract — `public.tallybook_shop_ops`

The new RPC is separate from the existing `public.tallybook_shop` POS, sales, receipts, refunds, credit and membership endpoints. Only logged-in Supabase users with an **active server-side Auth session and current business membership** can call it. Session, user ID, owner role and permission are resolved **inside Postgres**; never accept client-supplied role or owner fields.

Call shape: `tallybook_shop_ops(p_action text, p_input jsonb)`. Every action requires `companyId` (UUID). All IDs are UUIDs. All money values submitted are integer **minor currency units** (no floats), and new aggregated money sums are returned as **decimal strings** to prevent JavaScript precision errors. New operational writes require current company **owner** membership.

| Stage | Action | Additional input fields | Effect / return |
|---|---|---|---|
| C | `readiness` | none | Read-only current ledger configuration, scoped counts and first-sale checklist. |
| C | `salesSummary` | `days?: 1..31`, `storeId?: UUID` | Read-only recent net sales, refund sum and owner-only outstanding customer credit. Attendance staff are limited to currently assigned stores. |
| D | `startStockCount` | `countId`, `storeId`, `productId` | Captures expected stock, returns new/open snapshot. Idempotent ID. |
| D | `applyStockCount` | `countId`, `countedQuantity: 0..2147483647` | Requires no stock change since start; atomically adjusts stock and records correction. Replay only if same count. |
| D | `cancelStockCount` | `countId` | Cancels unopened adjustment; cannot reverse an already applied count. |
| D | `listStockCounts` | none | Latest 100 sessions, read-only. |
| D | `requestTransfer` | `transferId`, `fromStoreId`, `toStoreId`, `productId`, `quantity: 1..100000` | Creates requested transfer, stock unchanged. |
| D | `dispatchTransfer` | `transferId` | Decrements source exactly once, status in_transit. |
| D | `receiveTransfer` | `transferId` | Increments target exactly once, status received. |
| D | `cancelTransfer` | `transferId` | Only requested transfer; dispatched transfers require a fresh reverse transfer. |
| D | `listTransfers` | none | Latest 100 transfer sessions. |
| D | `saveSupplier` | `supplierId`, `name` | Creates supplier; same ID/name replay returns unchanged. |
| D | `archiveSupplier` | `supplierId` | Prevents new purchase orders, keeps historical payable and settlement ability. |
| D | `supplierBalances` | none | Derived: sum(value of received goods) − sum(verified recorded settlements), grouped by supplier. |
| D | `createPurchaseOrder` | `orderId`, `supplierId`, `storeId`, `reference?`, `lines: [{productId,quantity,unitCostMinor}]` | Creates immutable 1–100 line PO, **no stock or payable mutation**. |
| D | `purchaseDetails` | `orderId` | Read-only expected/received quantities and value. |
| D | `receivePurchase` | `receiptId`, `orderId`, `lines: [{lineNo,quantity}]` | Partial goods receipt, server verifies outstanding quantities, atomically increments stock & creates immutable payable evidence. |
| D | `closePurchaseOrder` | `orderId`, `reason` | Permanently closes unreceived remainder only; prior receipt/settlement unchanged. |
| D | `settleSupplier` | `settlementId`, `supplierId`, `amountMinor`, `method: cash\|mobile\|card\|bank`, `reference?`, `externalSettlementConfirmed: true` | Records manual external payment only if due amount exists. Never sends money, cannot overpay, immutable idempotent ledger. |
| D | `createOnlineOrder` | `orderId`, `storeId`, `customerReference?`, `lines: [{productId,quantity}]` | Owner-entered draft order with price snapshots, **no stock reservation**. |
| D | `acceptOnlineOrder` | `orderId` | Verifies stock sufficiency at that moment; no reservation, no sale. |
| D | `closeOnlineOrder` | `orderId`, `reason` | Closes unfulfilled order without stock or money entries. |
| D | `linkOnlineOrderSale` | `orderId`, `saleId` | Only links an accepted order to a previously posted matching POS sale. Does not book stock/money a second time; each sale can fulfill at most one order. |
| D | `listOnlineOrders` | none | Owner-only latest 100, status new/accepted/sold/closed. |

All writes are transactional within Postgres; errors abort the entire call. Replay protection binds a generated UUID to immutable identity and content. Rows in the new exposed `public` schema are RLS enabled/forced and have **no direct anon/authenticated table grants**. New private definer functions revoke execution from browser roles, and the public RPC grants execution only to `authenticated`.

## Explicit non-features

- No frontend forms, mobile UI screens or app routing changed.
- No native storefront, public order intake endpoint, external order webhook, checkout/payment processor, remote stock reservation service, taxes or shipping automation.
- No bank, MoMo, card or cash transfer is initiated by any backend operation.
- No encryption/migration of the separate device-local ledger.
- No two-way synchronization between device-local books and Supabase shared-shop.
- No successful CI result constitutes legal, payment, production or real-device acceptance.

## Migration dependency order

1. Existing business identity / verified membership and shared shop ledger, refunds, full till.
2. Stage B `20261106120000_shared_shop_return_policies.sql`.
3. Stage C `20261106130000_shop_stage_c_read_models.sql`.
4. Stage D `20261106140000_shop_stage_d_stock_workflows.sql`, `20261106150000_shop_stage_d_purchase_payables.sql`, `20261106160000_shop_stage_d_online_orders.sql`.

No migration is authorized to apply by this source-only PR.
