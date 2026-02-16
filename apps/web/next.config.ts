import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["ui", "database", "packbuilder"],
  // Do not externalize packbuilder so it is bundled and available in serverless
  serverExternalPackages: [],
};

export default nextConfig;
