import { createHash } from "crypto";
import { readFile, stat } from "fs/promises";
import { gzipSync } from "zlib";
import path from "path";

/**
 * Server-side loader for the video library.
 *
 * The raw videos.json is the output of successive yt-dlp harvest scripts and
 * carries three problems we fix here once per (re)load, instead of shipping
 * them to every client:
 *
 *  1. Nested per-channel `videos` arrays that duplicate 9,432 of the flat
 *     list's records — the client builds its own channel→videos mapping and
 *     never reads them. Stripped.
 *  2. 38 duplicate video ids (same video harvested twice). Deduped, first
 *     occurrence wins — matching the client's feed-level dedupe.
 *  3. The pre-gzipped file on disk went stale whenever videos.json changed
 *     without re-running the compress script (ETag/gzip mismatch hazard).
 *     We gzip the cleaned body in memory now, so it can never drift.
 *
 * On top of the cleaned full library, the same parse also serves a
 * "curated core" shard: S & A tier videos only (~2k of ~31k) with the full
 * channel list and a `shard: "core"` marker. The landing page bootstraps
 * with the shard and swaps in the full library lazily (see tube-app.tsx),
 * so a fresh visit downloads a fraction of the bytes.
 *
 * All payload variants share this module's cache, so the 4.9 MB file is
 * parsed at most once per server instance.
 */

const RAW_PATH = path.join(process.cwd(), "src/data/videos.json");

interface VideoMeta {
  title: string;
  channel: string;
  /** Approximate upload timestamp (unix seconds), when known. */
  ts?: number;
  /** Duration in seconds, when known. */
  d?: number;
}

interface CleanData {
  channels: Record<string, unknown>[];
  videos: Record<string, unknown>[];
  meta: Map<string, VideoMeta>;
}

interface ApiPayload {
  /** JSON body of the cleaned library, UTF-8. */
  body: Buffer;
  /** gzip(body) — computed once so it can never disagree with `body`. */
  gz: Buffer;
  /** Strong ETag over the body. */
  etag: string;
}

/** Payload variants: the whole library, or the S & A "core" shard. */
type Shard = "full" | "core";

interface CacheEntry {
  mtimeMs: number;
  data: CleanData;
  payloads: Partial<Record<Shard, ApiPayload>>;
}

let cache: CacheEntry | null = null;

async function entry(): Promise<CacheEntry> {
  const m = await stat(RAW_PATH);
  if (cache && m.mtimeMs === cache.mtimeMs) return cache;

  const raw = JSON.parse((await readFile(RAW_PATH)).toString("utf8")) as {
    channels?: Record<string, unknown>[];
    videos?: Record<string, unknown>[];
  };

  // Videos: dedupe by id, drop records without one.
  const seen = new Set<string>();
  const videos = (raw.videos ?? []).filter((v) => {
    const id = v?.id;
    return typeof id === "string" && id.length > 0 && !seen.has(id) && !!seen.add(id);
  });

  // Channel names for OG tags: playlist videos carry their real uploader.
  const channels = raw.channels ?? [];
  const meta = new Map<string, VideoMeta>();
  for (const v of videos) {
    const chan = channels[v.c as number] as { n?: string } | undefined;
    const channel =
      (typeof v.up === "string" && v.up) || (typeof chan?.n === "string" && chan.n) || "ChadTube";
    meta.set(v.id as string, {
      title: String(v.t ?? "Untitled"),
      channel,
      ts: typeof v.ts === "number" && v.ts > 0 ? v.ts : undefined,
      d: typeof v.d === "number" && v.d > 0 ? v.d : undefined,
    });
  }

  // Channels: strip the nested videos arrays (never consumed client-side).
  const data: CleanData = {
    channels: channels.map((c) => {
      const { videos: _stripped, ...rest } = c;
      return rest;
    }),
    videos,
    meta,
  };

  cache = { mtimeMs: m.mtimeMs, data, payloads: {} };
  return cache;
}

/** A video belongs to the curated core when its channel is tier S or A. */
function isCoreVideo(v: Record<string, unknown>, channels: Record<string, unknown>[]): boolean {
  const c = channels[v.c as number] as { tier?: string } | undefined;
  return c?.tier === "S" || c?.tier === "A";
}

function buildPayload(data: CleanData, shard: Shard): ApiPayload {
  const videos =
    shard === "core"
      ? data.videos.filter((v) => isCoreVideo(v, data.channels))
      : data.videos;
  // `shard` marks the sharded body so the client knows the full library
  // still has to be fetched for non-curated views.
  const bodyObj =
    shard === "core"
      ? { channels: data.channels, videos, shard }
      : { channels: data.channels, videos };

  const body = Buffer.from(JSON.stringify(bodyObj), "utf8");
  const gz = gzipSync(body, { level: 6 });
  const etag = `"${createHash("md5").update(body).digest("hex")}"`;
  return { body, gz, etag };
}

/** Full library payload (cleaned + gzipped + ETagged, cached per mtime). */
export async function getApiPayload(): Promise<ApiPayload> {
  const e = await entry();
  if (!e.payloads.full) e.payloads.full = buildPayload(e.data, "full");
  return e.payloads.full;
}

/** Curated-core shard: S & A videos only, full channel list (same cache). */
export async function getCorePayload(): Promise<ApiPayload> {
  const e = await entry();
  if (!e.payloads.core) e.payloads.core = buildPayload(e.data, "core");
  return e.payloads.core;
}

/** OG/JSON-LD lookup for a single video (same cache, no extra parsing). */
export async function getVideoMeta(id: string): Promise<VideoMeta | null> {
  return (await entry()).data.meta.get(id) ?? null;
}
