#!/usr/bin/env python3
"""Sanity-check the merged dataset (indices, dupes, counts, tier stats)."""
import json, hashlib, collections

PATHS = [
    "/home/z/my-project/src/data/videos.json",
    "/tmp/tube-data/videos.json",
    "/home/z/my-project/download/mytube-starter-kit/videos.json",
]
hashes = [hashlib.md5(open(p, "rb").read()).hexdigest()[:10] for p in PATHS]
print("copies identical:", len(set(hashes)) == 1, hashes)

d = json.load(open(PATHS[0]))
chs, vids = d["channels"], d["videos"]
print("channels:", len(chs), "videos:", len(vids))

tiers = collections.Counter(c["tier"] for c in chs)
print("channels per tier:", dict(tiers))
vids_per_tier = collections.Counter(chs[v["c"]]["tier"] for v in vids)
print("videos per tier:", dict(vids_per_tier))

# index + count integrity
bad_idx = [v for v in vids if not (0 <= v["c"] < len(chs))]
print("bad channel indices:", len(bad_idx))
counts = collections.Counter(v["c"] for v in vids)
mismatch = [(c["n"], c["count"], counts[i]) for i, c in enumerate(chs)
            if c["count"] != counts[i]]
print("count mismatches:", len(mismatch), mismatch[:5])

# duplicate ids
dupes = [i for i, n in collections.Counter(v["id"] for v in vids).items() if n > 1]
print("duplicate video ids:", len(dupes))

# dated coverage per tier
for t in ("S", "A", "B", "C", "D", "R", "★"):
    rows = [v for v in vids if chs[v["c"]]["tier"] == t]
    if not rows:
        continue
    dt = sum(1 for v in rows if v.get("ts"))
    print(f"tier {t}: {len(rows)} videos, {dt * 100 // len(rows)}% dated")

# R-channel examples: newest videos in feed should mix curated + R + ★
by_ts = sorted([v for v in vids if v.get("ts")], key=lambda v: -v["ts"])[:12]
print("\nnewest 12 in feed:")
for v in by_ts:
    ch = chs[v["c"]]
    print(f"  [{ch['tier']}] {ch['n'][:28]:<28} {v['t'][:48]}")

# biggest R channels by harvested rows
r = sorted([c for c in chs if c["tier"] == "R"], key=lambda c: -c["count"])
print("\ntop R channels by catalog size:")
for c in r[:10]:
    print(f"  {c['count']:>3}  {c['n']}")
