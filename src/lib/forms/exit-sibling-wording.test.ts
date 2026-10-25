import { beforeAll, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { ChatFormProposal } from "@/types";

import { buildFormInventoryBlock } from "@/lib/ai/form-answers";

import { WITHHELD_FROM_CHOOSER, offeredInChooser } from "./chooser";
import { EXIT_DETAILS_TRIMMED_NOTICE, EXIT_DRAFT_RULES, guardExitDetails } from "./exit-draft";
import { readExitDetails } from "./exit-details";
import { readExitFacts } from "./exit-facts";
import {
  EXIT_DOES_NOT_ACT,
  exitEmployeeQuestion,
  exitIntakeRequest,
  exitReady,
} from "./exit-intake";
import { EXIT_TEMPLATE_SEEDS, exitFormDocument } from "./exit-library";
import { buildFormInventory } from "./inventory";
import { TEMPLATE_SEEDS } from "./library";

/**
 * ============================================================================
 * NO SUN TAN CITY SYSTEM NAMES IN WHAT A BUFF CITY SOAP MANAGER READS
 * ============================================================================
 *
 * QA, 25 Oct 2026, on Ask Bubbles main: the exit form's Steps to Finish
 * Termination told a Buff City Soap manager to "remove employee from MyGlow"
 * and to "Place comment on employee's Sunlync account … verify tanning has
 * been removed"; the chat said the draft would not "remove anyone from MyGlow
 * … or update Sunlync"; and the Tanning Consultant Interview Form was still in
 * the template library the chat reads. MyGlow and Sunlync are the sibling
 * company's systems and tanning is its product.
 *
 * Buff City Soap's own system names are not known yet, so the steps say
 * "the scheduling/HR system" and "the employee's account" until they are.
 *
 * Every string below is the exported text or a builder's real output — not a
 * grep of the source — so a word that reaches a manager through a template
 * literal, a seed or a builder is caught here.
 */
const SIBLING_WORDING = /myglow|my\s+glow|sunlync|sunlink|tanning|sun\s*tan\s*city/i;

function expectClean(text: string, where: string) {
  const hit = SIBLING_WORDING.exec(text);
  expect(hit?.[0] ?? null, `${where}: ${text}`).toBeNull();
}

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
const { ensureTemplateLibrary, listTemplateSummaries } = await import("./repository");

const PRODUCTION = { VERCEL: "1", VERCEL_ENV: "production", NODE_ENV: "production" };
const TODAY = "2026-10-01";

/** The phrase the forms QA matrix uses for the exit form. */
const EXIT_NOTES =
  "Create an exit form for Jordan Testperson. She gave two weeks notice on 9/1 and her last day was 9/15.";

function proposal(overrides: Partial<ChatFormProposal> = {}): ChatFormProposal {
  return {
    proposalId: "proposal-1",
    templateKey: "resignation-exit",
    templateName: "Resignation/Exit Form",
    supportsInlineDraft: true,
    variantKey: null,
    employeeName: "Jordan Testperson",
    employeeRole: null,
    locationId: null,
    status: "ready",
    locationResolution: "resolved",
    ...overrides,
  } as ChatFormProposal;
}

describe("the exit form's Steps to Finish Termination", () => {
  const steps = (() => {
    const blocks = exitFormDocument().blocks;
    const at = blocks.findIndex((block) => block.kind === "section" && block.label === "Steps to Finish Termination");
    return blocks.slice(at + 1).map((block) => (block as { text?: string }).text ?? "");
  })();

  it("names no sibling-company system, and uses neutral wording until Buff City Soap's systems are named", () => {
    expect(steps).toEqual([
      "Upload Exit Form to employee’s personal file and remove the employee from the scheduling/HR system.",
      "Notify home office of employee’s final date of employment for HR, Payroll, and Security System purposes.",
      "Add a note to the employee’s account stating they are no longer employed.",
    ]);
    for (const step of steps) expectClean(step, "exit step");
  });

  it("the whole exit template seed — name, description, note, every block — is clean", () => {
    for (const seed of EXIT_TEMPLATE_SEEDS) {
      expectClean(seed.name, "exit seed name");
      expectClean(seed.shortName, "exit seed short name");
      expectClean(seed.description, "exit seed description");
      expectClean(seed.revisionNote, "exit seed revision note");
      expectClean(JSON.stringify(seed.document), "exit seed document");
    }
  });
});

describe("the exit intake's chat text", () => {
  it("the 'creating the draft does not act' line names no system", () => {
    expectClean(EXIT_DOES_NOT_ACT, "EXIT_DOES_NOT_ACT");
    expect(EXIT_DOES_NOT_ACT).toMatch(/doesn't sign anything, remove anyone from any system, change payroll/);
  });

  it("the opening and the who-is-it-for questions are clean", () => {
    expectClean(exitIntakeRequest("Resignation/Exit Form"), "exitIntakeRequest");
    expectClean(exitEmployeeQuestion("Resignation/Exit Form", []), "exitEmployeeQuestion (none)");
    expectClean(exitEmployeeQuestion("Resignation/Exit Form", ["Jordan Testperson", "Jordan Example"]), "exitEmployeeQuestion (two)");
  });

  it("the ready card's prose is clean, with and without a job title and store", () => {
    const facts = readExitFacts(EXIT_NOTES, TODAY);
    const details = readExitDetails(EXIT_NOTES, TODAY, facts);
    for (const overrides of [
      {},
      { employeeRole: "Team Member" },
      { supportsInlineDraft: false, status: "needs_location" as const },
      { supportsInlineDraft: false },
    ]) {
      expectClean(exitReady({ proposal: proposal(overrides as Partial<ChatFormProposal>), facts, details }), "exitReady");
    }
  });
});

describe("the exit drafting rules and the Details guard", () => {
  it("every drafting rule and the trimmed notice are clean", () => {
    for (const rule of EXIT_DRAFT_RULES) expectClean(rule, "EXIT_DRAFT_RULES");
    expectClean(EXIT_DETAILS_TRIMMED_NOTICE, "EXIT_DETAILS_TRIMMED_NOTICE");
    expect(EXIT_DRAFT_RULES.join(" ")).toMatch(/removing the employee from the scheduling\/HR system or any other system/);
  });

  /*
   * THE GUARD STAYS, AND WIDENS. It still drops a sentence claiming the old
   * system names (a model can echo them from anywhere), and now also drops a
   * sentence claiming the employee was taken off any system or had a note put
   * on their account: Ask Bubbles never does either, under any name.
   */
  const notes = "Jordan gave two weeks notice on 9/1 and her last day was 9/15.";
  it.each([
    "Jordan was removed from MyGlow.",
    "A comment was placed on Jordan's Sunlync account.",
    "Jordan has been removed from the scheduling system.",
    "Jordan was removed from the HR system.",
    "Jordan was taken off the scheduling/HR system.",
    "Jordan's access was removed from the system.",
    "A note was added to Jordan's account stating Jordan is no longer employed.",
    "Jordan's account has been updated to show Jordan is no longer employed.",
  ])("drops a claim the manager did not make: %s", (claim) => {
    const result = guardExitDetails(`Jordan gave two weeks notice on 9/1. ${claim}`, notes, TODAY);
    expect(result.removed).toEqual([claim]);
    expect(result.value).toBe("Jordan gave two weeks notice on 9/1.");
  });

  it("keeps the manager's own words when the manager raised it", () => {
    const said = "I already removed her from the scheduling system. She gave two weeks notice on 9/1.";
    const result = guardExitDetails("Jordan was removed from the scheduling system.", said, TODAY);
    expect(result.removed).toEqual([]);
  });

  it("leaves an ordinary departure sentence alone", () => {
    const result = guardExitDetails("Jordan gave two weeks notice on 9/1 and worked through the last day.", notes, TODAY);
    expect(result.removed).toEqual([]);
  });
});

describe("the chooser and the template library the chat reads", () => {
  it("every form the chooser offers is named and described without sibling wording", () => {
    for (const seed of TEMPLATE_SEEDS.filter((entry) => offeredInChooser(entry.key))) {
      expectClean(seed.name, `${seed.key} name`);
      expectClean(seed.shortName, `${seed.key} short name`);
      expectClean(seed.description, `${seed.key} description`);
    }
  });

  it("the Tanning Consultant Interview Form is never offered", () => {
    expect(WITHHELD_FROM_CHOOSER).toContain("tanning-consultant-interview");
    expect(offeredInChooser("tanning-consultant-interview")).toBe(false);
  });

  describe("read from the database", () => {
    beforeAll(async () => {
      await ensureTemplateLibrary("system", PRODUCTION);
    });

    it("the row is still in the database (nothing is deleted)…", () => {
      expect(store.form_templates!.some((row) => row.key === "tanning-consultant-interview")).toBe(true);
    });

    it("…but the template list leaves it out, and nothing listed carries sibling wording", async () => {
      const summaries = await listTemplateSummaries();
      expect(summaries.map((summary) => summary.key)).not.toContain("tanning-consultant-interview");
      expect(summaries.length).toBe(TEMPLATE_SEEDS.length - 1);
      for (const summary of summaries) {
        expectClean(summary.name, `${summary.key} name`);
        expectClean(summary.shortName, `${summary.key} short name`);
        expectClean(summary.description, `${summary.key} description`);
      }
    });

    it("the forms library block the model reads is clean", async () => {
      const inventory = buildFormInventory(await listTemplateSummaries(), { role: "location_manager", scope: null });
      expectClean(buildFormInventoryBlock(inventory), "buildFormInventoryBlock");
    });
  });
});
