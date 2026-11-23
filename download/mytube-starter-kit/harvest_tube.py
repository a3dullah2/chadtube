#!/usr/bin/env python3
"""Harvest video catalogs for your curated channel list into videos.json.

Zero API keys needed — uses yt-dlp flat playlists with approximate upload
dates (day-granular for older uploads, exact for recent ones).

Setup:
    pip install yt-dlp          (or: brew install yt-dlp)

Usage:
    1. Edit CHANNELS below — (name, tier, channel_id_or_None).
       Channel ids are optional; if omitted the script resolves them by
       YouTube search. Find an id from any video's page or
       https://www.youtube.com/channel/UC...
    2. python3 harvest_tube.py
    3. Copy videos.json next to index.html and refresh.

Output format (videos.json):
{
  "channels": [ {"n": "Applied Science", "tier": "S", "cid": "UC...", "count": 250}, ... ],
  "videos":   [ {"id": "VIDEO_ID", "t": "title", "d": seconds, "v": views,
                 "c": <channel index>, "ts": <unix upload seconds>}, ... ]
}
"""
import json, os, re, subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed

OUT = os.path.dirname(os.path.abspath(__file__))
CAP = 250  # max videos kept per channel

# (name, tier, channel_id) — channel_id=None → resolve via YouTube search.
# Swap in your own channels; the tier is your personal 1-letter rating.
CHANNELS = [
    ("Applied Science", "S", "UCivA7_KLKWo43tFcCkFvydw"),
    ("Clickspring", "S", "UCworsKCR-Sx6R6-BnIjS2MA"),
    ("Stuff Made Here", "S", "UCj1VqrHhDte54oLgPG4xpuQ"),
    ("Captain Disillusion", "S", "UCEOXxzW2vU0P-0THehuIIeg"),
    ("Kiwami Japan", "S", "UCg3qsVzHeUt5_cPpcRtoaJQ"),
    ("Steve Mould", "A", "UCEIwxahdLz7bap-VDs9h35A"),
    ("Primitive Technology", "A", "UCAL3JXZSzSm8AlZyD3nQdBA"),
    ("Breaking Taps", "A", "UC06HVrkOL33D5lLnCPjr6NQ"),
    ("NileRed", "A", "UCFhXFikryT4aFcLkLw2LBLA"),
    ("Huygens Optics", "A", "UC26YLK0OEbLB3TCYxGh8xVQ"),
    ("AlphaPhoenix", "A", "UCCWeRTgd79JL0ilH0ZywSJA"),
    ("NightHawkInLight", "A", "UCFtc3XdXgLFwhlDajMGK69w"),
    ("Animagraffs", "A", "UCnZeeKO8qVdtkrA4-uKhtTw"),
    ("suckerpinch", "A", "UC3azLjQuz9s5qk76KEXaTvA"),
    ("Dan Gelbart", "A", "UCYA1VjSKXgNVh03wjw_HSRA"),
    ("Know Art", "A", "UCQnMw9GGDS3xO6fN5oae-4w"),
    ("Joshua Bird", "A", "UCDyZXmOevDAb6DHyUCwzVNg"),
    ("Practical Engineering", "B", "UCMOqf8ab-42UUQIdVoKwjlQ"),
    ("Real Engineering", "B", "UCR1IuLEqb6UEA_zQ81kwXfg"),
    ("Historia Civilis", "B", "UCv_vLHiWVBh_FR9vbeuiY-A"),
    ("BPS.space", "B", "UCILl8ozWuxnFYXIe2svjHhg"),
    ("The Thought Emporium", "B", "UCV5vCi3jPJdURZwAOO_FNfQ"),
    ("TierZoo", "B", "UCHsRtomD4twRf5WVHHk-cMw"),
    ("Tech Ingredients", "B", "UCVSHXNNBitaPd5lYz48--yg"),
    ("USCSB", "B", "UCXIkr0SRTnZO4_QpZozvCCA"),
    ("Tom Stanton", "B", "UC67gfx2Fg7K2NSHqoENVgwA"),
    ("Engineering Explained", "C", "UClqhvGmHcvWL9w3R48t9QXQ"),
    ("SuperfastMatt", "C", "UCU5adS8d-YX7GbJcnH0x6uA"),
    ("Tom Scott", "C", "UCBa659QWEk1AI4Tg--mrJ2A"),
    ("Hyperspace Pirate", "C", "UC8i-4EpLBXMzekETNXwcZjA"),
    ("Map Men", "C", "UCbbQalJ4OaC0oQ0AqRaOJ9g"),
    ("GeoWizard", "C", "UCW5OrUZ4SeUYkUg1XqcjFYA"),
    ("The Action Lab", "C", "UC1VLQPn9cYSqx8plbk9RxxQ"),
    ("Technology Connections", "C", "UCy0tKL1T7wFoYcxCe0xjN6Q"),
    ("This Old Tony", "C", "UC5NO8MgTQKHAWXp6z8Xl7yQ"),
    ("3Blue1Brown", "C", "UCYO_jab_esuFRV4b17AJtAw"),
    ("AngeTheGreat", "C", "UCV0t1y4h_6-2SqEpXBXgwFQ"),
    ("Fireball Tool", "C", "UCVveEFTOd6khhSXXnRhxJmg"),
    ("Veritasium", "D", "UCHnyfMqiRRG1u-2MsSQLbXA"),
    ("Mark Rober", "D", "UCY1kMZp36IQSyNx_9h4mpCg"),
    ("Scott Manley", "D", "UCxzC4EngIsMrPmbm6Nxvy-A"),
    ("Asianometry", "D", "UC1LpsuAUaKoMzzJSEt5WImw"),
]


def norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def run(args, timeout=420):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout)


def resolve_channel(name):
    """Resolve a channel name to a channel id via YouTube search."""
    try:
        p = run(["yt-dlp", "--flat-playlist", "-J", "--no-warnings", f"ytsearch6:{name}"])
        if p.returncode != 0:
            return None
        data = json.loads(p.stdout)
    except Exception:
        return None
    entries = [e for e in (data.get("entries") or []) if e]
    n = norm(name)
    for e in entries:
        cid = e.get("channel_id")
        if cid and norm(e.get("channel") or e.get("uploader")) == n:
            return cid
    for e in entries:
        cid = e.get("channel_id")
        ch = norm(e.get("channel") or e.get("uploader"))
        if cid and ch and (n in ch or ch in n):
            return cid
    return entries and entries[0].get("channel_id") or None


def harvest(name, tier, cid):
    if not cid:
        cid = resolve_channel(name)
        if not cid:
            return name, None, "resolve-failed"
    try:
        p = run(["yt-dlp", "--flat-playlist", "-J", "--no-warnings",
                 "--playlist-end", str(CAP),
                 "--extractor-args", "youtubetab:approximate_date",
                 f"https://www.youtube.com/channel/{cid}/videos"])
        if p.returncode != 0:
            return name, None, f"fetch-failed rc={p.returncode}"
        data = json.loads(p.stdout)
    except Exception as ex:
        return name, None, f"error {type(ex).__name__}"
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
    if not vids:
        return name, None, "empty"
    return name, {"name": name, "tier": tier, "cid": cid, "videos": vids}, f"ok {len(vids)}"


def main():
    chans, fails = [], []
    with ThreadPoolExecutor(max_workers=6) as pool:
        futs = {pool.submit(harvest, n, t, c): n for n, t, c in CHANNELS}
        for f in as_completed(futs):
            name, payload, status = f.result()
            print(f"{status:>16}  {name}", flush=True)
            if payload:
                chans.append(payload)
            else:
                fails.append(name)

    # merge: channels sorted by tier then name; per-channel videos newest-first
    order = {"S": 0, "A": 1, "B": 2, "C": 3, "D": 4}
    chans.sort(key=lambda c: (order.get(c["tier"], 9), c["name"].lower()))
    channels, videos, seen = [], [], set()
    for ch in chans:
        idx = len(channels)
        channels.append({"n": ch["name"], "tier": ch["tier"], "cid": ch["cid"],
                         "count": len(ch["videos"])})
        for v in sorted(ch["videos"], key=lambda x: x.get("ts", 0), reverse=True):
            if v["id"] in seen:
                continue
            seen.add(v["id"])
            videos.append({"id": v["id"], "t": v["t"], "d": v["d"], "v": v["v"], "c": idx,
                           **({"ts": v["ts"]} if v.get("ts") else {})})
    out = os.path.join(OUT, "videos.json")
    with open(out, "w") as f:
        json.dump({"channels": channels, "videos": videos}, f, separators=(",", ":"))
    dated = sum(1 for v in videos if v.get("ts"))
    print(f"\nDONE channels={len(channels)} videos={len(videos)} dated={dated}")
    if fails:
        print("failed:", ", ".join(fails))
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
