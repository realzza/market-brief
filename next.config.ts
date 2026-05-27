import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep better-sqlite3 unbundled so the native .node binding loads at runtime.
  serverExternalPackages: ["better-sqlite3"],

  // `standalone` output produces .next/standalone/server.js plus a minimal
  // node_modules trace. The Dockerfile copies that folder + .next/static +
  // public to ship a ~150MB runtime image instead of a 1GB+ one.
  output: "standalone",

  // Belt-and-suspenders: explicitly include better-sqlite3's prebuilt native
  // binary in the trace so it's never silently dropped.
  outputFileTracingIncludes: {
    "/*": ["./node_modules/better-sqlite3/build/Release/*.node"],
  },
};

export default nextConfig;
