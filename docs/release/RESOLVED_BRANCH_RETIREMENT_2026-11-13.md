# Branch retirement — 13 November 2026

This one-time GitHub Actions change retires exactly seven branch refs whose pinned
SHA and PR evidence were individually reviewed. Four PRs had already been merged,
including their merge commits being ancestors of current main. Three old PRs
were closed because equivalent-or-safer current implementation superseded them.
Details and exact source/evidence are in the per-PR discussion histories.

GitHub workflow performs a read-only verification on the PR. A unique marker
on the reviewed main merge triggers deletion, after rechecking every SHA,
PR closure, GitHub protection, open-PR head/base dependencies and merged ancestry.
Changed branches are never deleted. No active draft, backup, release, test
or customer data is affected. Remove the workflow/script after completion;
retain the SHA manifest to reconstruct a historical branch if needed.
