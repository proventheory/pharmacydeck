import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["ui", "database"],
};

export default nextConfig;
