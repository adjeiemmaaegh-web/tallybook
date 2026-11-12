#!/usr/bin/env python3
"""One-use GitHub ref cleanup: delete ONLY reviewed, unchanged, unreferenced branches."""
import json, os, urllib.request, urllib.parse, sys
from pathlib import Path
MARKER="[retire-reconciled-20261113]"
data=json.loads((Path(__file__).resolve().parents[1]/"qa"/"resolved-branches-20261113.json").read_text())
repo=data["repo"]
def api(path, method="GET"):
    token=os.environ.get("GH_TOKEN")
    if not token: raise RuntimeError("No GitHub token")
    r=urllib.request.Request("https://api.github.com/repos/"+repo+path,method=method,headers={"Authorization":"Bearer "+token,"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"})
    with urllib.request.urlopen(r,timeout=35) as v:
        b=v.read()
        return json.loads(b) if b else None
def pages(path):
    rows=[]
    for n in range(1,6):
        part=api(path+("&" if "?" in path else "?")+"per_page=100&page="+str(n))
        if not isinstance(part,list): raise RuntimeError("Invalid pagination")
        rows.extend(part)
        if len(part)<100:return rows
    raise RuntimeError("Pagination truncated")
def eligible(entry,branches,used):
    name=entry["branch"]
    b=branches.get(name)
    if name in used or name=="main" or name.startswith(("backup/","release/")) or not b:return False
    if b["commit"]["sha"]!=entry["sha"] or b.get("protected"):return False
    pr=api("/pulls/"+str(entry["pr"]))
    if pr["state"]!="closed" or pr["head"]["sha"]!=entry["sha"] or pr["head"]["ref"]!=name:return False
    if (pr["head"]["repo"] or {}).get("full_name")!=repo:return False
    if "merged" in entry:
        if pr.get("merged") is not True or pr.get("merge_commit_sha")!=entry["merged"]:return False
        cmp=api("/compare/main..."+entry["merged"])
        if cmp.get("ahead_by")!=0 or cmp.get("status") not in ("behind","identical"):return False
    elif pr.get("merged") is not False or not entry.get("superseded"):return False
    return True
def main():
    if os.environ.get("GITHUB_REPOSITORY")!=repo:raise RuntimeError("Wrong repository")
    execute=os.environ.get("RETIRE_EXECUTE")=="true"
    if execute and (os.environ.get("GITHUB_EVENT_NAME")!="push" or os.environ.get("GITHUB_REF")!="refs/heads/main" or MARKER not in os.environ.get("GITHUB_HEAD_MESSAGE","")):
        raise RuntimeError("Deletion not authorized for this event")
    mainsha=api("/git/ref/heads/main")["object"]["sha"]
    if execute and mainsha!=os.environ.get("GITHUB_SHA"):raise RuntimeError("main changed")
    branches={x["name"]:x for x in pages("/branches")}
    used={"main"}
    for pr in pages("/pulls?state=open"):
        if (pr["head"].get("repo") or {}).get("full_name")==repo:used.add(pr["head"]["ref"])
        if (pr["base"].get("repo") or {}).get("full_name")==repo:used.add(pr["base"]["ref"])
    chosen=[e for e in data["entries"] if eligible(e,branches,used)]
    print("MAIN",mainsha,"VERIFIED",len(chosen),"MANIFESTED",len(data["entries"]))
    for entry in chosen:
        name=entry["branch"]
        print(("DELETE" if execute else "WOULD DELETE"),name,entry["sha"])
        if execute:
            # Re-read the branch and PR before each deletion; never remove changed work.
            fresh={x["name"]:x for x in pages("/branches")}
            if not eligible(entry,fresh,used):raise RuntimeError("Ref or PR changed: "+name)
            api("/git/refs/heads/"+urllib.parse.quote(name,safe="/"),"DELETE")
            print("DELETED",name)
    if execute:print("RETIREMENT COMPLETED")
    else:print("DRY RUN ONLY")
if __name__=="__main__":main()
