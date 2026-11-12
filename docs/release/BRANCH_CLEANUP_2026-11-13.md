# Tallybook repository: verified branch cleanup (13 November 2026)

This change does **not** merge any incomplete business-logic branch. It only
creates a one-time GitHub Actions mechanism to prune branch refs **after**
checking their exact pinned commit SHA is an ancestor of live `main`.

- Manifest: 91 original non-main branch names, each pinned to its SHA.
- GitHub API comparison `main...branch` must prove zero commits ahead.
- A branch referenced by an **open pull request** (head or base) is protected.
- Backup/release refs, GitHub-protected refs, changed tips and the active
  `development/v19-friends-web-test` Vercel configuration remain intact.
- PR checks run in read-only dry-run mode. Deletion runs only on a named merge
  commit marked `[prune-ancestors-20261113]`, and only on `main`.
- Server-side failures stop a run with visible logs. Restore any deleted branch
  with the SHA in the manifest, if needed.
- Financial, auth, SQL and cloud functionality is untouched.

Do not treat old diverged branch files as proven missing features: compare live
behavior and tests, not names or ahead counters. Draft migrations and unfinished
security/offline code require a separate verified integration before merging.
