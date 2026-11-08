# Shared-shop migration verification

The SQL files in `migrations/` describe the candidate schema. A historical check on 5 November 2026 predates later policy, invitation and operations work. Verify the destination's actual version identifiers **and schema** separately before any future rollout. The integration branch was tested only against disposable databases.

Run the complete upgrade and transaction checks locally after a frozen dependency install.

```sh
node --test qa/backend-stage-b-e.test.mjs qa/shared-shop*.test.mjs qa/stakeholder-membership-rpc.test.mjs
```

The operations suite applies the main chain, creates representative shops and stock, then upgrades them. It checks a populated sale's policy snapshot, rejects ambiguous preview policy history and exercises rollback, replay and unauthorized calls. The four candidate migrations follow the canonical refund policy and 24-hour invitation. See the [migration compatibility notes](../docs/release/RC_INTEGRATION.md).

Shared-shop browser access goes through authenticated RPCs. The operations RPC uses a pinned search path, verifies the active server session and company membership and applies action-level role restrictions. Its tables have RLS and no direct authenticated or anonymous grants. A cached device identity never authorizes a server mutation.

Verify hosted OAuth callbacks, two-account isolation and online revocation separately on an owner-authorized test environment. The standalone browser tests use local staff authentication. The reference UI suite uses a non-production URL to verify signed-out cloud entry.
