import { beforeAll, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { ChatFormProposal } from "@/types";

import { HIDDEN_TEMPLATE_KEYS } from "@/config/company/forms/hidden";
import { buildFormInventoryBlock } from "@/lib/ai/form-answers";
import { proposeFormForTurn } from "@/lib/ai/form-proposal";

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
 * and to "verify tanning has been removed"; the chat said the draft would not
 * "remove anyone from MyGlow"; and the Tanning Consultant Interview and both
 * management interviews were still in the template library the chat reads.
 *
 * Pau's answers (via QA, same day): Buff City Soap uses Sunlync too, so the
 * Sunlync step and mentions stay, without the tanning clause. MyGlow is not
 * confirmed, so it reads "the scheduling/HR system" until it is
 * (`config/company/forms/exit-systems.ts`). The three interviews are hidden.
 *
 * Every string below is the exported text or a builder's real output — not a
 * grep of the source — so a word that reaches a manager through a template
 * literal, a seed or a builder is caught here.
 */
/* Sunlync is NOT here: Buff City Soap uses it (Pau, via QA, 25 Oct 2026). */
const SIBLING_WORDING = /myglow|my\s+glow|tanning|sun\s*tan\s*city/i;

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

  it("keeps Sunlync, drops the tanning clause, and names the unconfirmed system neutrally", () => {
    expect(steps).toEqual([
      "Upload Exit Form to employee’s personal file and remove employee from the scheduling/HR system.",
      "Notify home office of employee’s final date of employment for HR, Payroll, and Security System purposes.",
      "Place comment on employee’s Sunlync account stating they are no longer employed.",
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
    expect(EXIT_DOES_NOT_ACT).toMatch(/doesn't sign anything, remove anyone from the scheduling\/HR system, change payroll or update Sunlync —/);
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
    expect(EXIT_DRAFT_RULES.join(" ")).toMatch(
      /removing the employee from the scheduling\/HR system, notifying the home office, HR, payroll or security, or commenting on Sunlync\./,
    );
  });

  /*
   * THE GUARD STAYS, AND WIDENS. It still drops a sentence claiming the old
   * system names (a model can echo them from anywhere), and now also drops a
   * sentence claiming the employee was taken off any system or that anybody
   * commented on their Sunlync (or any) account: Ask Bubbles never does either.
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
    "Bubbles commented on Jordan's Sunlync account.",
    "The manager commented on their Sunlync account that Jordan is no longer employed.",
    "Jordan's Sunlync account was commented on.",
  ])("drops a claim the manager did not make: %s", (claim) => {
    const result = guardExitDetails(`Jordan gave two weeks notice on 9/1. ${claim}`, notes, TODAY);
    expect(result.removed).toEqual([claim]);
    expect(result.value).toBe("Jordan gave two weeks notice on 9/1.");
  });

  it("still drops a Sunlync or system claim when the manager only mentioned the home office", () => {
    const said = "Jordan gave two weeks notice on 9/1. I'll call the home office tomorrow.";
    for (const claim of ["A comment was placed on Jordan's Sunlync account.", "Jordan was removed from the scheduling system."]) {
      expect(guardExitDetails(claim, said, TODAY).removed).toEqual([claim]);
    }
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

  const HIDDEN = ["tanning-consultant-interview", "management-interview-round-1", "management-interview-round-2"];

  it("the Tanning Consultant Interview and both management interviews are hidden and never offered", () => {
    expect([...HIDDEN_TEMPLATE_KEYS].sort()).toEqual([...HIDDEN].sort());
    for (const key of HIDDEN) {
      expect(WITHHELD_FROM_CHOOSER).toContain(key);
      expect(offeredInChooser(key)).toBe(false);
    }
  });

  describe("read from the database", () => {
    beforeAll(async () => {
      await ensureTemplateLibrary("system", PRODUCTION);
    });

    it("the rows are still in the database (nothing is deleted)…", () => {
      for (const key of HIDDEN) expect(store.form_templates!.some((row) => row.key === key && row.active === true), key).toBe(true);
    });

    it("…but the template list leaves them out, and nothing listed carries sibling wording", async () => {
      const summaries = await listTemplateSummaries();
      for (const key of HIDDEN) expect(summaries.map((summary) => summary.key)).not.toContain(key);
      expect(summaries.length).toBe(TEMPLATE_SEEDS.length - HIDDEN.length);
      for (const summary of summaries) {
        expectClean(summary.name, `${summary.key} name`);
        expectClean(summary.shortName, `${summary.key} short name`);
        expectClean(summary.description, `${summary.key} description`);
      }
    });

    it("the forms library block the model reads is clean and names none of them", async () => {
      const inventory = buildFormInventory(await listTemplateSummaries(), { role: "location_manager", scope: null });
      const block = buildFormInventoryBlock(inventory);
      expectClean(block, "buildFormInventoryBlock");
      // The Prescreen / Phone Interview Form is not hidden and still listed; these three are not.
      expect(block).not.toMatch(/Tanning Consultant Interview|Round Management Interview/);
    });

    /* Asked for by name in chat: the honest "not published" answer, no proposal card. */
    it.each([
      "Create a tanning consultant interview form for Jordan Testperson.",
      "TC interview for Sam Rivera",
      "Create a first round management interview form for Jordan Testperson.",
      "Create a second round management interview form for Jordan Testperson.",
    ])("is not reachable by name: %s", async (question) => {
      const reply = await proposeFormForTurn({
        history: [],
        question,
        questionMessageId: "m-1",
        actor: { role: "location_manager", scope: { level: "location", primaryAreaId: "loc-0310", alsoCoversAreaIds: [] } as never },
        summaries: await listTemplateSummaries(),
        today: TODAY,
      });
      expect(reply?.formProposal, reply?.content).toBeUndefined();
      expect(reply?.content).toMatch(/not published in Ask Bubbles/);
      expectClean(reply?.content ?? "", "reply");
      expect(reply?.content).not.toMatch(/Tanning Consultant Interview|Round Management Interview/);
    });
  });
});
