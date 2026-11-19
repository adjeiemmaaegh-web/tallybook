# Tallybook Connected Commerce — Product Requirements Document (PRD)
**Status:** Proposal for implementation; no new feature is asserted shipped.  
**Version:** 1.0 • 2026-11-18 • **ALL FIVE tracks equal priority**

## 1. Problem, vision and buyer promise
Traditional POS features (sales, stock, reports, offline entry) are increasingly available. Tallybook must test whether a two-sided ecosystem provides *measurable* advantages to merchants and customers that justify trial, adoption and retention. Differentiation is a *hypothesis*, not a confirmed exclusive capability.

**Vision:** Ghanaian merchants run their business in Tallybook and optionally join an interoperable network for discoverability, referrals, replenishment, recommendations and customer relationships. Buyers can access the network via mobile web without switching their messaging app.

**Personas**: merchant owner (single/multi-store), cashier/attendant (restricted), neighboring partner merchant, supplier, casual shopper, returning shopper, ops moderator/support, platform operator. Each persona needs a separate permission model; being a shop attendant never grants merchant publishing, settlement, profit or cross-shop access.

**Jobs to be done**:
- "Help more nearby people find a product I'm ready to sell."
- "Help me retain a buyer when I cannot fulfill an order myself."
- "Show me comparable supplier terms, total landed cost, and a safe way to reorder."
- "Tell me what deserves attention using *my real business records*, and let me approve a plan."
- "Keep my purchase proof, warranty/return instructions and rewards organized with my consent."

## 2. Requirements — Discover (CC-D)
**Outcome:** qualified discovery → customer request → explicitly accepted fulfillment → independently verified conversion.
- **CC-D-01** Owner opts in per store, confirms public address/rough area, working hours, contact channel, categories and whether goods/services are public. Default unlisted.
- **CC-D-02** Owner publishes only selected offers from canonical shared-shop products; show publicly approved price and service/goods kind. Never publish cost, stock quantity, supplier/customer/staff fields.
- **CC-D-03** Public responsive search by keyword, category and chosen region; do not request precise device location by default. Optional consented location may sort *approximate* distance when merchant addresses are verified; otherwise label area-based result.
- **CC-D-04** Availability states: `unconfirmed`, `recently_checked`, `merchant_confirmed`, `not_available`; include last-verified timestamp. No "in stock now" unless a checked/reserved policy supports it.
- **CC-D-05** Buyer can request item/quantity with clear terms without account/app installation; protect from spam, enumeration, abusive automated searches and unsolicited marketing.
- **CC-D-06** Merchant reviews request, confirms price and stock, accepts/declines; no promise or financial posting until a separately approved checkout/settlement workflow.
- **CC-D-07** Attribution uses non-sensitive, consented source tags; a referral/view is NOT a sale. Dashboard distinguishes impressions, qualified requests, accepted, fulfilled and *verified* sales.
- **CC-D-08** Owner can pause/unpublish instantly. Refund/cancellation terms shown before confirmation.
**Acceptance:** wrong store cannot alter listing; anonymized buyer cannot read private fields; stale stock not labeled confirmed; canceled/unlisted offer disappears; duplicate request replays safely; attribution never invents paid orders.

## 3. Requirements — Business Network (CC-N)
**Outcome:** preserve a customer's order by *consensual*, cross-merchant referral or partner fulfillment.
- **CC-N-01** Independent owners enroll into network with verified business profile and service area; may restrict eligible partner categories.
- **CC-N-02** When owner sees shortage, generate a *draft partner request* (item spec, target quantity, timeframe, area), excluding buyer identity until explicit parties' acceptance and relevant consent.
- **CC-N-03** Potential partner explicitly sends availability/price response with expiry and caveats; no direct exposure of their inventory balances or internal pricing.
- **CC-N-04** Originating merchant and proposed partner accept terms (who invoices, who handles payment, fulfillment, refund, contact data, any commission) before any handoff.
- **CC-N-05** Track `draft → offered → accepted/rejected/expired → fulfilled/cancelled/disputed`; each participant sees only its own permitted records and agreed information.
- **CC-N-06** Commission is a transparent *proposed contract term*, never an automatic platform settlement; independent financial postings only after authority and reconciliation.
- **CC-N-07** Prevent the same order being committed to multiple suppliers; implement server-side idempotency and reservation only in a later approved stock model.
- **CC-N-08** Partner performance displays bounded, explained evidence rather than unverified reputation scores.
**Acceptance:** merchant B cannot browse A's customers, stock or negotiated costs; failed partner handoff has a safe cancellation path; duplicate acceptance never duplicates fulfillment/sale; owner can leave program without losing existing ledger data.

