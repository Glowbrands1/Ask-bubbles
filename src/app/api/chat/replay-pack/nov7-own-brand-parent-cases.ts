import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * A REPLY NAMES ONLY BUFF CITY SOAP, NOT THE COMPANY THAT OPERATES EVERY BRAND (QA's live tester, 7 Nov 2026)
 * ============================================================================
 *
 * With OWN_BRAND_ONLY live, "cite animals in the workplace policy" answered "This applies company-wide across all
 * brands (Buff City Soap, and JB & Associates), since the policy manual doesn't limit it to one brand." The other
 * brands' names were gone; the operating company's was not. OWN_BRAND_PARENT_ENABLED (`ai/own-brand-only.ts`). The
 * manual's title stays as it is: retrieval depends on it.
 */

const LIVE_REPLY = [
  "**Animals in the Workplace** — JBA Policy Manual",
  "",
  "Animals are not permitted in the store, except service animals as required by law.",
  "",
  "This applies company-wide across all brands (Buff City Soap, and JB & Associates), since the policy manual doesn't limit it to one brand.",
].join("\n");

export const NOV7_OWN_BRAND_PARENT_CASES: ReplayCase[] = [
  {
    id: "nov7-own-brand-parent",
    title: "\"cite animals in the workplace policy\": the reply names only Buff City Soap, and the manual's title stays",
    report: "QA's live tester, 7 Nov 2026 (OWN_BRAND_ONLY live)",
    // fixed in production by OWN_BRAND_PARENT_ENABLED, QA round 4, 8 Nov 2026
    status: "fixed",
    fixFlags: ["OWN_BRAND_ONLY_ENABLED", "OWN_BRAND_PARENT_ENABLED"],
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      t.modelSays(LIVE_REPLY);
      const thread = t.thread();
      const reply = await thread.say("cite animals in the workplace policy");
      expect(reply.content, "the reply names the operating company").not.toMatch(/JB\s*(?:&|and)\s*Associates/i);
      expect(reply.content, "the manual's title was touched").toMatch(/JBA Policy Manual/);
      expect(reply.content).toMatch(/Buff City Soap/);
    },
  },
];
