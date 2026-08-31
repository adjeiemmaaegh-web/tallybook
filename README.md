# Tallybook — Business Ledger

An offline-first business ledger built with React, Vite, TypeScript, Dexie/IndexedDB, and a PWA service worker.

## Development

```bash
pnpm install
pnpm dev
```

The app runs locally at `http://localhost:3000`.

## Production build

```bash
pnpm build
```

The browser application is generated in `dist/public`.

## Vercel deployment

This repository is configured for Vercel as a Vite static application:

- Build command: `pnpm build`
- Output directory: `dist/public`
- SPA routing: configured in `vercel.json`
- PWA: enabled through `vite-plugin-pwa`

Connect the GitHub repository to Vercel and deploy. Future pushes to the connected branch can trigger new deployments.

## Data model

Business records are currently stored locally in the browser using IndexedDB. Hosting the frontend on Vercel does **not** automatically create a shared cloud database or synchronize data between devices.

Use the application's Backup/Restore feature to move or protect records while the app remains local-first.

## Secrets

No API keys or provider credentials are required by the current standalone build. Do not commit `.env` files or real credentials. Use `.env.example` as the starting point when a future feature requires environment variables.

## Commercial deployment note

This repository is intended to become a commercial product. Vercel's current Hobby plan is restricted to personal/non-commercial use, so use Hobby only while the deployment genuinely remains personal/non-commercial testing. Move the deployment to an appropriate paid plan before using it for commercial purposes.