## 4. Requirements — Supply (CC-S)
**Outcome:** compare supplier offers and place better authorized purchase orders.
- **CC-S-01** Merchant owner starts RFQ from low-stock signal, sales forecast or manual item; review quantity and units before posting.
- **CC-S-02** Supplier profiles with verification status, delivery areas, minimum order quantities, lead time, quote expiry and return terms.
- **CC-S-03** Collect multiple comparable quotes with explicit unit, VAT/taxes, shipping, packaging, minimums, currency, lead times and completeness labels.
- **CC-S-04** Show **total landed cost** and savings relative to a documented baseline; don't claim savings if baseline is absent or non-comparable.
- **CC-S-05** Optional opt-in group-buy interest pool; expose aggregate requirements only above a tested privacy threshold; don't leak merchant-level demand or competitors' costs.
- **CC-S-06** Owner reviews and approves supplier, purchase terms and PO; reuse existing shop purchasing workflow where authoritative; no AI-initiated or shopper-initiated purchase.
- **CC-S-07** Track quote revisions, partial supply, receipt, disputes, credit notes and delivery as distinct verified events; no auto stock increment on quote acceptance.
- **CC-S-08** Avoid preferential or hidden paid ranking; label promoted suppliers and conflicts, with neutral comparison defaults.
**Acceptance:** unit conversions and money arithmetic are exact; expired or noncomparable quotes clearly flagged; PO authorizations server-checked; no inventory posting before verified receiving; group pooling does not reveal any shop's sales or cost ledger.

## 5. Requirements — Clementia 2.0 (CC-C)
**Outcome:** reliable, explainable recommendations; human-approved drafts only.
- **CC-C-01** Proactive insight categories: likely stockout, suspicious variance, slow mover, cashflow/receivable exposure, purchasing opportunity, relevant referral opportunity. Define confidence and evidence boundaries per class.
- **CC-C-02** Every suggestion shows input period, source, data freshness, uncertainty, why it matters, expected impact assumptions, and **"Preview action"** or **"Dismiss"**.
- **CC-C-03** Owner-only fields never surface to attendants; work with existing role-scoped `SharedShopAsk` and `shopAssistant`, not a second direct database reader.
- **CC-C-04** AI/rules may propose only drafts; authorized merchant explicitly reviews an immutable diff and confirms before existing server mutation; block on stale or missing authoritative data.
- **CC-C-05** For suggestions tied to money, tax, stock or purchase commitments require deterministic recalculation on the server, durable operation key and policy checks; models never author authoritative totals.
- **CC-C-06** Provide opt-in AI where relevant, clear processing notice, no secret credentials in browser, no cross-tenant training or unconsented provider data sharing.
- **CC-C-07** Low-connectivity/offline path gives supported deterministic local explanations; clearly label unavailable cloud inputs rather than hallucinating current data.
- **CC-C-08** Feedback (useful/not useful, accepted, reverted) drives evaluation, not undisclosed automatic action.
**Acceptance:** no unauthorized action; every accepted recommendation maps to a permission-checked real record; contradictory numbers block action; offline/stale data is shown honestly; held-out evaluations and adversarial prompt-injection tests pass.

## 6. Requirements — Passport (CC-P)
**Outcome:** consumer-controlled proofs of purchase and useful, voluntary repeat relationship.
- **CC-P-01** Guest shopper can access a single signed receipt/claim link without registering; creating Passport is optional.
- **CC-P-02** Shopper opts in to add a receipt to Passport; merchant and consumer identities are not silently linked across stores. Give granular per-merchant sharing/revocation controls.
- **CC-P-03** Display purchase line items, date, merchant, return/warranty terms and verifiable status from actual recorded events. No paper receipt, order request or payment reference alone counts as settled proof.
- **CC-P-04** Allow issue/return/warranty request, merchant acknowledgment, decision and resolution; show precise timeline and policy. Merchant remains responsible under applicable law/terms.
- **CC-P-05** Merchant-configured loyalty rewards with explicit rules, expiry, fraud checks and separate financial-liability accounting; launch as non-transferable merchant perks, **not cash/stored value**.
- **CC-P-06** Support shopper export, deletion request, account recovery, consent withdrawal and configurable retention while respecting statutory record retention.
- **CC-P-07** No public revealing of purchase histories, phone numbers or credit information; sharing a receipt uses scoped token, revocation and abuse controls.
- **CC-P-08** Transparent cross-store benefits only where each merchant and shopper explicitly join and agree; no inferred global purchase profile.
**Acceptance:** shopper cannot fetch another customer's proof; merchant cannot view other merchants' receipts; refund/return statuses derive from authoritative merchant events; rewards cannot be double redeemed; withdrawal stops future optional sharing.

