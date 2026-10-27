# Try the reconciled Tallybook locally on Windows

The independent clone is at `work/tallybook-local-clone` in this workspace. It contains full Git history, 39 preserved remote heads, the `development/v19-unified-reconciliation` branch, and installed dependencies. `git fsck --full` completed without object corruption; it reported only dangling historical objects.

1. Open the clone folder in File Explorer and double-click `START_TALLYBOOK_WINDOWS.cmd`.
2. When it says the build succeeded, open `http://127.0.0.1:4173/` on that Windows PC. Keep the terminal open during the test; Ctrl+C stops it.
3. Exercise a disposable shop first: owner PIN, attendant PIN and permission denial, sale, refund policy, backup and restore. Preserve any existing browser data and backups before trying a new build.

The launcher was exercised on 2026-10-27: it used already installed dependencies, built the PWA, passed its static asset check, and the local page returned HTTP 200. It serves only browser assets on loopback; it does not provide a cloud API, live payment endpoint, or a connection from the Android phone. The Vercel domain remains on its previous deployment until a separate release decision. IndexedDB data is tied to this exact URL and browser profile.

For a fresh checkout, use Node 24.19.0 and the frozen `pnpm-lock.yaml`, then follow `BUILD_AND_CONTINUATION.md`. The source package includes the launch script and verification logs. Automated checks do not replace testing owner and attendant workflows with the user's existing Windows/Android data and a sanitized backup.
