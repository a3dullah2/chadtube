#!/usr/bin/env python3
"""Incorporate a user playlist into the MyTube dataset.

The playlist becomes a first-class pseudo-channel (tier "★") so it shows up
in the mixed feed, the sidebar and the tier filter chips. Every video keeps
its real uploader (`up` field) for display.

Flat playlist entries have no upload dates, and per-video watch-page
extraction is bot-blocked from this IP — so dates are recovered by fetching
each uploader channel's /videos tab (browse API, works) with
youtubetab:approximate_date and matching video ids. Playlist videos not
found in their uploader's last 250 uploads stay undated (they sink to the
end of the newest-first feed but keep playlist order inside the ★ filter).

Resumable: per-uploader results are cached in /tmp/niche-dates/.
"""
import json, os, subprocess, sys
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed

PLAYLIST_URL = "https://www.youtube.com/playlist?list=PLLjfE5_7H6o0"
FLAT_CACHE = "/tmp/niche-flat.json"
DATE_DIR = "/tmp/niche-dates"
CAP = 250
APP_JSON = "/home/z/my-project/src/data/videos.json"

os.makedirs(DATE_DIR, exist_ok=True)


def run(args, timeout=420):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout)


def load_flat():
    if os.path.exists(FLAT_CACHE):
        return json.load(open(FLAT_CACHE))
    p = run(["yt-dlp", "--flat-playlist", "-J", "--no-warnings", PLAYLIST_URL])
    data = json.loads(p.stdout)
    json.dump(data, open(FLAT_CACHE, "w"))
    return data


def rss_dates(playlist_id):
    """Playlist RSS: exact upload dates for the ~15 most recently added."""
    try:
        p = run(["curl", "-s", "--max-time", "30",
                 f"https://www.youtube.com/feeds/videos.xml?playlist_id={playlist_id}"])
        root = ET.fromstring(p.stdout)
        ns = {"a": "http://www.w3.org/2005/Atom"}
        out = {}
        for entry in root.findall("a:entry", ns):
            vid = entry.find("yt:videoId")
            pub = entry.find("a:published")
            if vid is not None and pub is not None and pub.text:
                import datetime
                dt = datetime.datetime.fromisoformat(pub.text.strip().replace("Z", "+00:00"))
                out[vid.text] = int(dt.timestamp())
        return out
    except Exception:
        return {}


def uploader_dates(cid):
    """Flat-fetch one uploader's /videos tab → {video_id: ts}."""
    cache = os.path.join(DATE_DIR, f"{cid}.json")
    if os.path.exists(cache):
        return json.load(open(cache))
    try:
        p = run(["yt-dlp", "--flat-playlist", "-J", "--no-warnings",
                 "--playlist-end", str(CAP),
                 "--extractor-args", "youtubetab:approximate_date",
                 f"https://www.youtube.com/channel/{cid}/videos"])
        if p.returncode != 0:
            json.dump({}, open(cache, "w"))
            return {}
        data = json.loads(p.stdout)
        m = {e["id"]: int(e["timestamp"]) for e in (data.get("entries") or [])
             if e and e.get("id") and e.get("timestamp")}
        json.dump(m, open(cache, "w"))
        return m
    except Exception:
        return {}


def main():
    pl = load_flat()
    entries = [e for e in (pl.get("entries") or []) if e and e.get("id")
               and not (e.get("title") or "").startswith(("[Private", "[Deleted", "[Unavailable"))]
    print(f"playlist “{pl.get('title')}”: {len(entries)} videos")

    cids = sorted({e["channel_id"] for e in entries if e.get("channel_id")})
    print(f"distinct uploaders to fetch for dates: {len(cids)}", flush=True)
    id2ts = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        futs = {pool.submit(uploader_dates, c): c for c in cids}
        done = 0
        for f in as_completed(futs):
            done += 1
            id2ts.update(f.result())
            if done % 100 == 0:
                print(f"  {done}/{len(cids)} uploaders, {len(id2ts)} dated so far", flush=True)

    sup = rss_dates("PLLjfE5_7H6o0")
    for k, v in sup.items():
        id2ts.setdefault(k, v)
    print(f"date map built: {len(id2ts)} ids (+{len(sup)} from playlist RSS)")

    base = json.load(open(APP_JSON))
    if any(c.get("cid") == "PLLjfE5_7H6o0" for c in base["channels"]):
        # re-run: drop the previous playlist block first
        keep = [c for c in base["channels"] if c.get("cid") != "PLLjfE5_7H6o0"]
        pl_idx = len(keep)
        base["channels"] = keep
        base["videos"] = [v for v in base["videos"] if v["c"] != pl_idx]
    pl_idx = len(base["channels"])
    base["channels"].append({"n": "niche", "tier": "★", "cid": "PLLjfE5_7H6o0",
                             "count": len(entries)})

    added, dated = 0, 0
    for e in entries:
        row = {"id": e["id"],
               "t": (e.get("title") or "").strip()[:150],
               "d": int(e.get("duration") or 0),
               "v": int(e.get("view_count") or 0),
               "c": pl_idx,
               "up": (e.get("uploader") or e.get("channel") or "Unknown").strip()[:80]}
        ts = id2ts.get(e["id"])
        if ts:
            row["ts"] = ts
            dated += 1
        base["videos"].append(row)
        added += 1

    out = json.dumps(base, separators=(",", ":"))
    for path in (APP_JSON, "/tmp/tube-data/videos.json"):
        with open(path, "w") as f:
            f.write(out)
    print(f"playlist videos added: {added}, with dates: {dated} ({dated/added*100:.0f}%)")
    print(f"dataset now: {len(base['channels'])} channels, {len(base['videos'])} videos")


if __name__ == "__main__":
    main()
