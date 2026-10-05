import path from "node:path";

import type { NextConfig } from "next";

/**
 * ============================================================================
 * WHICH SIDE OF THE DEMO BOUNDARY THIS BUILD COMPILES
 * ============================================================================
 *
 * `src/lib/demo/runtime.ts` is the production implementation: empty
 * collections, absent screens, and no import of `data/demo/*`. Every
 * production-reachable module imports it. When — and only when — a build
 * explicitly asks for the demo, it is substituted for `runtime.demo.ts`,
 * which is the one module in the repository allowed to import the seeded
 * datasets.
 *
 * SO A PRODUCTION BUILD DOES NOT CONTAIN THE SEEDED RECORDS, rather than
 * containing them behind a branch nobody takes. The previous design reached
 * them through dynamic imports, which kept them out of every page's download
 * and still emitted chunks carrying seeded records. A module nothing imports is a module nothing
 * emits; that is the whole mechanism.
 *
 * ============================================================================
 * THE CONTRACT, AND IT MIRRORS `lib/config/runtime.ts` ON PURPOSE
 * ============================================================================
 *
 *   Vercel Production            -> production, always, flag ignored
 *   flag absent                  -> production
 *   flag invalid / "false" / ""  -> production
 *   flag exactly "true"          -> demo
 *
 * Demo is an intentional BUILD configuration. Nothing at runtime can move a
 * production build onto the demo implementation, because the demo code is not
 * in the bundle to move to.
 *
 * THE TWO DECISIONS ARE DELIBERATELY MADE THE SAME WAY. `isDemoMode()` decides
 * what RENDERS and is read in the browser; this decides what EXISTS and is
 * read once, by the compiler. If they ever disagreed, the failure would be a
 * demo build whose screens refuse to render, or — much worse — a production
 * build that renders screens it did not compile. Keeping the rule identical in
 * both places is what makes that impossible, and
 * `demo-boundary.test.ts` asserts the two implementations stay in step.
 */
function demoBuildRequested(): boolean {
  const normalise = (value: string | undefined) => value?.trim().toLowerCase() ?? "";

  // A deployment Vercel itself built for Production is never a demo build.
  if (normalise(process.env.NEXT_PUBLIC_VERCEL_ENV) === "production") {
    if (normalise(process.env.NEXT_PUBLIC_ALLOW_DEMO_IN_PRODUCTION) !== "true") {
      return false;
    }
  }

  return normalise(process.env.NEXT_PUBLIC_DEMO_MODE) === "true";
}

const DEMO_BUILD = demoBuildRequested();

/**
 * The demo implementation, for the bundler's alias table.
 *
 * TWO SPELLINGS, because the two bundlers want different things. Turbopack
 * resolves a project-relative specifier and rejects an absolute path (it
 * reports `module-not-found` for the aliased request, which is how this was
 * found); webpack's `resolve.alias` wants a real path.
 */
const DEMO_RUNTIME_RELATIVE = "./src/lib/demo/runtime.demo.ts";
const DEMO_RUNTIME_ABSOLUTE = path.join(process.cwd(), "src/lib/demo/runtime.demo.ts");

const nextConfig: NextConfig = {
  /*
   * TURBOPACK IS WHAT `next build` USES HERE, and the webpack entry below
   * covers a build that opts out. Both point one specifier at one file; there
   * is no per-dataset stub list to keep in step.
   */
  ...(DEMO_BUILD
    ? {
        turbopack: {
          resolveAlias: {
            "@/lib/demo/runtime": DEMO_RUNTIME_RELATIVE,
          },
        },
        webpack: (config: { resolve?: { alias?: Record<string, string> } }) => {
          config.resolve ??= {};
          config.resolve.alias = {
            ...config.resolve.alias,
            "@/lib/demo/runtime": DEMO_RUNTIME_ABSOLUTE,
          };
          return config;
        },
      }
    : {}),

  async redirects() {
    return [
      {
        /*
         * THE CREATE A FORM SCREEN IS GONE. Forms are only created by chatting
         * with Ask Bubbles, so an old bookmark or a link written before the
         * screen was removed lands in the chat rather than on a 404.
         * `permanent: false` for the same reason as above: a cached 308 would
         * outlive any later decision about this path.
         */
        source: "/forms/create",
        destination: "/chat",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
