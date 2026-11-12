import type { NextConfig } from "next";

const goApi = process.env.GO_API_URL ?? "http://localhost:8080";

const config: NextConfig = {
  // Parallel work (or a dev server next to a build) can use its own output directory.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  turbopack: { root: process.cwd() },
  // The old multi-page app lives on as one console; keep every old URL working.
  async redirects() {
    return [
      { source: "/demo", destination: "/console", permanent: false },
      { source: "/runs/:id", destination: "/console/runs/:id", permanent: false },
      { source: "/approvals", destination: "/console?panel=approvals", permanent: false },
      { source: "/audit", destination: "/console?panel=audit", permanent: false },
      { source: "/bench", destination: "/console?panel=benchmark", permanent: false },
    ];
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${goApi}/api/:path*` },
      { source: "/v1/:path*", destination: `${goApi}/v1/:path*` },
      { source: "/healthz", destination: `${goApi}/healthz` },
    ];
  },
};

export default config;
