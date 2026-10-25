import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { caTemplateMapEnabled, CHAT_QUALITY_FLAG_NAMES } from "@/lib/config/chat-quality-flags";
import { detectTemplateIntent } from "@/lib/forms/template-intent";
import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { AccessScope, ChatMessage } from "@/types";

/**
 * QA F4, 24 Oct 2026, exact: "Deterministic layer, raw = null:
 * detectTemplateIntent returns the generic {kind:"corrective_action"} rather
 * than the dpoa template when the request carries a level or no name.
 * "create a Verbal CA for Test Employee…", "create a verbal corrective
 * action…", "write a verbal CA for Team Member…" and "I need a CA for someone
 * opening the store late" all give templateKey null. Live, the model masks
 * this, but it's fragile. Map corrective_action to the published CA template."
 *
 * Ported from Ask Sunny. Ask Bubbles' live form path is the full remap
 * (FORM_FULL_REMAP_ENABLED): the spoken intent makes it a forms turn, then
 * one extraction is grounded on the manager's words. It already reads "CA"
 * as the Corrective Action Form, so those tests pass before the fix and stay
 * as the guard. Its gap was the question: "what does a verbal CA mean?" was
 * a forms turn, and the remap answered it with a Corrective Action Form. The
 * intent read (INTENT_EXTRACTION_ENABLED) is where the slot stayed empty;
 * with the flag on it keeps the same form, and asks the same question, as
 * when the model reads the form. Each case runs with the model reading
 * absent. The two longer turns are the manager's own, 24 Oct
 * 2026. Synthetic people only.
 */

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

process.env.NEXT_PUBLIC_DEMO_MODE = "false";
const { ensureTemplateLibrary, listTemplateSummaries } = await import("@/lib/forms/repository");
const { proposeFormForTurn } = await import("./form-proposal");
const { decideIntentTurn } = await import("./intent-slots");
const { remapFormTurn, remapShouldRun } = await import("./form-full-remap");

const SCOPE: AccessScope = { level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: [] };
const STORES = [{ id: "loc-264", name: "Omaha, NE (West Dodge Rd)" }];
const TODAY = "2026-10-24";

const ACCEPTANCE = [
  "create a Verbal CA for Test Employee",
  "create a verbal corrective action",
  "write a verbal CA for Team Member",
  "I need a CA for someone opening the store late",
  // The manager's turns, 24 Oct 2026.
  "create a verbal CA for team member Testy Testerson at Dodge, NE. location. On 10-16-26 Testy was not properly measuring and weighing product. payroll deduct is not applicable",
  "write a verbal CA for Team Member, Testy Testerson at Dodge, NE. On 10-20-26 Testy was late for shift and did not call supervisor as outlined in attendance policy. payroll deduct is not applicable. previous coaching is JBA Manual 1-1-25",
];

async function activeTemplates() {
  const summaries = await listTemplateSummaries();
  return summaries.filter((row) => row.active).map((row) => ({ key: row.key, name: row.name }));
}

/** What the intent read keeps, as `applyIntentExtraction` hands it the active published templates. */
async function intentTurn(question: string, raw: unknown = null) {
  return decideIntentTurn({
    question,
    history: [],
    today: TODAY,
    saved: null,
    raw,
    people: [],
    stores: STORES,
    headings: ["Attendance", "Late Opening", "Standards of Conduct"],
    templates: await activeTemplates(),
    formInProgress: false,
  });
}

/**
 * server-ask's forms block: the spoken intent, then the remap when it runs,
 * and the form proposal when it does not.
 */
async function liveTurn(question: string) {
  const decision = await intentTurn(question);
  const asked = question;
  const formsTurn = detectTemplateIntent(asked).kind !== "none";
  const remaps = formsTurn && remapShouldRun({ question: asked, history: [], formsTurn });
  const remapped = remaps
    ? await remapFormTurn({ question: asked, history: [], today: TODAY, people: [] }, async () => ({
        raw: null,
        model: "test",
        inputTokens: null,
        outputTokens: null,
      }))
    : null;
  const proposed =
    formsTurn && !remapped
      ? await proposeFormForTurn({
          history: [] as ChatMessage[],
          question: asked,
          questionMessageId: "u1",
          actor: { role: "location_manager" as never, scope: SCOPE },
          summaries: await listTemplateSummaries(),
          today: TODAY,
          policyManual: async () => null,
        })
      : null;
  return { decision, remaps, proposal: (remapped ?? proposed)?.formProposal };
}

