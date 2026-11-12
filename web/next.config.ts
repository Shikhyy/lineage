import type { NextConfig } from "next";

const goApi = process.env.GO_API_URL ?? "http://localhost:8080";

const config: NextConfig = {
  turbopack: { root: process.cwd() },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${goApi}/api/:path*` },
      { source: "/v1/:path*", destination: `${goApi}/v1/:path*` },
      { source: "/healthz", destination: `${goApi}/healthz` },
    ];
  },
};

export default config;
