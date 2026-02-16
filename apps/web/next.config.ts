import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["ui", "database"],
  serverExternalPackages: ["packbuilder"],
};

export default nextConfig;
