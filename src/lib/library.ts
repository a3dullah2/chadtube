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
 * Both the API route and generateMetadata (OG tags) share this module's
 * cache, so the 4.9 MB file is parsed at most once per server instance.
 */

const RAW_PATH = path.join(process.cwd(), "src/data/videos.json");

interface ApiPayload {
  /** JSON body of the cleaned library, UTF-8. */
  body: Buffer;
  /** gzip(body) — computed once so it can never disagree with `body`. */
  gz: Buffer;
  /** Strong ETag over the cleaned body. */
  etag: string;
  /** id -> { title, channel } for OG tags, built during the same load. */
  meta: Map<string, { title: string; channel: string }>;
}

let cache: { mtimeMs: number; payload: ApiPayload } | null = null;

async function load(): Promise<ApiPayload> {
  const m = await stat(RAW_PATH);
  if (cache && m.mtimeMs === cache.mtimeMs) return cache.payload;

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
  const meta = new Map<string, { title: string; channel: string }>();
  for (const v of videos) {
    const chan = channels[v.c as number] as { n?: string } | undefined;
    const channel =
      (typeof v.up === "string" && v.up) || (typeof chan?.n === "string" && chan.n) || "ChadTube";
    meta.set(v.id as string, { title: String(v.t ?? "Untitled"), channel });
  }

  // Channels: strip the nested videos arrays (never consumed client-side).
  const clean = {
    channels: channels.map((c) => {
      const { videos: _stripped, ...rest } = c;
      return rest;
    }),
    videos,
  };

  const body = Buffer.from(JSON.stringify(clean), "utf8");
  const gz = gzipSync(body, { level: 6 });
  const etag = `"${createHash("md5").update(body).digest("hex")}"`;

  const payload: ApiPayload = { body, gz, etag, meta };
  cache = { mtimeMs: m.mtimeMs, payload };
  return payload;
}

/** Serialized + gzipped + ETagged API payload (cached per data-file mtime). */
export async function getApiPayload(): Promise<ApiPayload> {
  return load();
}

/** OG-tag lookup for a single video (same cache, no extra parsing). */
export async function getVideoMeta(
  id: string
): Promise<{ title: string; channel: string } | null> {
  return (await load()).meta.get(id) ?? null;
}