beforeEach(async () => {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-24T18:00:00Z"));
  vi.stubEnv("FORM_FULL_REMAP_ENABLED", "true");
  await ensureTemplateLibrary("system");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("CA_TEMPLATE_MAP_ENABLED", () => {
  it("defaults off and is registered", () => {
    expect(caTemplateMapEnabled()).toBe(false);
    expect(CHAT_QUALITY_FLAG_NAMES).toContain("CA_TEMPLATE_MAP_ENABLED");
  });

  it("the Corrective Action Form is published as dpoa", async () => {
    const summaries = await listTemplateSummaries();
    expect(summaries.find((row) => row.key === "dpoa")?.name).toBe("Corrective Action Form");
  });

  it.each(ACCEPTANCE)("on, %s keeps the Corrective Action Form in the intent read and the remap", async (question) => {
    vi.stubEnv("CA_TEMPLATE_MAP_ENABLED", "true");
    const { decision, remaps, proposal } = await liveTurn(question);
    expect(decision.state.templateKey).toBe("dpoa");
    expect(remaps).toBe(true);
    expect(proposal?.templateKey).toBe("dpoa");
    // The same reading the model gives when it names the form: "Live, the model masks this".
    const modelRead = await intentTurn(question, { formType: "dpoa", formTurn: true });
    expect(decision.state.templateKey).toBe(modelRead.state.templateKey);
    expect(decision.clarification).toBe(modelRead.clarification);
  });

  it.each(ACCEPTANCE.slice(0, 4))("off, %s keeps no form in the intent read, as QA found", async (question) => {
    const decision = await intentTurn(question);
    expect(decision.state.templateKey).toBeNull();
  });

  it.each(ACCEPTANCE)("off, the remap already proposes the Corrective Action Form for %s", async (question) => {
    const { proposal } = await liveTurn(question);
    expect(proposal?.templateKey).toBe("dpoa");
  });
});

describe("CA_TEMPLATE_MAP_ENABLED leaves the other readings alone", () => {
  beforeEach(() => {
    vi.stubEnv("CA_TEMPLATE_MAP_ENABLED", "true");
  });

  it("coaching form for Test Employee stays the Coaching Form", async () => {
    const { decision, proposal } = await liveTurn("coaching form for Test Employee");
    expect(decision.state.templateKey).toBe("coaching");
    expect(proposal?.templateKey).toBe("coaching");
  });

  it.each(["what is corrective action?", "Does a verbal CA expire?"])(
    "%s does not run the remap, so nothing is created",
    async (question) => {
      const { remaps, proposal } = await liveTurn(question);
      expect(remaps).toBe(false);
      expect(proposal).toBeUndefined();
    },
  );

  it("what does a verbal CA mean? creates nothing", async () => {
    const { decision, remaps, proposal } = await liveTurn("what does a verbal CA mean?");
    expect(decision.state.templateKey).toBeNull();
    expect(decision.clarification).toBeNull();
    expect(remaps).toBe(false);
    expect(proposal).toBeUndefined();
  });

  it("follow-up coaching stays the Follow-Up Coaching Form", async () => {
    const { decision, proposal } = await liveTurn("follow-up coaching for Test Employee");
    // The intent read keeps no form here, flag on or off; it is not taken as a CA.
    expect(decision.state.templateKey).not.toBe("dpoa");
    expect(proposal?.templateKey).toBe("follow-up-coaching");
  });

  it("a metric on its own stays the progression in the intent read", async () => {
    const decision = await intentTurn("Their sales per hour are low, create a corrective action");
    expect(decision.state.templateKey).toBeNull();
  });
});
