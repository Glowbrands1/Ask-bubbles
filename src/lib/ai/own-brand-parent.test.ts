import { afterEach, describe, expect, it, vi } from "vitest";

import { withOwnBrandOnly } from "./own-brand-only";
import type { AskResponse } from "./types";

/**
 * OWN_BRAND_PARENT_ENABLED (QA's live tester, 7 Nov 2026). With OWN_BRAND_ONLY live, "cite animals in the workplace
 * policy" still answered with the operating company beside this brand. The manual's title must never be touched.
 */
const LIVE =
  "This applies company-wide across all brands (Buff City Soap, and JB & Associates), since the policy manual doesn't limit it to one brand.";

const reply = (content: string): AskResponse => ({ content, citations: [], recommendedVideoIds: [] });
const out = (content: string) => withOwnBrandOnly(reply(content)).content;

describe("OWN_BRAND_PARENT_ENABLED", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("off (OWN_BRAND_ONLY on): the live reply keeps the operating company (the reported reply)", () => {
    vi.stubEnv("OWN_BRAND_ONLY_ENABLED", "true");
    expect(out(LIVE)).toContain("JB & Associates");
  });

  it("on: the live reply names only Buff City Soap", () => {
    vi.stubEnv("OWN_BRAND_ONLY_ENABLED", "true");
    vi.stubEnv("OWN_BRAND_PARENT_ENABLED", "true");
    expect(out(LIVE)).toBe("This applies company-wide at Buff City Soap, since the policy manual doesn't limit it to one brand.");
  });

  it.each([
    "Source: JBA Policy Manual — Animals in the Workplace, p. 21.",
    "Per the JBA manual, no animals are allowed in the store.",
    "The JB & Associates Office dress code applies to office staff.",
  ])('on: "%s" is untouched (the manual\'s title, a citation, its office label)', (text) => {
    vi.stubEnv("OWN_BRAND_ONLY_ENABLED", "true");
    vi.stubEnv("OWN_BRAND_PARENT_ENABLED", "true");
    expect(out(text)).toBe(text);
  });

  it("on: another sentence that names the operating company goes, as other brands' sentences already do", () => {
    vi.stubEnv("OWN_BRAND_ONLY_ENABLED", "true");
    vi.stubEnv("OWN_BRAND_PARENT_ENABLED", "true");
    expect(out("Pets are not allowed. JB & Associates sets this for every brand.")).toBe("Pets are not allowed.");
  });

  it("on without OWN_BRAND_ONLY: nothing changes", () => {
    vi.stubEnv("OWN_BRAND_PARENT_ENABLED", "true");
    expect(out(LIVE)).toBe(LIVE);
  });
});
