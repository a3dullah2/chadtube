import type { Metadata } from "next";
import { TubeApp } from "@/components/tube/tube-app";
import { getVideoMeta } from "@/lib/library";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chadtube.vercel.app";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** ISO-8601 duration (PT#H#M#S) for VideoObject JSON-LD. */
function isoDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  const out = `${h ? `${h}H` : ""}${m ? `${m}M` : ""}${s || (!h && !m) ? `${s}S` : ""}`;
  return `PT${out}`;
}

/**
 * Per-video OG tags: sharing /?v=<id> renders a real link preview (title,
 * channel, thumbnail) on chat apps and social cards instead of a blank box,
 * canonicalized to its own URL. Video ids not in the library fall through
 * to the layout's site defaults.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const sp = await searchParams;
  const id = typeof sp?.v === "string" ? sp.v : undefined;
  if (!id) return {};
  const meta = await getVideoMeta(id);
  if (!meta) return {};

  const url = `/?v=${encodeURIComponent(id)}`;
  const title = `${meta.title} — ChadTube`;
  const description = `Watch “${meta.title}” from ${meta.channel} on ChadTube — curated channels, zero algorithm.`;
  const image = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "video.other",
      url,
      title,
      description,
      images: [{ url: image, width: 480, height: 360 }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

/**
 * Server-rendered JSON-LD: a VideoObject for /?v=<id> (name, channel,
 * thumbnail, duration, upload date when the data has one) and a WebSite
 * graph for the bare home page. Reads from the same cached library load the
 * API route uses — no extra file parse. uploadDate is omitted when unknown
 * rather than fabricated.
 */
export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const id = typeof sp?.v === "string" ? sp.v : undefined;
  const meta = id ? await getVideoMeta(id) : null;

  const jsonLd =
    meta && id
      ? {
          "@context": "https://schema.org",
          "@type": "VideoObject",
          name: meta.title,
          description: `Watch “${meta.title}” from ${meta.channel} on ChadTube — curated channels, zero algorithm.`,
          thumbnailUrl: [`https://i.ytimg.com/vi/${id}/hqdefault.jpg`],
          embedUrl: `https://www.youtube.com/embed/${id}`,
          uploadDate: meta.ts ? new Date(meta.ts * 1000).toISOString() : undefined,
          duration: meta.d ? isoDuration(meta.d) : undefined,
          publisher: { "@type": "Organization", name: "ChadTube", url: SITE_URL },
        }
      : {
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "ChadTube",
          alternateName: "your personal nerd TV",
          url: SITE_URL,
          description:
            "A personal, algorithm-free video site: curated channels and thousands of videos.",
        };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <TubeApp />
    </>
  );
}
