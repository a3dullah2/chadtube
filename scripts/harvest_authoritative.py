#!/usr/bin/env python3
"""Harvest/verify channels using authoritative ids from Tristan's blog post.

For each entry: harvest if missing, re-harvest if the resolved cid differs,
and always align stored name/tier with the post. Existing files whose cid is
not listed here (the extra D-tier channels) are kept untouched.
"""
import json, os, re
from harvest_channels import run, OUT

def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")

AUTH = [
    # S
    ("Applied Science", "S", "UCivA7_KLKWo43tFcCkFvydw"),
    ("Clickspring", "S", "UCworsKCR-Sx6R6-BnIjS2MA"),
    ("Stuff Made Here", "S", "UCj1VqrHhDte54oLgPG4xpuQ"),
    ("Captain Disillusion", "S", "UCEOXxzW2vU0P-0THehuIIeg"),
    ("Kiwami Japan", "S", "UCg3qsVzHeUt5_cPpcRtoaJQ"),
    # A
    ("Steve Mould", "A", "UCEIwxahdLz7bap-VDs9h35A"),
    ("S3 | Science, Startups, & Stories", "A", "UC0-7PyfpOIJpNyi8WrHiyXA"),
    ("Primitive Technology", "A", "UCAL3JXZSzSm8AlZyD3nQdBA"),
    ("Know Art", "A", "UCQnMw9GGDS3xO6fN5oae-4w"),
    ("Breaking Taps", "A", "UC06HVrkOL33D5lLnCPjr6NQ"),
    ("NileRed", "A", "UCFhXFikryT4aFcLkLw2LBLA"),
    ("Huygens Optics", "A", "UC26YLK0OEbLB3TCYxGh8xVQ"),
    ("AlphaPhoenix", "A", "UCCWeRTgd79JL0ilH0ZywSJA"),
    ("NightHawkInLight", "A", "UCFtc3XdXgLFwhlDajMGK69w"),
    ("Animagraffs", "A", "UCnZeeKO8qVdtkrA4-uKhtTw"),
    ("Works By Design", "A", "UC0G7e3uCtTyKQy2vZbRaKxg"),
    ("suckerpinch", "A", "UC3azLjQuz9s5qk76KEXaTvA"),
    ("Joshua Bird", "A", "UCDyZXmOevDAb6DHyUCwzVNg"),
    ("Dan Gelbart", "A", "UCYA1VjSKXgNVh03wjw_HSRA"),
    # B
    ("Practical Engineering", "B", "UCMOqf8ab-42UUQIdVoKwjlQ"),
    ("Real Engineering", "B", "UCR1IuLEqb6UEA_zQ81kwXfg"),
    ("Historia Civilis", "B", "UCv_vLHiWVBh_FR9vbeuiY-A"),
    ("BPS.space", "B", "UCILl8ozWuxnFYXIe2svjHhg"),
    ("The Thought Emporium", "B", "UCV5vCi3jPJdURZwAOO_FNfQ"),
    ("TierZoo", "B", "UCHsRtomD4twRf5WVHHk-cMw"),
    ("Excessive Overkill", "B", "UCwbyKKmjVdCpWzZZY-WnajA"),
    ("Tech Ingredients", "B", "UCVSHXNNBitaPd5lYz48--yg"),
    ("USCSB", "B", "UCXIkr0SRTnZO4_QpZozvCCA"),
    ("Tom Stanton", "B", "UC67gfx2Fg7K2NSHqoENVgwA"),
    ("Sam Zeloof", "B", "UC7E8-0Ou69hwScPW1_fQApA"),
    ("Demoscene High-Quality Videos", "B", "UC96JVq-z0-0iHAkIkKp1_6w"),
    # C
    ("Engineering Explained", "C", "UClqhvGmHcvWL9w3R48t9QXQ"),
    ("SuperfastMatt", "C", "UCU5adS8d-YX7GbJcnH0x6uA"),
    ("The Operations Room", "C", "UCnZJt7yQw5IztVwe-Dscd-Q"),
    ("Tom Scott", "C", "UCBa659QWEk1AI4Tg--mrJ2A"),
    ("Hyperspace Pirate", "C", "UC8i-4EpLBXMzekETNXwcZjA"),
    ("Munro Live", "C", "UCj--iMtToRO_cGG_fpmP5XQ"),
    ("BuildWitt", "C", "UCKqKiBDpq9j29bXbBx0cfOw"),
    ("cubicmetre", "C", "UCsrxrOtjmWnH5FJhJnkTRBg"),
    ("Map Men", "C", "UCbbQalJ4OaC0oQ0AqRaOJ9g"),
    ("Hacksmith Industries", "C", "UCjgpFI5dU-D1-kh9H1muoxQ"),
    ("The Action Lab", "C", "UC1VLQPn9cYSqx8plbk9RxxQ"),
    ("Technology Connections", "C", "UCy0tKL1T7wFoYcxCe0xjN6Q"),
    ("GeoWizard", "C", "UCW5OrUZ4SeUYkUg1XqcjFYA"),
    ("The Intel Report", "C", "UC7Ay_bxnYWSS9ZDPpqAE1RQ"),
    ("Not An Engineer", "C", "UCXh9mHdcBD-3aGCiECZMP1Q"),
    ("CSI Starbase", "C", "UCy6Q9UCG7Wa-N7nht2BFrHA"),
    ("AngeTheGreat", "C", "UCV0t1y4h_6-2SqEpXBXgwFQ"),
    ("3Blue1Brown", "C", "UCYO_jab_esuFRV4b17AJtAw"),
    ("Chronova Engineering", "C", "UC6DhSUKasPbBLCSdPcGBxww"),
    ("Prop Department", "C", "UCU0wOR4RQA9L7ZBOeyQI20A"),
    ("Joel Creates", "C", "UCHk0IYEDJxQGQ-nbd3yP_KA"),
    ("Contraption Collection", "C", "UC66lPJ8u2N1i2Bh_TMaWagg"),
    ("Fireball Tool", "C", "UCVveEFTOd6khhSXXnRhxJmg"),
    ("Lafayette Systems", "C", "UCDllNYyUN4fK1r-Nwffp7og"),
    ("Tucker Gott", "C", "UCASjdyu0y8XQ9qJnqxsKHnQ"),
    ("This Old Tony", "C", "UC5NO8MgTQKHAWXp6z8Xl7yQ"),
    ("Deconstructed", "C", "UCje6-Yak9u1msy5l7sE9pBA"),
    ("Current Concept", "C", "UCW5i5rLbDiu9RhCEXj4BAZw"),
    ("2swap", "C", "UCiNLr9wX35KksK77mrQgxiw"),
]

