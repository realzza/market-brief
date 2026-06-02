import type { NextConfig } from "next";

// Two build shapes from one config, switched by NEXT_PUBLIC_STATIC_EXPORT
// (set only by scripts/build-static.mjs). See lib/static.ts for the why.
const isStaticExport = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";

// Project-site base path for GitHub Pages: realzza.github.io/<repo>. Must
// match the repo name. Defaults to /market-brief; override with
// PAGES_BASE_PATH (use "" for a user/org root site or a custom domain).
const basePath =
  process.env.PAGES_BASE_PATH !== undefined
    ? process.env.PAGES_BASE_PATH
    : "/market-brief";

const staticConfig: NextConfig = {
  // Emits an `out/` folder of plain HTML/CSS/JS — server components run at
  // build time and bake the sqlite data into the HTML. No API routes, no
  // scheduler (those are stashed out of the tree by the build script).
  output: "export",

  // GitHub Pages serves `/post/<id>/index.html` reliably for `/post/<id>/`,
  // whereas extensionless `/post/<id>.html` is flakier under a base path.
  trailingSlash: true,

  // Prefix every asset/link with the project sub-path. Empty string is a
  // valid value (root site), so only apply when non-empty.
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
};

const serverConfig: NextConfig = {
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

const nextConfig: NextConfig = isStaticExport ? staticConfig : serverConfig;

export default nextConfig;
