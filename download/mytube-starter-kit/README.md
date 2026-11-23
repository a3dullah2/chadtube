# MyTube — your personal YouTube

A TristanTube-style personal video site: a **mixed, newest-first feed across all
your favorite channels** — like the YouTube subscriptions feed, minus the
algorithm. Videos are never hosted or re-uploaded; everything plays via
official YouTube embeds.

## What's in this folder

| File | Purpose |
| --- | --- |
| `index.html` | The whole frontend — one file, zero build step, vanilla JS |
| `videos.json` | The dataset: 68 channels, ~9.4k videos with upload dates |
| `harvest_tube.py` | Re-harvest / re-curate the dataset with yt-dlp (no API key) |

## Run it

`fetch()` can't read local files from `file://`, so serve over HTTP:

```bash
cd mytube-starter-kit
python -m http.server 8000
# open http://localhost:8000
```

Or drop the folder on **GitHub Pages / Cloudflare Pages / Netlify** — it's
fully static.

## Features

- **Healthy mixed feed** — newest uploads from every channel interleaved
  (default sort), so no single channel floods the screen
- Search, tier chips (S–D), sort: newest / most viewed / longest / shuffled
- **TV mode** — fullscreen lean-back player: click-catcher over the iframe,
  auto-advance with countdown, keyboard `space / n / p / m / ←→ / esc`
- Watch view with autoplay-next and an "Up next" queue from your filters
- Watch history + dimmed thumbnails (localStorage, stays on your device)
- Dark / light theme

## Re-curate the channel list

1. Open `harvest_tube.py`, edit the `CHANNELS` list — `(name, tier, channel_id)`.
   `tier` is your own S–D rating (it colors the badges); ids are optional.
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

`c` indexes into `channels`; `ts` is the upload time (unix seconds).

## Prefer a "real" web app?

This sandbox also hosts a Next.js + shadcn/ui version of the same idea
(sidebar with tier groups, watch history page, etc.). The static kit and the
app read the same `videos.json` shape, so you can switch either way.
