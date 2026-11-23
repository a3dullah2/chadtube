# ChadTube — your personal YouTube

A TristanTube-style personal video site: a **mixed, newest-first feed across all
your favorite channels** — like the YouTube subscriptions feed, minus the
algorithm. Videos are never hosted or re-uploaded; everything plays via
official YouTube embeds.

## What's in this folder

| File | Purpose |
| --- | --- |
| `index.html` | The whole frontend — one file, zero build step, vanilla JS |
| `videos.json` | The dataset: 333 channels (68 curated + 264 discovered from your playlist + your ★ playlist), ~31k videos with upload dates |
| `mark_pakistani.py` | Flags Pakistani news & Islamic channels (`"pk": 1` on channels/rows) for the 🇵🇰 Pakistani-mode toggle |
| `harvest_tube.py` | Re-harvest / re-curate the dataset with yt-dlp (no API key) — includes the playlist + "similar channels" discovery pipeline |

## Run it

`fetch()` can't read local files from `file://`, so serve over HTTP:

```bash
cd chadtube-starter-kit
python -m http.server 8000
# open http://localhost:8000
```

Or drop the folder on **GitHub Pages / Cloudflare Pages / Netlify** — it's
fully static.

## Features

- **Healthy mixed feed** — newest uploads round-robin across channels (one
  video per channel per pass, like a subscriptions feed), so hyperactive
  channels (news, music dumps) never cluster at the top; full catalogs stay
  one search away
- **Your playlists** — add any YouTube playlist to `PLAYLISTS` in the script;
  it becomes a gold "★" section whose videos join the mixed feed and keep
  their real uploader name (upload dates recovered from each uploader's
  channel, ~80% coverage; older deep-catalog adds sort to the end)
- **Videos like your playlist** — every creator with ≥2 videos in your
  playlists gets harvested as a violet "R" channel (catalog size scales with
  how many of their videos you saved), so the feed keeps serving your taste
  beyond the playlist itself
- Search (titles, channels, uploaders), tier chips (S–D + R + ★), sort:
  newest / most viewed / longest / shuffled
- **🇵🇰 Pakistani mode** — header toggle that hides Pakistani news & Islamic
  channels (Dunya News, the Ghamidi/Al-Mawrid circle, SAMAA/Geo reposts…)
  from feed, search and TV mode; your choice is remembered locally
- **TV mode** — fullscreen lean-back player: click-catcher over the iframe,
  auto-advance with countdown, keyboard `space / n / p / m / ←→ / esc`
- Watch view with autoplay-next and an "Up next" queue from your filters
- Watch history + dimmed thumbnails (localStorage, stays on your device)
- Dark / light theme

## Re-curate the channel list

1. Open `harvest_tube.py`, edit the `CHANNELS` list — `(name, tier, channel_id)`.
   `tier` is your own S–D rating (it colors the badges); ids are optional.
   Add personal mixes to `PLAYLISTS` — `(display_name, playlist_id)`.
2. `pip install yt-dlp`, then `python3 harvest_tube.py`
3. Refresh the browser — `videos.json` is regenerated.

Dates come from `--extractor-args youtubetab:approximate_date`: exact for
recent uploads, day-granular estimates for older ones — plenty accurate for
feed ordering.

## The data format

```json
{
  "channels": [{ "n": "3Blue1Brown", "tier": "C", "cid": "UC…", "count": 155 }],
  "videos":   [{ "id": "zqzk43bSdDI", "t": "title", "d": 754, "v": 2400000,
                 "c": 0, "ts": 1795392000 }]
}
```

`c` indexes into `channels`; `ts` is the upload time (unix seconds);
playlist videos add `up` (real uploader) and sit under the ★ channel.
Rows/channels flagged `"pk": 1` are hidden while Pakistani mode is on
(about 3.9k of the 30,953 videos: Dunya News, the Ghamidi circle, and
title-matched reposts of Pakistani media).

## Prefer a "real" web app?

This sandbox also hosts a Next.js + shadcn/ui version of the same idea
(sidebar with tier groups, watch history page, etc.). The static kit and the
app read the same `videos.json` shape, so you can switch either way.
