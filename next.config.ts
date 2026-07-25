import type { NextConfig } from "next";

/** Two build modes share one codebase:
 *  - default: normal Next.js server, lap times persisted to SQLite via /api/*
 *  - NEXT_PUBLIC_STATIC_EXPORT=1: fully static export for GitHub Pages, lap
 *    times kept in the browser's localStorage
 *
 * GitHub Pages serves a project site from /<repo>, so the static build needs a
 * basePath. NEXT_PUBLIC_BASE_PATH is set by .github/workflows/deploy-pages.yml.
 */
const isStaticExport = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  ...(isStaticExport
    ? {
        output: "export",
        basePath,
        assetPrefix: basePath || undefined,
        images: { unoptimized: true },
        // `output: "export"` cannot emit POST route handlers. Dropping "node.ts"
        // from the recognized page extensions leaves the api/**/route.node.ts
        // files on disk but unregistered, so they simply don't exist in this build.
        pageExtensions: ["ts", "tsx"],
        trailingSlash: true,
      }
    : {
        pageExtensions: ["ts", "tsx", "node.ts"],
      }),
};

export default nextConfig;
