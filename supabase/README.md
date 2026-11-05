# Supabase migration verification

`supabase/migrations` mirrors production project `qfyydfxwvifdvffdfgeu` (checked against `supabase_migrations.schema_migrations` on 5 November 2026). Every file matches a recorded production version. The old `001`–`003` `tb_*` files were never applied anywhere and now live in `docs/history/unapplied-migrations/`. Do not re-apply recorded migrations manually. The test project is documented in `supabase/test-project/README.md`.

`20261013123347_business_identity.sql` creates the ownership foundation only. It does not upload local data or create cloud bookkeeping records. The authenticated caller becomes the owner through an atomic function; callers cannot write membership tables directly.

Local PostgreSQL verification (uses PGlite; no Supabase connection):

```
node --test qa/cloud-membership.test.mjs
```

Authentication browser verification uses an isolated fake session and test-only project URL, never production credentials:

```
pnpm exec playwright test --config playwright.auth.config.mjs
```

Before a real rollout, verify Google OAuth and callback URLs in the connected test/preview environment. Then verify two real accounts against the project: private business isolation, rejected owner impersonation, authorized assignment, immediate online revocation and denied anonymous queries. The offline local identity marker is not a server authorization token.

The source security model follows the Supabase guidance on [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and [database function privileges](https://supabase.com/docs/guides/database/functions). Private security-definer functions pin the search path and verify the authenticated caller before privileged writes. Public RPC wrappers use security invoker. The second migration restricts an existing internal RLS event-trigger helper without disabling its automatic RLS behavior.
