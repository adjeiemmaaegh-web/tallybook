# Tallybook V19 — Windows local preview quick start (October 12, 2026)

**Status: Local DEVELOPMENT PREVIEW only. NOT a commercial release, not validated end-to-end.**

## Launch using the shortest path

1. Use a **Windows 11** laptop or desktop with working Internet for the first installation.
2. Install **Node.js 24.19.0** from <https://nodejs.org/en/download> (official Node website). Close and reopen File Explorer/Command Prompt after installation.
3. Extract the **entire continuation ZIP** to a normal folder, e.g. `C:\TallybookPreview`. Do **not** run the `.cmd` from inside ZIP preview.
4. Double-click **`START_TALLYBOOK_WINDOWS.cmd`** in the `tallybook_fixed` folder. Allow the first-time dependency installation and frontend compilation to complete.
5. If the browser does not open automatically, navigate to **http://127.0.0.1:4173/** while the terminal remains open.
6. For formal client tests, stop the preview with Ctrl+C, then double-click **`CHECK_TALLYBOOK_WINDOWS.cmd`**. These tests are **not automatically run** by the fast preview launcher.

The first launch must download exact dependencies locked by `pnpm-lock.yaml`, including pnpm 10.34.0 if not already installed. If download or build fails, **no runnable application has been produced**. Check the terminal output. Do not use an incomplete build for customer records.

## What this preview does and does not do

- The preview server serves only compiled browser assets from `dist/public` and listens on **127.0.0.1**:4173. It has **no connected financial sync, cloud backup, payment service or server APIs**.
- Core Tallybook workflows still depend on actual browser QA; the latest full native suite does **not** replace browser verification.
- Use fictional **sample data** only. No live client, card, Mobile Money, account, or customer information until appropriate testing and release approval.
- Do not forward this port to the Internet, disable security protections, or advertise this build as production-ready.
- The app's IndexedDB data is tied to the **exact origin** (`http://127.0.0.1:4173`) and browser profile. Changing port, browser, protocol or host can make existing records appear missing. Do not clear site data; use tested backups.
- Once built, the local preview server requires only Node.js and the generated `dist/public`, but the first build requires dependencies and Internet.
- Company-specific return/refund policies remain a product requirement; **do not enable unverified refund workflows** to get a release out sooner.

## Troubleshooting

| Symptom | Correct response |
|---|---|
| `node` not found | Install official Node 24.19.0, reopen terminal, retry |
| Network, npm or Corepack download failed | Verify Internet access to npm registry; retry without changing `pnpm-lock.yaml` |
| `pnpm ...` or Vite build fails | Capture the terminal error; build is **not ready** |
| Port 4173 already in use | Close the other preview process, then retry; preserve the port for browser storage continuity |
| Blank or erroneous page | Use browser DevTools Console to record errors; don't rely on this as a working release |
| App opens but QA fails | Remains a local development preview; fix and re-run all tests |
| Data seems absent in another browser or port | Open the original URL/profile; do **not** reinitialize or overwrite it |

## Manual terminal alternative

Open PowerShell in `tallybook_fixed`:

```powershell
npm exec --yes --package=pnpm@10.34.0 -- pnpm install --frozen-lockfile
npm exec --yes --package=pnpm@10.34.0 -- pnpm exec vite build
node tools/local-preview-server.mjs
```

For full native tests (Node 24 is recommended):

```powershell
node --experimental-strip-types --test scripts/historical-costing-check.mjs qa/*.test.mjs qa/*.test.cjs server/tests/*.test.mjs
node --test server/tests/paymentGateway.test.mjs
```

Note: PowerShell on Windows does not reliably expand `*.test.mjs` as Unix shells do. Use `CHECK_TALLYBOOK_WINDOWS.cmd` for client checks and the repository's GitHub Actions workflow for the cross-platform native test glob.

**Release verdict is still NO-GO / INCOMPLETE**, regardless of successful preview startup.
