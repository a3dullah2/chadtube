#!/usr/bin/env python3
"""Mark Pakistani channels/videos with a `pk` flag in videos.json.

Curated from the actual dataset (333 channels reviewed by name + title
sampling). Three layers:
  1. channels[].pk = 1          -> whole channel hidden (S/A/B/C/D/R tiers)
  2. rows with a Pakistani `up` -> ★ playlist rows keep their real uploader
  3. title-pattern rows         -> reposts/clips of Pakistani media under
                                   other uploader names (e.g. Ghamidi clips)

The app filter then simply drops rows where `channels[v.c].pk || v.pk`.
Idempotent: safe to re-run. Writes src/data + kit copies, then regzips.
"""
import json
import os
import re
import shutil
import subprocess

ROOT = "/home/z/my-project"
SRC = f"{ROOT}/src/data/videos.json"
KIT = f"{ROOT}/download/chadtube-starter-kit/videos.json"

# Pakistani media + the Ghamidi / Al-Mawrid Urdu ecosystem (by exact name).
PK_CHANNELS = {
    "Ghamidi Center Of Islamic Learning",
    "Al-Mawrid Official",
    "Abu Hussain",
    "Inzaar",
    "Tawheed Tv",
    "Dr Khalid Zaheer",
    "Dunya News",
    "Javed Ahmad Ghamidi Official",
    "Al Mawrid Hind",
    "Shams Suleiman",
    "دبستانِ فراہی - FARAHI (SOT)",
    "Bilal Ahmed Khan Niazai",
    "Gamdi Sb",
    "Taimur_Laal",
    "Ghamidi REELS",
    "Islamic PurPose",
    "Muslim Today - Official Channel",
    "Universal Islam: Khalid Zaheer",
    "Desi Mulhid",
    "Ghamidi Speaks",
    "Kun Foods",
    "Masood Ahsan",
    "Path to Purpose",
    "JustSubmit",
    "Abbas Haidar",
}

# Uploaders that only appear inside the ★ playlist rows (no channel entry).
PK_UPLOADERS = {
    "Ghamidi discourse",
    "Pakistan&Counting",
    "Al-Mawrid Society",
    "URDU GLOBE TV",
    "Javed Ahmad Ghamidi _ PK",
    "DW Urdu اردو",
    "Islam Channel Urdu",
    "SAMAA TV",
    "Geo News",
    "Al-Mawrid Australia",
    "The Pakistani Homeschooler",
    "Digital Pakistan",
}

# Repost/clip titles carrying Pakistani media names under other uploaders.
TITLE_PAT = re.compile(
    r"dunya news|samaa|geo news|ary news|hum news|bol news|92 news|aaj news"
    r"|public news|ghamidi|al-mawrid|al mawrid|inzaar|khalid zaheer|tawheed tv"
    r"|urdu point|arab news",
    re.I,
)

d = json.load(open(SRC, encoding="utf-8"))

n_chan = 0
for c in d["channels"]:
    if c["n"] in PK_CHANNELS:
        c["pk"] = 1
        n_chan += 1

n_up = n_title = 0
by_tier = {}
for v in d["videos"]:
    ch = d["channels"][v["c"]]
    up = v.get("up") or ch["n"]
    marked = bool(ch.get("pk")) or up in PK_UPLOADERS
    if marked:
        if v.get("up") in PK_UPLOADERS and not ch.get("pk"):
            v["pk"] = 1
            n_up += 1
        by_tier[ch["tier"]] = by_tier.get(ch["tier"], 0) + 1
    elif TITLE_PAT.search(v["t"]):
        v["pk"] = 1
        n_title += 1
        by_tier[ch["tier"]] = by_tier.get(ch["tier"], 0) + 1

# count hidden rows per tier accurately (channel pk + row pk)
hidden = {}
for v in d["videos"]:
    if d["channels"][v["c"]].get("pk") or v.get("pk"):
        hidden[d["channels"][v["c"]]["tier"]] = hidden.get(d["channels"][v["c"]]["tier"], 0) + 1

tmp = SRC + ".tmp"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
os.replace(tmp, SRC)
shutil.copyfile(SRC, KIT)
subprocess.run(["bash", f"{ROOT}/scripts/compress_data.sh"], check=True)

total = sum(hidden.values())
print(f"channels marked: {n_chan}")
print(f"rows marked by uploader flag: {n_up}, by title pattern: {n_title}")
print(f"hidden rows by tier: {hidden}  total: {total} / {len(d['videos'])}")
print(f"raw size now: {os.path.getsize(SRC):,} bytes")
