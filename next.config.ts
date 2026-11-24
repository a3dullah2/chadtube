import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // The /api/videos route reads the 4.9 MB dataset from disk at runtime via
  // fs — make sure the data files ship inside the serverless bundle.
  outputFileTracingIncludes: {
    "/api/videos": ["./src/data/videos.json", "./src/data/videos.json.gz"],
  },
};

export default nextConfig;
