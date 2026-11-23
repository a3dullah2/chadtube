#!/usr/bin/env python3
"""Merge per-channel JSON files into the final compact dataset."""
import json, os
from harvest_channels import OUT

channels, videos, seen = [], [], set()
ok = sorted([f for f in os.listdir(OUT) if f.endswith(".json") and f != "videos.json"])
for fn in ok:
    with open(f"{OUT}/{fn}") as f:
        ch = json.load(f)
    idx = len(channels)
    channels.append({"n": ch["name"], "tier": ch["tier"], "cid": ch["cid"],
                     "count": len(ch["videos"])})
    for v in ch["videos"]:
        if v["id"] in seen:
            continue
        seen.add(v["id"])
        videos.append({"id": v["id"], "t": v["t"], "d": v["d"], "v": v["v"], "c": idx})
with open(f"{OUT}/videos.json", "w") as f:
    json.dump({"channels": channels, "videos": videos}, f, separators=(",", ":"))
print(f"channels={len(channels)} videos={len(videos)}")
