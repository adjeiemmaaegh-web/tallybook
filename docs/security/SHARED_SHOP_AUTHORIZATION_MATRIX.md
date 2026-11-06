# Shared-shop authorization matrix (PRD R5)

Source of truth: `public.tallybook_shop` and `public.tallybook_membership` (SECURITY DEFINER, executable by `authenticated` only). Every action first requires an **active Auth session** (`auth.sessions` row, not expired) and a `business_members` row for the company. A revoked member fails at the membership check on the next call, so a queued request replayed after revocation is rejected, never applied.

Evidence column: migration file and approximate line, plus the repo test that exercises it. "Needs negative test" means the rule is read from SQL but has no dedicated denial test yet.

| Action | Owner | Attendant | Other company / no session | Evidence |
|---|---|---|---|---|
| `overview` | Everything incl. members, invites | Own assigned active stores, active products, own stock | Denied | `20261105070036` L256-287 |
| `listSales` | All sales | Own sales only | Denied | L288-298 |
| `recordSale` | Yes | Only in assigned, active stores; discount/credit limited by `shop_member_permissions` | Denied | L300+, `20261105120712` L346+ |
| `setupLedger`, `saveStore`, `setStoreStatus`, `assignStore`/`unassignStore`, `saveProduct`, `adjustStock`, `inviteByEmail` | Yes | **Denied** ("Business owner only", gate at L419) | Denied | `20261105070036` L419-540 |
| `refundSale` | Yes, subject to refund policy | **Denied** | Denied | `20261105120712` L534; `qa/shared-shop-refund-policy.test.mjs` |
| `refundPolicy` (read) | Yes, with history | Current policy only, no history | Denied | `20261106120000`; same test |
| `setRefundPolicy` | Yes (confirmed, reasoned, revision-checked) | **Denied** | Denied | same |
| `importOpening` | Yes | **Denied** | Denied | `20261105110003` |
| `setMemberPermissions` | Yes | **Denied** | Denied | `20261105120712` L696-697 |
| `saveCustomer` | Yes, may set credit limit | Allowed if permitted; **credit limit owner only** | Denied | L718-727 |
| `recordRepayment`, `customerStatement` | Yes | Needs negative test for a member without `canCredit` | Denied | L745, L784 |
| `invite` / `revokeInvite` / `revokeMember` / `listMembers` | Yes | **Denied** ("Owner-only membership action") | Denied | `20261105022238` L92-93 |
| `accept` | n/a | The invited account only; single use; 24 h after `20261106130000` | Wrong account refused | L54-61 |

## Invariants checked by tests

- Rival-company users cannot read or change another company's policy or sales (`shared-shop-refund-policy.test.mjs`).
- A policy change and a refund serialize on the same ledger row lock.
- Policy history, sales and stock movements are append-only at the database.
- Browser roles have no table privileges; the two public RPCs are the only entry points (Supabase advisor lists them as intended `authenticated_security_definer_function_executable` warnings).

## Known gaps (do not claim release-ready)

1. No dedicated denial test for `recordRepayment` / `customerStatement` by an attendant without credit permission.
2. No automated test of a revoked member's queued sale being rejected end to end (the rule follows from the membership check; needs a live two-account run).
3. Leaked-password protection is off in the Supabase Auth settings (dashboard setting; not changeable from SQL).
4. A `SECURITY DEFINER` review of the older `company_*` device/staff functions in the QA project is outside this matrix.
