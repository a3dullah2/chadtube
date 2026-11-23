import { NextResponse } from "next/server";
import raw from "@/data/videos.json";
import type { TubeData } from "@/components/tube/types";

export async function GET() {
  const data = raw as TubeData;
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, max-age=300, must-revalidate" },
  });
}
