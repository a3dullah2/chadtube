#!/usr/bin/env python3
"""Retry channel resolution with more specific search queries."""
import json, os, re
from harvest_channels import norm, run, OUT

RETRY = [
    ("Kiwami Japan", "S", "Kiwami Japan sharpest kitchen knife"),
    ("Know Art", "A", "Know Art machines animated how it works"),
    ("Joshua Bird", "A", "Joshua Bird drone with only one motor"),
    ("This Old Tony", "C", "This Old Tony machining"),
    ("AngeTheGreat", "C", "AngeTheGreat engine sound simulator"),
]

def resolve(query, want):
    p = run(["yt-dlp", "--flat-playlist", "-J", "--no-warnings", f"ytsearch8:{query}"])
    if p.returncode != 0:
        return None
    try:
        data = json.loads(p.stdout)
    except Exception:
        return None
    entries = [e for e in (data.get("entries") or []) if e]
    for e in entries:
        ch = e.get("channel") or e.get("uploader") or ""
        if norm(want) in norm(ch) and len(norm(ch)) > 2:
            return e.get("channel_id")
    # fallback: print candidates for manual inspection
    for e in entries[:8]:
        print("   cand:", e.get("channel"), e.get("channel_id"))
    return None

for name, tier, q in RETRY:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    out = f"{OUT}/{slug}.json"
    if os.path.exists(out):
        print("cached", name)
        continue
    print("resolving", name, "…")
    cid = resolve(q, name)
    if not cid:
        print("STILL FAILED", name)
        continue
    p = run(["yt-dlp", "--flat-playlist", "-J", "--no-warnings",
             "--playlist-end", "250", f"https://www.youtube.com/channel/{cid}/videos"])
    try:
        data = json.loads(p.stdout)
    except Exception:
        print("parse fail", name)
        continue
    vids = []
    for e in (data.get("entries") or []):
        if not e or not e.get("id"):
            continue
        vids.append({"id": e["id"], "t": (e.get("title") or "").strip()[:150],
                     "d": int(e.get("duration") or 0), "v": int(e.get("view_count") or 0)})
    if not vids:
        print("empty", name)
        continue
    with open(out, "w") as f:
        json.dump({"name": name, "tier": tier, "cid": cid, "videos": vids}, f)
    print("ok", name, len(vids))
