import { beforeAll, describe, expect, it, vi } from "vitest";

import { HIDDEN_TEMPLATE_KEYS } from "@/config/company/forms/hidden";
import { RETIRED_TEMPLATE_KEYS } from "@/config/company/forms/retired";
import { COMPANY_JOB_TITLES } from "@/config/company/job-titles";
import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";

/**
 * ============================================================================
 * NO "TANNING" IN ANY BUBBLES FORM, TITLE, CHOOSER OPTION OR PROMPT TEXT
 * ============================================================================
 *
 * Pau (owner), via QA, 21 Nov 2026: remove "tanning consultant" from Ask
 * Bubbles — it is the sibling company's role, not Buff City Soap's. The
 * Tanning Consultant Interview Form was removed from the hiring library and
 * its key retired (`config/company/forms/retired.ts`: an installed row is
 * switched off on the next install, never deleted), and the full-time
 * consultant title left the job titles. This is QA's requested test.
 *
 * Every string checked is the real exported value or a builder's real output,
 * not a grep of the source.
 *
 * NOT CHECKED HERE, ON PURPOSE:
 *   - The two hidden management interviews (`HIDDEN_TEMPLATE_KEYS`): their
 *     held role play and training question still mention tanning, pending QA's
 *     decision on those forms. They are hidden from every list, and
 *     `seed-sibling-brand.test.ts` pins exactly which phrases they may keep.
 *     The other hidden templates are left out with them by the same rule.
 *   - The brand-filter guard vocabulary in `config/company/knowledge.ts`
 *     (`EXCERPT_HIDDEN_BRANDS` and the lists beside it): it names the sibling
 *     company's terms so that its sections of the shared manual are stripped,
 *     which is the opposite of showing them.
 */

const TANNING = /tanning|tanning consultant/i;

const store: FakeStore = {
  form_instances: [],
  form_instance_values: [],
  form_instance_events: [],
  form_template_versions: [],
  form_templates: [],
  form_template_current: [],
  form_template_assets: [],
};

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: () => fakeSupabase(store) }));

const { TEMPLATE_SEEDS } = await import("./library");
const { WITHHELD_FROM_CHOOSER, offeredInChooser } = await import("./chooser");
const { buildFormInventory } = await import("./inventory");
const { ensureTemplateLibrary, listTemplateSummaries } = await import("./repository");
const { buildFormInventoryBlock } = await import("@/lib/ai/form-answers");
const { buildSystemPrompt } = await import("@/lib/ai/prompts");
const { ACTIVE_BRAND } = await import("@/lib/brand");

const TCI = "tanning-consultant-interview";

/** Every seed the code library ships that is not hidden: what a Bubbles manager can see and start. */
const VISIBLE_SEEDS = TEMPLATE_SEEDS.filter((seed) => !HIDDEN_TEMPLATE_KEYS.includes(seed.key));

describe("no Bubbles form, title, chooser option or prompt text contains 'tanning'", () => {
  it("the Tanning Consultant Interview is retired and no seed carries its key", () => {
    expect(RETIRED_TEMPLATE_KEYS).toContain(TCI);
    expect(TEMPLATE_SEEDS.map((seed) => seed.key)).not.toContain(TCI);
  });

  it("checks a real library, not an empty one", () => {
    expect(VISIBLE_SEEDS.length).toBeGreaterThan(0);
    expect(VISIBLE_SEEDS.map((seed) => seed.key)).toContain("prescreen-phone-interview");
  });

  it.each(VISIBLE_SEEDS.map((seed) => [seed.key, seed] as const))(
    "%s: name, short name, description and document",
    (_key, seed) => {
      expect(seed.name).not.toMatch(TANNING);
      expect(seed.shortName).not.toMatch(TANNING);
      expect(seed.description).not.toMatch(TANNING);
      expect(JSON.stringify(seed.document)).not.toMatch(TANNING);
    },
  );

  it("no job title reads as, or is named, a tanning consultant", () => {
    for (const { pattern, title } of COMPANY_JOB_TITLES) {
      expect(title, title).not.toMatch(/tanning/i);
      for (const words of ["full-time tanning consultant", "full time tanning consultant", "tanning consultant"]) {
        expect(pattern.test(words), `${title} ← ${words}`).toBe(false);
      }
    }
  });

  it("the chooser withholds no tanning key, and offers no tanning form", () => {
    for (const key of WITHHELD_FROM_CHOOSER) expect(key, key).not.toMatch(/tanning/i);
    for (const seed of TEMPLATE_SEEDS.filter((entry) => offeredInChooser(entry.key) && !HIDDEN_TEMPLATE_KEYS.includes(entry.key))) {
      expect(`${seed.name} ${seed.shortName} ${seed.description}`, seed.key).not.toMatch(TANNING);
    }
  });

  describe("what the chat is given", () => {
    beforeAll(async () => {
      await ensureTemplateLibrary("system");
    });

    it.each(["location_manager", "district_manager", "admin"] as const)(
      "the FORMS LIBRARY block, for a %s, names no tanning form",
      async (role) => {
        const summaries = await listTemplateSummaries();
        expect(summaries.length).toBeGreaterThan(0);
        expect(summaries.map((summary) => summary.key)).not.toContain(TCI);
        const block = buildFormInventoryBlock(buildFormInventory(summaries, { role, scope: null }));
        expect(block).not.toMatch(TANNING);
      },
    );

    it.each([
      ["every optional rule off", false],
      ["every optional rule on", true],
    ] as const)("the system prompt Bubbles builds, %s, says nothing of tanning", (_label, on) => {
      for (const mode of ["quick", "standard", "detailed"] as const) {
        const prompt = buildSystemPrompt({
          assistantName: ACTIVE_BRAND.assistantName,
          brandName: ACTIVE_BRAND.brandName,
          productName: ACTIVE_BRAND.productName,
          locationNoun: ACTIVE_BRAND.vocabulary.locationNoun,
          context: { userName: "Dana Reyes", locationName: "Testville Downtown", todayIso: "2026-11-21" } as never,
          mode,
          hasContext: on,
          hasReportData: on,
          hasMissingReports: on,
          hasFormsLibrary: on,
          hasVerifiedRecords: on,
          hasPersonMemory: on,
          crossChatGuard: on,
          hasFormRecords: on,
          canViewReports: on,
          styleRules: on,
          priorCoachingOptional: on,
          typedName: on,
          policyCitation: on,
          printedPageOnly: on,
          actionPlanSentences: on,
          frameworkGeneralSections: on,
        });
        expect(prompt, mode).not.toMatch(TANNING);
      }
    });
  });
});
