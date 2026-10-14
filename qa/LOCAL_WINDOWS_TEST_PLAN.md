# Tallybook — Windows local acceptance runbook (deferred)

**Purpose:** reproduce the GitHub UI and release checks without paying for GitHub-hosted runners. This runbook is documentation, **not evidence that tests were run**. The owner will execute it later on a Windows PC.

## Safety requirements
- Use a separate cloned folder, not a working copy containing actual customer records.
- Browser automation creates its own browser contexts and **test-only shop**; never run these commands against the hosted production Tallybook URL.
- The commands below only target the **local** Vite development server at `127.0.0.1:4174` and, for offline browser checks, the local preview at `127.0.0.1:4175`.
- No payment connection, production deployment, merge, database reset of a real store, or cloud upload is required.

## Prerequisites
- Windows 11, PowerShell, Git, Node.js **24.19.0** (see `.node-version`), pnpm **10.34.0**.
- Internet for the initial clone and dependency/Chromium installation.
- At least a few GB of free disk space; Chromium installation is sizeable.
- Because of the default PowerShell script policy, use `pnpm.cmd` (not `pnpm`). **Do not disable your Windows execution policy.**

## Obtain the isolated candidate from GitHub PR #10

```powershell
cd $HOME
git clone https://github.com/adjeiemmaaegh-web/tallybook.git tallybook-qa-copy
cd tallybook-qa-copy
git switch fix/clementia-maximize-minimize-2026-10-14
git status --short
git rev-parse HEAD
node --version
pnpm.cmd --version
```

Keep the exact commit SHA in the report. For a private repository, Git may prompt for GitHub authentication; **never share tokens/passwords**. The branch above contains the *unmerged Clementia fix*, while `main` may not.

## Install exact dependencies and local Chromium

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd exec playwright install chromium
```

Stop on any error. Use the lockfile; do not use `pnpm update` or change dependency versions to make a failure disappear.

## Focused Clementia regression (run first)

```powershell
pnpm.cmd exec playwright test --config playwright.visual.config.mjs
```

This invokes the local Vite server automatically. The Playwright test verifies six desktop/tablet/mobile sizes, uses fake shop setup, and checks:

- Floating panel opens and closes; focus returns to the launcher.
- Maximize expands in place, with no route change; **Minimize Clementia** reverses it.
- Unsent draft text survives maximize/minimize and Escape.
- A user on the legacy full-page `/assistant` route can minimize back to the floating panel.
- No horizontal overflow or broken quick-action/setup links.

Screenshots and failure traces are under `artifacts/ui-visual/`. The run only **passes** if the command exits with code **0** and Playwright reports all tests passed.

## Wider app checks (run in this order)

```powershell
pnpm.cmd check
pnpm.cmd test --maxWorkers=2
pnpm.cmd build
pnpm.cmd exec playwright test
pnpm.cmd exec playwright test --config playwright.offline.config.mjs
```

- `check`: semantic TypeScript errors.
- `test`: Vitest unit and integration suite.
- `build`: compilation/bundling; not a deployment.
- Browser and offline Playwright suites: local IndexedDB migrations, business flows and offline checkout.

For closer parity with the release workflow, also run the native Node test suite from PowerShell:

```powershell
$tests = @('scripts/historical-costing-check.mjs')
$tests += @(Get-ChildItem 'qa' -Filter '*.test.mjs' -File | ForEach-Object { $_.FullName })
$tests += @(Get-ChildItem 'qa' -Filter '*.test.cjs' -File | ForEach-Object { $_.FullName })
$tests += @(Get-ChildItem 'server/tests' -Filter '*.test.mjs' -File | ForEach-Object { $_.FullName })
node --experimental-strip-types --test @tests
```

(Optional, requires network): `pnpm.cmd audit --audit-level moderate`. Track any reported vulnerabilities separately; do not hide failures.

## What to send for review

For each command note **PASS / FAIL / NOT RUN**, the actual exit status, and the selected commit SHA. If a command fails, send the last 40–80 terminal lines **with personal paths or business data redacted**; do not send secrets. Include relevant screenshots or redacted traces from `artifacts/` if needed.

If all checks are green, inspect Clementia manually in a private local browser session before approving any merge. A passing run confirms this candidate at this commit and machine; it is not blanket commercial-release certification.

**Status when authored:** deferred; no execution results recorded.
