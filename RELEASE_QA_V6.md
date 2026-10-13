# Tallybook Assistant V6 — release QA follow-up

## Changes
- Clarified the atomic compound-sale preview: it now advertises **one sale** with **N products**, not N transactions.
- Added a regression assertion for the preview title and confirmation button wording.
- Preserved sequential behavior for separate multi-command batches and all existing financial transaction confirmation rules.

## Verification limits
- Syntax parsing completed for the changed TypeScript files.
- Full Vitest suite, TypeScript typecheck and Vite build could not run: project dependencies are not installed and the npm registry could not be reached (`EAI_AGAIN`).
- No browser end-to-end run occurred. This is a QA candidate, not a production certification.

## Release gate to run with network/dependencies available
1. Use the Node version required by package.json and enable Corepack / install the pinned pnpm version.
2. `pnpm install --frozen-lockfile`
3. `pnpm check && pnpm test && pnpm build`
4. Test combined sales with multiple stock items, partial payment, a product archived after preview, repeated confirmation, and cross-business isolation on a clean IndexedDB profile.
