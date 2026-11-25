# ChadTube

A personal, algorithm-free video site: curated channels, thousands of videos, zero recommendations feed. Built with Next.js + React 19 + Tailwind 4 + shadcn/ui.

## Features

- **333 curated channels / 30k+ videos** organized by topic, with a Tristan Hume-style quality grading (S / A / B / R)
- **Bookmarks** — hover any card (or long-press on touch) to save it; manage everything in the Saved view
- **Watch progress** — positions are sampled every 5s, so the home screen shows a red watched-ratio bar on thumbnails and a "Continue watching" strip that resumes 5 seconds back
- **History** — everything you watched, with per-item remove and clear-all
- Single-player YouTube embed with native controls; no URL routing (views are pure client state)

## Data pipeline

Videos are collected with `yt-dlp` into `videos.json`, served through `/api/videos` with ETag + gzip, and injected pre-hydration as `window.__chadtubeData`.

## Persistence

Bookmarks and watch progress live in `localStorage` (`chadtube.saved`, `chadtube.progress`) with LRU caps (1000 / 3000 entries) so quota is never hit.

## Develop

```bash
bun install
bun run dev
```
