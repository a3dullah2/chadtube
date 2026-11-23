#!/usr/bin/env python3
"""Harvest video catalogs for a curated channel list via yt-dlp flat playlists."""
import json, os, re, subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed

OUT = "/tmp/tube-data"
os.makedirs(OUT, exist_ok=True)
CAP = 250  # max videos per channel

# (name, tier) — curated from Tristan Hume's 2026 YouTube tier list
CHANNELS = [
    ("Applied Science", "S"), ("Clickspring", "S"), ("Stuff Made Here", "S"),
    ("Captain Disillusion", "S"), ("Kiwami Japan", "S"),
    ("Steve Mould", "A"), ("Primitive Technology", "A"), ("Breaking Taps", "A"),
    ("NileRed", "A"), ("Huygens Optics", "A"), ("AlphaPhoenix", "A"),
    ("NightHawkInLight", "A"), ("Animagraffs", "A"), ("suckerpinch", "A"),
    ("Dan Gelbart", "A"), ("Know Art", "A"), ("Works By Design", "A"),
    ("Joshua Bird", "A"), ("S3 Science Startups Stories", "A"),
    ("Practical Engineering", "B"), ("Real Engineering", "B"), ("Historia Civilis", "B"),
    ("BPS.space", "B"), ("The Thought Emporium", "B"), ("TierZoo", "B"),
    ("Excessive Overkill", "B"), ("Tech Ingredients", "B"), ("USCSB", "B"),
    ("Tom Stanton", "B"), ("Sam Zeloof", "B"), ("Demoscene High Quality Videos", "B"),
    ("Engineering Explained", "C"), ("SuperfastMatt", "C"), ("The Operations Room", "C"),
    ("Tom Scott", "C"), ("Hyperspace Pirate", "C"), ("Map Men", "C"),
    ("GeoWizard", "C"), ("The Action Lab", "C"), ("Technology Connections", "C"),
    ("This Old Tony", "C"), ("3Blue1Brown", "C"), ("CSI Starbase", "C"),
    ("AngeTheGreat", "C"), ("Fireball Tool", "C"), ("CNLohr", "C"),
    ("2swap", "C"), ("Chronova Engineering", "C"),
    ("Veritasium", "D"), ("Mark Rober", "D"), ("Scott Manley", "D"),
    ("Asianometry", "D"), ("ilmango", "D"), ("DoshDoshington", "D"),
    ("Munro Live", "D"), ("Edison Motors", "D"),
]

def norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())

def run(args, timeout=300):
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
    exact, partial = None, None
    for e in entries:
        cid = e.get("channel_id")
        if not cid:
            continue
        ch = norm(e.get("channel") or e.get("uploader"))
        if ch == n:
            exact = cid
            break
        if not partial and (n in ch or ch in n) and len(ch) > 2:
            partial = cid
    return exact or partial or (entries and entries[0].get("channel_id")) or None

def harvest(name, tier):
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    out = f"{OUT}/{slug}.json"
    if os.path.exists(out):
        return name, "cached"
    try:
        cid = resolve_channel(name)
        if not cid:
            return name, "resolve-failed"
        p = run(["yt-dlp", "--flat-playlist", "-J", "--no-warnings",
                 "--playlist-end", str(CAP),
                 f"https://www.youtube.com/channel/{cid}/videos"])
        data = json.loads(p.stdout)
        vids = []
        for e in (data.get("entries") or []):
            if not e or not e.get("id"):
                continue
            vids.append({
                "id": e["id"],
                "t": (e.get("title") or "").strip()[:150],
                "d": int(e.get("duration") or 0),
                "v": int(e.get("view_count") or 0),
            })
        if not vids:
            return name, "empty"
        with open(out, "w") as f:
            json.dump({"name": name, "tier": tier, "cid": cid, "videos": vids}, f)
        return name, f"ok {len(vids)}"
    except Exception as ex:
        return name, f"error {type(ex).__name__}"

def main():
    results = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        futs = {pool.submit(harvest, n, t): n for n, t in CHANNELS}
        for f in as_completed(futs):
            name, status = f.result()
            print(f"{status:>18}  {name}", flush=True)
            results.append((name, status))

    # merge into final compact dataset
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
    print(f"\nDONE channels={len(channels)} videos={len(videos)}")

if __name__ == "__main__":
    main()
