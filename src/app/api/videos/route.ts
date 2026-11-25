import { getApiPayload } from "@/lib/library";

/**
 * Serves the cleaned video library (nested duplicates stripped, ids deduped)
 * pre-gzipped with edge caching.
 *
 * Cleaning + gzip happen in src/lib/library.ts, once per data-file mtime —
 * the payload drops ~30% (the 9,432 nested duplicate records) and the gzip
 * copy can never drift out of sync with the ETag again.
 *
 * Caching: s-maxage keeps the payload at the CDN edge for a day (cheap,
 * fast TTFB worldwide) with stale-while-revalidate covering refreshes;
 * `no-cache` keeps browsers revalidating via ETag so a data update reaches
 * them on their next normal reload instead of up to a day later.
 */
export async function GET(req: Request) {
  let payload: Awaited<ReturnType<typeof getApiPayload>>;
  try {
    payload = await getApiPayload();
  } catch {
    return Response.json({ error: "library unavailable" }, { status: 500 });
  }

  const base = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, no-cache, s-maxage=86400, stale-while-revalidate=86400",
    ETag: payload.etag,
    Vary: "Accept-Encoding",
  };

  // Client copy unchanged -> no body at all.
  if (req.headers.get("if-none-match") === payload.etag) {
    return new Response(null, { status: 304, headers: base });
  }

  const acceptsGzip = (req.headers.get("accept-encoding") ?? "").includes("gzip");
  if (acceptsGzip) {
    return new Response(new Uint8Array(payload.gz), {
      headers: { ...base, "Content-Encoding": "gzip", "Content-Length": String(payload.gz.length) },
    });
  }
  return new Response(new Uint8Array(payload.body), { headers: base });
}
