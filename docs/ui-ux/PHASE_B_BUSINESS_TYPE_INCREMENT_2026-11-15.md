# Phase B — verified business categories (Stages 3 and 22)
Source increment: `feat/phase-b-persisted-business-types-20261115`, from merged PR #93 (commit `f27751e144eecc234881b550d5ab221ab47ebf87`).

## Existing features preserved
- Cloud business owner/membership remains the canonical Supabase identity; local device company records are never automatically bound to a cloud account.
- Existing `create_owned_business` operation IDs remain replay safe and business creation first verifies owner membership.
- Existing business rows stay valid with a NULL category. Existing ledgers, store currencies, stock, refunds, permissions, cashiers and customer records are not migrated or rewritten.
- The categories are descriptive metadata; they do **not** choose refund permissions, tax rules, inventory modules or employee entitlements.

## Implemented source changes
1. Nullable `public.businesses.business_type` column plus permitted-category check (10 existing Tallybook business categories).
2. `private.set_cloud_business_type`: security-definer with fixed empty search path, direct `auth.uid()` owner check, explicit canonical owner membership check and row-level lock; writes ONLY the selected company's classification. `public.set_cloud_business_type` is a security-invoker wrapper; explicit grants to authenticated only, no direct authenticated UPDATE to businesses table.
3. Cloud membership reader projects category only through the previously verified RLS membership boundary and rejects malicious/unknown values.
4. Owner creation requires choosing a business type and only navigates after a re-read proves it was persisted for the verified owner.
5. Existing owners may update an unclassified or differently classified cloud business from account settings. Attendants see a read-only classification and never the update control.
6. Pure type registry is shared between local and cloud UI but doesn't link or upload local data.

## Rollout gate
- **Before deploying this frontend**, independently review and apply migration `20261115012500_cloud_business_type.sql` to the correct production Supabase project `qfyydfxwvifdvffdfgeu`; verify column, constraint, owner-only RPC grants and RLS read policy before staging the new app.
- The migration MUST run after full source CI is green. A schema-only additive release is backward-compatible with the currently live frontend.
- In the event of partial failure, retain the older production frontend. The rollback explicitly refuses to erase any non-null saved category.
- Run owner/attendant/authentication-negative end-to-end tests on an isolated test tenant; no simulated authorization is a substitute for production acceptance.
- Do not publicly claim all Stages 3/22 live or complete until migration, exact-commit deployment and real-account checks are proven.

## Unrelated Phase B work not implemented
Product variants, customer-facing online checkout, verified cross-device cloud sync, Apple sign-in and public marketing routes remain outstanding.