def harvest_one(name, tier, cid):
    slug = slugify(name)
    p = run(["yt-dlp", "--flat-playlist", "-J", "--no-warnings",
             "--playlist-end", "250",
             f"https://www.youtube.com/channel/{cid}/videos"])
    try:
        data = json.loads(p.stdout)
    except Exception:
        print("parse fail", name)
        return False
    vids = []
    for e in (data.get("entries") or []):
        if not e or not e.get("id"):
            continue
        vids.append({"id": e["id"], "t": (e.get("title") or "").strip()[:150],
                     "d": int(e.get("duration") or 0),
                     "v": int(e.get("view_count") or 0)})
    if not vids:
        print("empty", name)
        return False
    with open(f"{OUT}/{slug}.json", "w") as f:
        json.dump({"name": name, "tier": tier, "cid": cid, "videos": vids}, f)
    print("ok", name, len(vids))
    return True

for name, tier, cid in AUTH:
    slug = slugify(name)
    path = f"{OUT}/{slug}.json"
    if not os.path.exists(path):
        print("harvesting", name, "…")
        harvest_one(name, tier, cid)
        continue
    with open(path) as f:
        ch = json.load(f)
    if ch.get("cid") != cid:
        print("cid mismatch -> re-harvest", name, ch.get("cid"), "!=", cid)
        harvest_one(name, tier, cid)
    elif ch.get("name") != name or ch.get("tier") != tier:
        ch["name"], ch["tier"] = name, tier
        with open(path, "w") as f:
            json.dump(ch, f)
        print("aligned meta", name)
    else:
        print("ok", name)
