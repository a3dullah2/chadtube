#!/usr/bin/env python3
"""Re-harvest per-channel catalogs with upload dates and merge into cache.

For every cached channel JSON in /tmp/tube-data, re-fetch the flat playlist
with youtubetab:approximate_date so each video gets an approximate `ts`
(unix seconds). Older videos get a day-granular estimate from YouTube's
"X days ago" labels — plenty accurate for a newest-first mixed feed.
Fresh fetches also pick up any uploads since the first harvest.
"""
import json, os, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor, as_completed

OUT = "/tmp/tube-data"
CAP = 250
END = "--playlist-end"

def run(args, timeout=420):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout)

def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")

def refresh(path):
    slug = os.path.basename(path)[:-5]
    try:
        with open(path) as f:
            ch = json.load(f)
    except Exception as ex:
        return slug, f"cache-read-fail {type(ex).__name__}"
    cid = ch.get("cid")
    if not cid:
        return slug, "no-cid"
    try:
        p = run(["yt-dlp", "--flat-playlist", "-J", "--no-warnings", END, str(CAP),
                 "--extractor-args", "youtubetab:approximate_date",
                 f"https://www.youtube.com/channel/{cid}/videos"])
        if p.returncode != 0:
            return slug, f"fetch-fail rc={p.returncode}"
        data = json.loads(p.stdout)
    except Exception as ex:
        return slug, f"error {type(ex).__name__}"

    fresh = []
    for e in (data.get("entries") or []):
        if not e or not e.get("id"):
            continue
        fresh.append({
            "id": e["id"],
            "t": (e.get("title") or "").strip()[:150],
            "d": int(e.get("duration") or 0),
            "v": int(e.get("view_count") or 0),
            "ts": e.get("timestamp"),
        })
    if not fresh:
        return slug, "empty-fetch"

    by_id = {v["id"]: v for v in ch.get("videos", [])}
    fresh_ids = set()
    merged = []
    for fv in fresh:
        fresh_ids.add(fv["id"])
        old = by_id.get(fv["id"])
        if old is not None:
            # keep cached title/views if fresh omits them, take fresh ts
            old["d"] = old.get("d") or fv["d"]
            old["v"] = old.get("v") or fv["v"]
            if fv.get("ts"):
                old["ts"] = fv["ts"]
            merged.append(old)
        else:
            merged.append(fv)

    n_ts = sum(1 for v in merged if v.get("ts"))
    ch["videos"] = merged[:CAP]
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(ch, f)
    os.replace(tmp, path)
    return slug, f"ok {len(merged)} vids, {n_ts} dated"

def main():
    paths = [os.path.join(OUT, f) for f in sorted(os.listdir(OUT))
             if f.endswith(".json") and f != "videos.json"]
    print(f"refreshing {len(paths)} channels …", flush=True)
    fails = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        futs = {pool.submit(refresh, p): p for p in paths}
        done = 0
        for f in as_completed(futs):
            slug, status = f.result()
            done += 1
            if not status.startswith("ok"):
                fails.append((slug, status))
            if done % 10 == 0 or not status.startswith("ok"):
                print(f"[{done}/{len(paths)}] {slug}: {status}", flush=True)
    print(f"\nDONE fails={len(fails)}")
    for slug, status in fails:
        print("  FAIL", slug, status)

if __name__ == "__main__":
    main()
