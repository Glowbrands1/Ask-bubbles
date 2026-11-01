import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { config } from "@/middleware";

/**
 * /about and /privacy are the homepage and privacy policy named on Google's
 * OAuth consent screen. Google's reviewers, and anyone deciding whether to
 * connect, open them with NO Ask Bubbles session — so they must stay outside
 * the guarded `(app)` group and must never call a page guard.
 */
const PUBLIC_PAGES = ["src/app/about/page.tsx", "src/app/privacy/page.tsx"];
const GUARDS = /require(Page|Authenticated)|pageIdentity|pageCan|authorizeRequest|redirect\(/;

describe("public pages load logged out", () => {
  it.each(PUBLIC_PAGES)("%s is outside (app) and calls no auth guard", (file) => {
    expect(file).not.toContain("(app)");
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(GUARDS);
    expect(readFileSync("src/features/public/public-page.tsx", "utf8")).not.toMatch(GUARDS);
  });

  it("the middleware never redirects (it only refreshes the session)", () => {
    const source = readFileSync("src/middleware.ts", "utf8");
    expect(source).not.toMatch(/NextResponse\.redirect|redirect\(/);
    expect(config.matcher).toHaveLength(1);
  });

  it("the privacy policy carries the Google Limited Use statement, verbatim", () => {
    const source = readFileSync("src/app/privacy/page.tsx", "utf8").replace(/\s+/g, " ");
    expect(source).toContain(
      "Ask Bubbles&apos; use of information received from Google APIs adheres to the{\" \"}",
    );
    expect(source).toContain("Google API Services User Data Policy </a> , including the Limited Use requirements.");
    expect(source).toContain("business.manage");
    expect(source).toContain("paulyne.camacho@glowbrands.com");
  });

  it("sign-in links to /privacy and /about", () => {
    const login = readFileSync("src/features/auth/login-screen.tsx", "utf8");
    expect(login).toContain("<PublicLinks");
    const links = readFileSync("src/features/public/public-page.tsx", "utf8");
    expect(links).toContain('href="/privacy"');
    expect(links).toContain('href="/about"');
  });
});
