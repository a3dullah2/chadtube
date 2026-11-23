#!/usr/bin/env python3
"""Harvest "videos like the playlist": the catalogs of every creator that
appears >=2 times in the user's playlist, merged as tier "R" channels.

Caps scale with playlist affinity (how many of the creator's videos the user
saved): >=5 -> 250 uploads, 3-4 -> 100, exactly 2 -> 40. Each channel is
fetched from the browse API (/channel/<cid>/videos) with
youtubetab:approximate_date, so rows carry upload timestamps.

Resumable: per-channel results cached in /tmp/similar-cache/<cid>.json.
Merges into all three dataset copies:
  - /home/z/my-project/src/data/videos.json            (Next.js app)
  - /tmp/tube-data/videos.json                         (working copy)
  - /home/z/my-project/download/mytube-starter-kit/videos.json (static kit)
Existing video ids (including the ★ playlist rows) always win over new ones.
"""
import json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor, as_completed

FLAT_CACHE = "/tmp/niche-flat.json"
CACHE_DIR = "/tmp/similar-cache"
APP_JSON = "/home/z/my-project/src/data/videos.json"
KIT_JSON = "/home/z/my-project/download/mytube-starter-kit/videos.json"
WORK_JSON = "/tmp/tube-data/videos.json"
REPORT = "/tmp/similar-report.txt"

CAP_STRONG = 250   # >=5 playlist videos
CAP_MID = 100      # 3-4 playlist videos
CAP_LIGHT = 40     # 2 playlist videos


def run(args, timeout=120):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout)


def cap_for(n):
    return CAP_STRONG if n >= 5 else (CAP_MID if n >= 3 else CAP_LIGHT)


def harvest(cid, name, affinity):
    out = os.path.join(CACHE_DIR, f"{cid}.json")
    if os.path.exists(out):
        with open(out) as f:
            return cid, json.load(f), "cached"
    try:
        p = run(["yt-dlp", "--flat-playlist", "-J", "--no-warnings",
                 "--playlist-end", str(cap_for(affinity)),
                 "--extractor-args", "youtubetab:approximate_date",
                 f"https://www.youtube.com/channel/{cid}/videos"])
        if p.returncode != 0:
            err = (p.stderr or "").strip().splitlines()
            res = {"name": name, "error": err[-1][:160] if err else "rc!=0"}
            json.dump(res, open(out, "w"))
            return cid, res, "fail"
        data = json.loads(p.stdout)
        vids = []
        for e in (data.get("entries") or []):
            if not e or not e.get("id"):
                continue
            row = {"id": e["id"],
                   "t": (e.get("title") or "").strip()[:150],
                   "d": int(e.get("duration") or 0),
                   "v": int(e.get("view_count") or 0)}
            if e.get("timestamp"):
                row["ts"] = int(e["timestamp"])
            vids.append(row)
        res = {"name": (data.get("uploader") or data.get("channel") or name or cid).strip()[:80],
               "videos": vids}
        json.dump(res, open(out, "w"))
        return cid, res, f"ok {len(vids)}"
    except Exception as ex:
        res = {"name": name, "error": f"{type(ex).__name__}"}
        try:
            json.dump(res, open(out, "w"))
        except Exception:
            pass
        return cid, res, f"error {type(ex).__name__}"


def main():
    os.makedirs(CACHE_DIR, exist_ok=True)

    # 1. Playlist uploader groups
    flat = json.load(open(FLAT_CACHE))
    ents = [e for e in (flat.get("entries") or []) if e and e.get("id")]
    groups = {}
    for e in ents:
        cid = e.get("channel_id")
        if not cid:
            continue
        g = groups.setdefault(cid, {"n": 0, "name": ""})
        g["n"] += 1
        if not g["name"]:
            g["name"] = (e.get("uploader") or e.get("channel") or "").strip()[:80]

    # 2. Current dataset
    base = json.load(open(APP_JSON))
    have_cids = {c.get("cid") for c in base["channels"]}
    seen_ids = {v["id"] for v in base["videos"]}

    targets = [(cid, g["name"], g["n"]) for cid, g in groups.items()
               if g["n"] >= 2 and cid not in have_cids]
    targets.sort(key=lambda x: (-x[2], x[1].lower()))
    print(f"targets: {len(targets)} new channels "
          f"(skipping {sum(1 for c in groups if c in have_cids)} already in dataset)", flush=True)

    # 3. Harvest (resumable)
    results = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        futs = {pool.submit(harvest, cid, name, aff): cid
                for cid, name, aff in targets}
        done = 0
        for f in as_completed(futs):
            cid, res, status = f.result()
            results[cid] = res
            done += 1
            if status != "cached":
                if done % 10 == 0 or status != "ok":
                    print(f"  {done}/{len(targets)}  {status}  {res.get('name', '')[:50]}", flush=True)

    ok = [r for r in results.values() if "videos" in r and r["videos"]]
    fails = [r for r in results.values() if "error" in r]
    print(f"harvest done: {len(ok)} ok, {len(fails)} failed", flush=True)

    # 4. Merge — strongest-affinity channels first, newest-first per channel
    new_chans = []
    for cid, name, aff in targets:
        res = results.get(cid)
        if not res or "videos" not in res:
            continue
        rows = []
        for v in res["videos"]:
            if v["id"] in seen_ids:
                continue
            seen_ids.add(v["id"])
            row = {"id": v["id"], "t": v["t"], "d": v["d"], "v": v["v"]}
            if v.get("ts"):
                row["ts"] = v["ts"]
            rows.append(row)
        if not rows:
            continue
        rows.sort(key=lambda r: r.get("ts", 0), reverse=True)
        new_chans.append({"n": res["name"] or name, "tier": "R", "cid": cid,
                          "count": len(rows), "rows": rows,
                          "aff": aff})

    start_idx = len(base["channels"])
    for i, ch in enumerate(new_chans):
        base["channels"].append({"n": ch["n"], "tier": ch["tier"], "cid": ch["cid"],
                                 "count": ch["count"]})
        idx = start_idx + i
        for r in ch["rows"]:
            r["c"] = idx
        base["videos"].extend(ch["rows"])

    out = json.dumps(base, separators=(",", ":"))
    for path in (APP_JSON, WORK_JSON, KIT_JSON):
        with open(path, "w") as f:
            f.write(out)

    dated = sum(1 for v in base["videos"] if v.get("ts"))
    print(f"dataset now: {len(base['channels'])} channels, {len(base['videos'])} videos, "
          f"{dated} dated ({dated * 100 // len(base['videos'])}%)")
    print(f"added: {len(new_chans)} R-channels, "
          f"{sum(c['count'] for c in new_chans)} videos, {len(out) / 1e6:.1f} MB json")

    with open(REPORT, "w") as f:
        f.write("R-channels added (affinity = videos of theirs in your playlist)\n\n")
        for ch in new_chans:
            f.write(f"aff={ch['aff']:>3}  n={ch['count']:>3}  {ch['n']}\n")
        f.write(f"\nfailed channels ({len(fails)}):\n")
        for r in fails:
            f.write(f"  {r.get('name', '?')}: {r.get('error', '')}\n")


if __name__ == "__main__":
    sys.exit(main())
