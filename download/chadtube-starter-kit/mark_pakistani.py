#!/usr/bin/env python3
"""Flag Pakistani channels/videos in THIS folder's videos.json (kit version).

Same curation as the project version — writes `"pk": 1` on:
  1. channels           -> whole channel (Dunya News, Ghamidi/Al-Mawrid, ...)
  2. ★ rows             -> matched by real uploader name
  3. any row            -> title matched as a repost of Pakistani media

Run after re-harvesting with harvest_tube.py, then just refresh the browser.
Idempotent: safe to re-run.
"""
import json
import os
import re

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "videos.json")

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

TITLE_PAT = re.compile(
    r"dunya news|samaa|geo news|ary news|hum news|bol news|92 news|aaj news"
    r"|public news|ghamidi|al-mawrid|al mawrid|inzaar|khalid zaheer|tawheed tv"
    r"|urdu point|arab news",
    re.I,
)

d = json.load(open(SRC, encoding="utf-8"))

n_chan = sum(1 for c in d["channels"] if c["n"] in PK_CHANNELS or c.get("pk"))
for c in d["channels"]:
    if c["n"] in PK_CHANNELS:
        c["pk"] = 1

n_up = n_title = 0
for v in d["videos"]:
    ch = d["channels"][v["c"]]
    up = v.get("up") or ch["n"]
    if ch.get("pk") or up in PK_UPLOADERS:
        if v.get("up") in PK_UPLOADERS and not ch.get("pk"):
            v["pk"] = 1
            n_up += 1
    elif TITLE_PAT.search(v["t"]):
        v["pk"] = 1
        n_title += 1

hidden = sum(1 for v in d["videos"] if d["channels"][v["c"]].get("pk") or v.get("pk"))

tmp = SRC + ".tmp"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
os.replace(tmp, SRC)

print(f"channels marked: {n_chan}, rows by uploader: {n_up}, by title: {n_title}")
print(f"hidden while Pakistani mode is on: {hidden} / {len(d['videos'])}")
