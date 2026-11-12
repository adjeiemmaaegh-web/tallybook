#!/usr/bin/env python3
"""One-time, pinned-sha deletion of GitHub branches proven contained in main.

Default mode is DRY RUN. Never delete current main, changed branch tips, open-PR
heads/bases, backups, releases, or an active Vercel branch environment.
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

MANIFEST = Path(__file__).resolve().parent.parent / "qa" / "branch-cleanup-manifest-20261113.json"
MARKER = "[prune-ancestors-20261113]"
PRESERVED = {"development/v19-friends-web-test"}
PREFIXES = ("backup/", "release/")
MAX_REMOVALS = 90

def api(repo, endpoint, method="GET"):
    token = os.environ.get("GH_TOKEN", "")
    if not token:
        raise RuntimeError("GITHUB_TOKEN is missing")
    url = "https://api.github.com/repos/" + repo + endpoint
    req = urllib.request.Request(url, method=method, headers={
        "Authorization": "Bearer " + token,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "tallybook-branch-ancestor-pruner"
    })
    with urllib.request.urlopen(req, timeout=30) as response:
        content = response.read()
        return json.loads(content) if content else None

def pages(repo, suffix):
    rows = []
    for page in range(1, 11):
        part = api(repo, suffix + ("&" if "?" in suffix else "?") + "per_page=100&page=" + str(page))
        if not isinstance(part, list):
            raise RuntimeError("Unexpected API page response")
        rows.extend(part)
        if len(part) < 100:
            return rows
    raise RuntimeError("Refusing truncated pagination")

def main():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    if repo != manifest["repository"]:
        raise RuntimeError("Repository mismatch")
    execute = os.environ.get("PRUNE_EXECUTE") == "true"
    if execute and (os.environ.get("GITHUB_EVENT_NAME") != "push" or
                    os.environ.get("GITHUB_REF") != "refs/heads/main"):
        raise RuntimeError("Deletion only allowed for a guarded main-branch push")
    if execute and MARKER not in os.environ.get("GITHUB_HEAD_MESSAGE", ""):
        raise RuntimeError("Deletion marker not present")
    current_main = api(repo, "/git/ref/heads/main")["object"]["sha"]
    if execute and current_main != os.environ.get("GITHUB_SHA"):
        raise RuntimeError("Main moved while cleanup was pending")
    refs = {b["name"]: b for b in pages(repo, "/branches")}
    open_prs = pages(repo, "/pulls?state=open")
    used = set()
    for pr in open_prs:
        head = pr.get("head") or {}
        if (head.get("repo") or {}).get("full_name") == repo:
            used.add(head.get("ref"))
        if (pr.get("base") or {}).get("repo", {}).get("full_name") == repo:
            used.add((pr.get("base") or {}).get("ref"))
    selected, skipped, errors = [], [], []
    for name, original in sorted(manifest["refs"].items()):
        if name in PRESERVED or name.startswith(PREFIXES) or name in used:
            skipped.append((name, "preserved / open PR dependency"))
            continue
        item = refs.get(name)
        if not item or item["commit"]["sha"] != original:
            skipped.append((name, "missing or branch head changed"))
            continue
        if item.get("protected"):
            skipped.append((name, "GitHub protected branch"))
            continue
        encoded = urllib.parse.quote(name, safe="")
        try:
            cmp = api(repo, "/compare/main..." + encoded)
        except Exception as exc:
            errors.append((name, "compare failed: " + str(exc)))
            continue
        if cmp.get("ahead_by") == 0 and cmp.get("status") in ("behind", "identical"):
            selected.append((name, original))
        else:
            skipped.append((name, "not fully contained in main"))
    print("AUDIT main =", current_main)
    print("PRESERVED / NOT ELIGIBLE =", len(skipped))
    print("VERIFIED ANCESTOR CANDIDATES =", len(selected))
    for name, sha in selected:
        print(("DELETE " if execute else "WOULD DELETE ") + name + " " + sha)
    if errors:
        for name, err in errors:
            print("ERROR", name, err, file=sys.stderr)
        raise RuntimeError("Comparison errors: no deletion performed")
    if len(selected) > MAX_REMOVALS:
        raise RuntimeError("Deletion count exceeds safety cap")
    if not execute:
        print("DRY RUN ONLY. NO BRANCHES CHANGED.")
        return
    failures = []
    for name, original in selected:
        encoded = urllib.parse.quote(name, safe="/")
        try:
            ref = api(repo, "/git/ref/heads/" + encoded)
            if ref["object"]["sha"] != original:
                print("SKIP updated:", name)
                continue
            # Compare again after preflight: only provable ancestors may be removed.
            cmp = api(repo, "/compare/main..." + urllib.parse.quote(name, safe=""))
            if cmp.get("ahead_by") != 0 or cmp.get("status") not in ("behind", "identical"):
                print("SKIP diverged:", name)
                continue
            api(repo, "/git/refs/heads/" + encoded, "DELETE")
            print("DELETED", name)
        except Exception as exc:
            failures.append((name, str(exc)))
            print("DELETE FAILED", name, exc, file=sys.stderr)
    if failures:
        raise RuntimeError("Some branch deletions failed; inspect output and retry only after fresh audit")
    print("ONE-TIME CLEANUP COMPLETED")

if __name__ == "__main__":
    main()