## 7. Shared functional / non-functional requirements
- **CC-X-01** Owner-specific opt-in for *each* network track, revocation and auditable consent versions; initial network publication OFF.
- **CC-X-02** Merchant identity and business verification workflow with traceable review; never describe self-declared identities as externally verified.
- **CC-X-03** Separate identities for merchant account, assigned staff, public guest and shopper; tenant- and store-scoped server auth for every mutation.
- **CC-X-04** Precision: store GHS minor-unit money and currency, unit, exchange/tax provenance where relevant; forbid unsafe JS float accumulation for financial totals.
- **CC-X-05** Accessibility WCAG 2.2 AA design target; semantic controls, 320px Android layouts, screen-reader announcements, reduced motion and keyboard operation.
- **CC-X-06** Low-data mobile web; first public purchase/request without installation; clear loading/empty/error/offline/retry state.
- **CC-X-07** Privacy, anti-spam, data retention, abuse appeals, rate limits, indexing controls, audit logs and redacted telemetry.
- **CC-X-08** All new workflows feature flagged per merchant and service, safe migration rollback, production monitoring and incident playbook.
- **CC-X-09** Any consumer-facing payments, wallet/credit, credit scoring, open banking, location tracking or regulated processing require independent legal/licensing/provider review before design approval or deployment.

## 8. Equal-weight success scorecards — pilot hypotheses, NOT actuals
Each track receives equivalent attention, independent success decisions and documented thresholds approved by the owner. Pilot cohort targets below are **proposals**; no market claim is implied.

| Track | Primary metric | Proposed pilot threshold to review | Quality/guardrail |
|---|---|---|---|
| Discover | merchant-confirmed incremental sales attributable to discovery | ≥10 verified incremental orders across a 30-merchant, 30-day controlled trial | low cancellation and no falsely confirmed availability |
| Network | successfully completed partner-referral requests | ≥20% of mutually accepted requests fulfilled in pilot | zero cross-tenant access, documented cancellations |
| Supply | verified **net** savings vs comparable previous landed cost | ≥5% median net savings where comparable; otherwise mark unproven | no auto purchasing, clear delivery/tax terms |
| Clementia | owner-accepted suggestions with verified benefit | ≥30% recommendations considered useful; benefit independently audited | zero unauthorized writes/unsafe money advice |
| Passport | opted-in shoppers who return to retrieve/use a receipt or service | ≥20% of activated shoppers reuse within 30 days | no cross-store leakage or unconsented profiling |

These gates are intentionally *hypotheses* and require sample design, budget and baseline signoff. A weak test should trigger learning, not invented success figures. Revenue model candidates: optional merchant subscription, clearly disclosed qualified-order fees, authorized partner commissions, optional supplier service subscription; no hidden ads or charged consumer participation without explicit consent. Compare fees to attributable value and support costs.

## 9. Explicit non-goals for first validated wave
- Replacing WhatsApp/WeChat/Facebook messaging; nationwide shipping network; instant national search coverage; a real-time stock guarantee without reserved authority.
- Autonomous AI purchases, unregulated escrow, wallet/stored value, automatic loan decisions or AI credit scores.
- Automatically merging local IndexedDB ledgers into Supabase shared shops.
- Claiming all features are unique or already deployed before competitor benchmark and field evidence.

## 10. Required research and pilot evidence
Run five parallel **prototype and evidence** streams: recruit merchant/shopper/supplier samples, compare current alternatives using real workflows, put prototypes in hands, instrument observed tasks and conversion, evaluate true incremental value, then decide which interaction to simplify. Qualitative interviews supplement real usage, not replace it. Document incentive effects, data gaps and cohort selection bias.

## 11. Cross-document references
[Master index](00_START_HERE_MASTER_SPEC.md) · [Architecture](02_TECHNICAL_ARCHITECTURE.md) · [UI/UX](03_UI_UX_INTERFACE_DESIGN.md) · [Agent roadmap](04_IMPLEMENTATION_ROADMAP_AGENT_PLAYBOOK.md)
