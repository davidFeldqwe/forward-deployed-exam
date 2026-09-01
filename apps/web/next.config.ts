import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/scoring", "@repo/snapshot"],
};

export default nextConfig;
