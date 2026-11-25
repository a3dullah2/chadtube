import type { Metadata } from "next";
import { TubeApp } from "@/components/tube/tube-app";
import { getVideoMeta } from "@/lib/library";

/**
 * Per-video OG tags: sharing /?v=<id> renders a real link preview (title,
 * channel, thumbnail) on chat apps and social cards instead of a blank box.
 * Video ids not in the library fall through to the layout's site defaults.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const id = typeof sp?.v === "string" ? sp.v : undefined;
  if (!id) return {};
  const meta = await getVideoMeta(id);
  if (!meta) return {};

  const title = `${meta.title} — ChadTube`;
  const description = `Watch “${meta.title}” from ${meta.channel} on ChadTube — curated channels, zero algorithm.`;
  const image = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  return {
    title,
    description,
    openGraph: {
      type: "video.other",
      title,
      description,
      images: [{ url: image, width: 480, height: 360 }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default function Home() {
  return <TubeApp />;
}
