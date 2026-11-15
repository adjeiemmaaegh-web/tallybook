# Tallybook — 29 photo reference comparison (2026-11-14)

## Scope and evidence
**Strict re-audit correction (2026-11-14):** Stages 2, 13 and 21 have been downgraded from source-level “Exists” to “Partial” because of an unsupported EUR option and the absence of verified public checkout. See `EXISTING_16_STRICT_REAUDIT_2026-11-14.md`. No live customer journey is accepted based on a code path alone.

Audited 29 screenshots uploaded in three batches against GitHub `adjeiemmaaegh-web/tallybook` main at `590e047d24704a7fafc1ad79a3c3756d38a5bd50`. **Exists** means a comparable source-level feature and entrypoint exist, not that a live user journey passed end-to-end. **Partial** means a difference is material, optional-provider availability is unknown, or an unsupported claim must not be copied. **Enhanced** means a source change is proposed here; acceptance remains dependent on successful CI and browser checks.

Reference photos contain both Stockdey screens and existing Tallybook screens. Repeated screenshots retain separate stage IDs but are not implemented twice. The Tallybook product name, brand, financial data boundaries and existing verified authorization rules take precedence over screenshot mimicry.

| Stage | Image | Assessment | Source-based evidence / remaining gap |
|---:|---|---|---|
| 1 | Account dropdown | **Exists** | SharedShopAccountMenu: verified identity, account settings, sign-out and safe staff handover. |
| 2 | Store and currency onboarding | **Partial** | SetupLedger saves currency and an initial store, but supports GHS, KES, NGN, RWF, TZS, UGX, USD, ZAR, ZMW; reference includes EUR, which is not selectable. Step order and pill controls also differ. |
| 3 | Business identity/type onboarding | **Partial** | CloudBusinessPanel creates named business; business-type classification not verified. |
| 4 | Employee ID join screen | **Partial** | JoinShop uses secure owner-issued one-time invitation/join codes, not public personal ID. |
| 5 | Tallybook owner profile | **Exists** | CloudBusinessPanel account/profile settings and verified membership. |
| 6 | Owner versus employee selection | **Exists** | CloudBusinessPanel distinguishes create versus join. |
| 7 | Stockdey login | **Partial** | Google and email/password supported; Apple provider not implemented. |
| 8 | Tallybook login | **Exists** | GoogleSignInPage handles Google/email, signup, recovery. |
| 9 | Legacy workspace sidebar | **Exists** | Local AppShell has workspace/navigation; cloud uses separate role-scoped tabs. |
| 10 | Inter-store transfers | **Exists** | SharedShopTransfers requests, dispatches, receives and cancels, owner-controlled. |
| 11 | Stock-take session dashboard | **Enhanced** | Functional summary, status filters, search and per-product count history built on existing server records; multi-item batch sessions remain unsupported. |
| 12 | Supplier purchasing/payables | **Exists** | SharedShopPurchasingPanel manages suppliers, orders, receipts and recorded payments. |
| 13 | Online orders | **Partial** | SharedShopOrders captures, accepts, links and closes orders **received outside Tallybook**; this is not proof of functioning public web-store checkout/order submission. |
| 14 | Products catalogue | **Partial** | StockPanel handles goods/services, barcode, cost and CSV import; variant matrix not verified. |
| 15 | Inventory console | **Exists** | StockPanel provides tracked stock, low/out alerts, search and adjustments. |
| 16 | Sales transactions | **Exists** | SalesPanel searches, filters by date/payment, lists receipts/refunds. |
| 17 | POS | **Exists** | SellPanel handles cart, barcode search, payments, stock enforcement and offline outbox. |
| 18 | Owner dashboard | **Exists** | SharedShopOwnerDashboard shows server-scoped sales, stock, supplier/customer balances. |
| 19 | Mobile sidebar navigation | **Enhanced** | New mobile drawer exposes only authorized tabs, with search and dismissal. |
| 20 | Setup complete screen | **Enhanced** | Post-setup confirmation appears after server refresh; explicitly distinguishes active store from currency-only configuration, and routes to dashboard, products or team. |
| 21 | Store and currency repeat | **Partial** | Same currency-coverage gap as stage 2 (EUR not selectable). This is a repeat, not a second implementation. |
| 22 | Business identity repeat | **Partial** | Same business-type gap as photo 3. |
| 23 | Employee ID repeat | **Partial** | Same safe join-code substitute as photo 4. |
| 24 | Role chooser repeat | **Exists** | Same flow as photo 6. |
| 25 | Login repeat | **Partial** | Same Apple sign-in gap as photo 7; account auth preserved. |
| 26 | Cloud sync and AI marketing | **Partial** | Real outbox and local assistant components exist; automatic conflict-free multi-store sync/AI promises require independent verification. |
| 27 | Three product pillars | **Partial** | TallybookWelcome describes device ledger/shared shop; exact three-pillar marketing concept not copied and unverifiable claims excluded. |
| 28 | Public marketing menu | **Partial** | TallybookWelcome has responsive navigation, FAQs/features; app-store and pricing claims not introduced without actual offerings. |
| 29 | Marketing hero | **Exists** | TallybookWelcome has responsive hero, trust claims and working CTA routes. |

## Counts
{"Exists":13,"Partial":13,"Enhanced":3}. The snapshot has many existing business capabilities. New design improvements: a mobile section drawer, a stocktake dashboard over genuine server counts, and server-grounded post-setup confirmation. No server-side flow, inventory posting, payment route, schema or staff authorization path is changed.

## UI increment in this branch
- Mobile drawer for shared shop: explicit Menu button, role-filtered sections, search, active page indicator, close/scrim/Escape, refresh.
- Original desktop tab navigation remains for existing workflows and tests.
- More refined mobile cards, fields and navigation consistent with Tallybook's identity; keyboard focus and reduced-motion styling.
- Stock-take history with count summary, search, status filters and real recorded expected/counted/variance fields; server still enforces stale-stock rejection. 
- Post-setup confirmation only calls a store ready after the verified overview contains an active store; no invented store or sales data. 
- No fake Apple sign-in, payment provider, app-store badges, cross-store synchronization guarantees, or fictitious AI/finance metrics.

## Open acceptance gates
- TypeScript build and entire test suite, PR CI, mobile Chrome/Edge behavior, drawer keyboard/touch QA and verified cloud navigation.
- Cloud business-type data model, secure employee-ID policy (current one-time codes are safer), batch stocktake sessions, product variant semantics, dedicated completion UX, marketing accuracy and cross-store sync verification.
- No status here claims all 29 distinct user journeys are complete or that production release is safe. Require green gates and explicit owner approval (already requested in this conversation) before any merge or production release.
