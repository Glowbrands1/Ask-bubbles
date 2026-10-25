import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { AccessScope, ChatMessage } from "@/types";
import { rosterResultFor } from "@/test/roster-result";

/**
 * FORM_CHOICE_STATED_ENABLED, ported from Ask Sunny. Low-rated Ask Sunny
 * chats, 24 Oct 2026 (QA rounds 4 and 5): "Create a coaching form …",
 * "Can you make coaching work sheets for the team ?" and "Create a Policy
 * Review" became a Corrective Action Form; "create a Verbal CA … woven
 * deadline" cited Disciplinary Action. The manager's requests keep their
 * words; the store, title and incident details are this app's. Each case runs
 * through both of this app's paths: the full remap (on in production) and the
 * intent read followed by the proposal.
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
const state = vi.hoisted(() => ({ directory: [] as unknown[] }));

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: () => fakeSupabase(store) }));
vi.mock("@/lib/forms/employee-roster", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/forms/employee-roster")>();
  return {
    ...actual,
    loadScopedRoster: async (scope: AccessScope | null) => actual.scopeRoster(state.directory as never, scope),
    loadScopedRosterResult: async (scope: AccessScope | null) =>
      rosterResultFor(actual.scopeRoster, state.directory as never, scope),
  };
});

process.env.NEXT_PUBLIC_DEMO_MODE = "false";
const { ensureTemplateLibrary, listTemplateSummaries } = await import("@/lib/forms/repository");
const { proposeFormForTurn } = await import("./form-proposal");
const { decideIntentTurn } = await import("./intent-slots");
const { groundFormSlots } = await import("./form-full-remap");
const { detectTemplateIntent } = await import("@/lib/forms/template-intent");
const { formChoiceStatedEnabled } = await import("@/lib/config/chat-quality-flags");
const { COMPANY_LOCATIONS } = await import("@/lib/locations");
const { EMPTY_CONVERSATION_FORM_STATE } = await import("./form-state");
type ConversationFormState = import("./form-state").ConversationFormState;

const TODAY = "2026-10-24";
const SCOPE: AccessScope = { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: [] };
const STORES = COMPANY_LOCATIONS.map((location) => ({ id: location.id, name: location.name }));
const HEADINGS = ["Attendance", "Late Opening", "Standards of Conduct", "Disciplinary Action", "Cell Phone/Smart Watch Policy"];

interface LiveTurn {
  readonly question: string;
  /** What the intent tool returned for this turn. */
  readonly intent: Record<string, unknown>;
  /** What the remap tool returned for this turn. */
  readonly remap: Record<string, unknown>;
}

/**
 * The intent read, then the proposal, turn by turn, with the open card's
 * template as the browser sends it. A turn the intent read answers with
 * "I still need …" gets no card in this app (server-ask returns the
 * clarification), so that turn's form is the one the stored state collects.
 */
async function intentPath(turns: readonly LiveTurn[], replies: readonly string[], start: ConversationFormState | null = null) {
  const summaries = await listTemplateSummaries();
  const templates = summaries.filter((row) => row.active).map((row) => ({ key: row.key, name: row.name }));
  const messages: ChatMessage[] = [];
  const keys: (string | null)[] = [];
  const clarifications: (string | null)[] = [];
  let saved = start;
  let open: string | undefined;
  for (const [at, turn] of turns.entries()) {
    const decision = decideIntentTurn({
      question: turn.question,
      history: messages,
      today: TODAY,
      saved,
      raw: turn.intent,
      people: [],
      stores: STORES,
      headings: HEADINGS,
      templates,
      formInProgress: Boolean(saved?.templateKey || open),
    });
    saved = decision.state;
    const response = decision.clarification
      ? null
      : await proposeFormForTurn({
          history: messages,
          question: decision.question,
          questionMessageId: `u${at}`,
          actor: { role: "location_manager" as never, scope: SCOPE },
          summaries,
          today: TODAY,
          policyManual: async () => null,
          ...(open ? { continueTemplateKey: open } : {}),
        });
    const key = response?.formProposal?.templateKey ?? null;
    keys.push(key ?? (decision.clarification ? decision.state.templateKey : null));
    clarifications.push(decision.clarification);
    if (key) open = key;
    messages.push(
      { id: `u${at}`, role: "user", content: turn.question, createdAt: "2026-10-24T18:00:00Z" } as ChatMessage,
      { id: `a${at}`, role: "assistant", content: replies[at] ?? response?.content ?? "", createdAt: "2026-10-24T18:00:01Z" } as ChatMessage,
    );
  }
  return { keys, saved, clarifications };
}

/** The full remap, turn by turn, as production runs it. */
function remapPath(turns: readonly LiveTurn[], replies: readonly string[]) {
  const history: { role: string; content: string }[] = [];
  const keys: (string | null)[] = [];
  const contents: string[] = [];
  let open: string | null = null;
  let saved: Record<string, unknown> | null = null;
  for (const [at, turn] of turns.entries()) {
    const { slots, response } = groundFormSlots({
      raw: turn.remap,
      history,
      question: turn.question,
      today: TODAY,
      people: [],
      continueTemplateKey: open,
      saved: saved as never,
    });
    const key = response.formProposal?.templateKey ?? null;
    keys.push(key);
    contents.push(response.content);
    if (key) open = key;
    saved = slots as never;
    history.push({ role: "user", content: turn.question }, { role: "assistant", content: replies[at] ?? response.content });
  }
  return { keys, contents };
}

function storedState(): ConversationFormState {
  return { ...EMPTY_CONVERSATION_FORM_STATE };
}

const CA_REPLY =
  "I'll draft a **Corrective Action Form** for **test testy** from what you've described, and check the applicable company policy before anything policy-related goes on it.\n\n**Policy:** Late Opening, as you said.\n\nOne more question: **Is payroll deduct applicable?** Yes or No?\n\nDisciplinary Action Policy, JBA Policy Manual p.14";

/* conv_mvmvl6jy23nwuuk, in this app's words */
const CLOSING_DUTIES =
  "Please make me a coaching form for test employee at the kearney location Test did not complete closing duties. Trash was not taken out of the bathrooms, there was no paper towels at the sinks, and all the cleaning duties were signed off in the binder and not alll were completed and the way she signed off on the checklist was incorrect she signed one box with a arrown throught the rest each box needs an initial";
const TEAM_WORKSHEETS = "Can you make coaching work sheets for the team ? on closing duties at night ?";
const CLOSING_TURNS: LiveTurn[] = [
  {
    question: CLOSING_DUTIES,
    intent: { employee: "test employee", store: "kearney", incidentType: "did not complete closing duties", formType: "coaching form", formTurn: true },
    remap: { templateKey: "dpoa", employeeName: "test employee", store: "Kearney", observation: "Did not complete closing duties." },
  },
  {
    question: TEAM_WORKSHEETS,
    intent: { employee: "test employee", formType: "Corrective Action Form", formTurn: true },
    remap: { templateKey: "dpoa", employeeName: "test employee", observation: "Closing duties." },
  },
];

/* conv_mvmw1ccu2t7y3bi, in this app's words */
const PERFORMANCE_CONCERN = "Create a coaching form for a performance concern.";
const LATE_OPENING = "name is test testy, todays date, kearney location, test was late opening the store";
const DID_NOT_CALL = "create coaching form. test testy is assistant store manager. test did not call anyone about opening late";
const USE_TODAY = "name is test testy and use todays date to create coaching form";
const FROM_CONVERSATION = "Create a form from this conversation.";
const PERFORMANCE_TURNS: LiveTurn[] = [
  {
    question: PERFORMANCE_CONCERN,
    intent: { incidentType: "performance concern", formType: "coaching form", formTurn: true },
    remap: { templateKey: "coaching", observation: "Performance concern." },
  },
  {
    question: LATE_OPENING,
    intent: { employee: "test testy", store: "kearney", incidentType: "late opening the store", incidentDate: "todays date", formType: "Corrective Action Form", formTurn: true },
    remap: { templateKey: "dpoa", employeeName: "test testy", store: "Kearney", useToday: true, observation: "Late opening the store." },
  },
  {
    question: DID_NOT_CALL,
    intent: { employee: "test testy", title: "assistant store manager", incidentType: "did not call anyone about opening late", formType: null, formTurn: true },
    remap: { templateKey: "dpoa", employeeName: "test testy", jobTitle: "assistant store manager", observation: "Did not call anyone about opening late." },
  },
  {
    question: USE_TODAY,
    intent: { employee: "test testy", incidentDate: "todays date", formType: null, formTurn: true },
    remap: { templateKey: "dpoa", employeeName: "test testy", useToday: true },
  },
  {
    question: FROM_CONVERSATION,
    intent: { employee: "test testy", formType: null, formTurn: true },
    remap: { templateKey: "dpoa", employeeName: "test testy" },
  },
];
const PERFORMANCE_REPLIES = [
  "Great, I can help you create a **Corrective Action Form**. To get started, please provide me with these details: the employee's full name, the date, and what happened.",
  CA_REPLY,
  CA_REPLY,
  CA_REPLY,
];

/* conv_mvmyba3d2ojmzuf, in this app's words */
const CELL_PHONE = "Test Employee at Kearney used her cell phone on the sales floor on 10-17";
const POLICY_REVIEW_TURNS: LiveTurn[] = [
  {
    question: CELL_PHONE,
    intent: { employee: "Test Employee", store: "Kearney", incidentType: "used her cell phone on the sales floor", incidentDate: "10-17", formType: null, formTurn: false },
    remap: { templateKey: null, employeeName: "Test Employee", store: "Kearney", observation: "Used her cell phone on the sales floor." },
  },
  {
    question: "Create a Policy Review",
    intent: { employee: "Test Employee", formType: null, formTurn: true },
    remap: { templateKey: "dpoa", employeeName: "Test Employee", store: "Kearney" },
  },
];
const CELL_PHONE_REPLY =
  "That's what decides whether this is a documented coaching conversation, a policy review, or a formal corrective step. You have four Corrective Action Form drafts for Test Employee sitting unfinalized. When you know which way you're going, ask me — for example \"create a policy review for Test Employee\" or \"edit the corrective action form for Test Employee\".";

/* conv_mvmyqvkq2zwzrln */
const WOVEN_DEADLINE = "create a Verbal CA for Test Employee for missing the 10-15-26 woven deadline";
const WOVEN: LiveTurn = {
  question: WOVEN_DEADLINE,
  intent: { employee: "Test Employee", incidentType: "missing the woven deadline", incidentDate: "10-15-26", warningLevel: "verbal", formType: "Verbal CA", formTurn: true },
  remap: { templateKey: "dpoa", employeeName: "Test Employee", warningLevel: "verbal", policySection: "Disciplinary Action", observation: "Missed the woven deadline." },
};

const AFTER_LATE_OPENING: LiveTurn = {
  question: "Create a Coaching Form",
  intent: { employee: "test testy", formType: null, formTurn: true },
  remap: { templateKey: "dpoa", employeeName: "test testy" },
};
const CREATE_CA: LiveTurn = {
  question: "create a CA",
  intent: { formType: "CA", formTurn: true },
  remap: { templateKey: "dpoa" },
};

/*
 * Ask Sunny conv_mvnbbhdq2a8t7nk (QA, 25 Oct 2026), in this app's words: the
 * follow-up card came up with no earlier coaching mentioned. The model reads
 * "follow-up-coaching", as the bad run's did.
 */
const FOLLOW_UP_CARD = "Here is the Follow-Up Coaching Form.\n**Employee:** Test Employee";
const COACH_TURNS: LiveTurn[] = [
  {
    question: "I need to coach an employee",
    intent: { formType: null, formTurn: true },
    remap: { templateKey: null },
  },
  {
    question: "Her name is Test Employee",
    intent: { employee: "Test Employee", formType: "follow-up-coaching", formTurn: true },
    remap: { templateKey: "follow-up-coaching", employeeName: "Test Employee" },
  },
  {
    question: "She works at Kearney",
    intent: { employee: "Test Employee", store: "Kearney", formType: "follow-up-coaching", formTurn: true },
    remap: { templateKey: "follow-up-coaching", employeeName: "Test Employee", store: "Kearney" },
  },
  {
    question: "It happened on 10-21",
    intent: { employee: "Test Employee", incidentDate: "10-21", formType: "follow-up-coaching", formTurn: true },
    remap: { templateKey: "follow-up-coaching", employeeName: "Test Employee" },
  },
  {
    question: "She was on her cell phone for 30+ minutes at the register",
    intent: { employee: "Test Employee", incidentType: "on her cell phone for 30+ minutes at the register", formType: "follow-up-coaching", formTurn: true },
    remap: { templateKey: "follow-up-coaching", employeeName: "Test Employee", observation: "On her cell phone for 30+ minutes at the register." },
  },
];
const COACH_REPLIES = [
  "Happy to help with that. Tell me who, what you saw or heard, and any history. The progression runs observation → coaching → role play → follow-up coaching before anything formal. When you're ready for the paperwork, ask me to create a coaching form for them.",
  FOLLOW_UP_CARD,
  FOLLOW_UP_CARD,
  FOLLOW_UP_CARD,
];
const EARLIER: LiveTurn = {
  question: "Her name is Test Employee, I coached her on 10-1 about her phone",
  intent: { employee: "Test Employee", formType: "follow-up-coaching", formTurn: true },
  remap: { templateKey: "follow-up-coaching", employeeName: "Test Employee" },
};

beforeEach(async () => {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  state.directory = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-24T18:00:00Z"));
  await ensureTemplateLibrary("system");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("FORM_CHOICE_STATED_ENABLED: the form the manager named wins (ported from Ask Sunny)", () => {
  it("defaults off", () => {
    expect(formChoiceStatedEnabled()).toBe(false);
  });

  it("the library has no worksheet template, so a team coaching sheet is the Coaching Form", async () => {
    const names = (await listTemplateSummaries()).map((row) => row.name);
    expect(names.some((name) => /work\s?sheet/i.test(name))).toBe(false);
  });

  describe("full remap (production path)", () => {
    beforeEach(() => vi.stubEnv("FORM_CHOICE_STATED_ENABLED", "true"));

    it("conv_mvmvl6jy23nwuuk: the coaching form and the team coaching worksheets are the Coaching Form", () => {
      expect(remapPath(CLOSING_TURNS, [CA_REPLY]).keys).toEqual(["coaching", "coaching"]);
    });

    it("conv_mvmw1ccu2t7y3bi: every coaching turn stays the Coaching Form", () => {
      expect(remapPath(PERFORMANCE_TURNS, PERFORMANCE_REPLIES).keys).toEqual(["coaching", "coaching", "coaching", "coaching", "coaching"]);
    });

    it('"Create a Coaching Form" after a late opening is the Coaching Form', () => {
      const { keys } = remapPath([PERFORMANCE_TURNS[1]!, AFTER_LATE_OPENING], [CA_REPLY]);
      expect(keys).toEqual(["dpoa", "coaching"]);
    });

    it("a team worksheet request on its own is the Coaching Form", () => {
      expect(remapPath([{ ...CLOSING_TURNS[1]!, remap: { templateKey: null } }], []).keys).toEqual(["coaching"]);
    });

    it('conv_mvmyba3d2ojmzuf: "Create a Policy Review" is the Policy Review', () => {
      expect(remapPath(POLICY_REVIEW_TURNS, [CELL_PHONE_REPLY]).keys[1]).toBe("policy-review");
    });

    it('"create a CA" is the Corrective Action Form, fresh and after a coaching form', () => {
      expect(remapPath([CREATE_CA], []).keys).toEqual(["dpoa"]);
      expect(remapPath([PERFORMANCE_TURNS[0]!, CREATE_CA], []).keys).toEqual(["coaching", "dpoa"]);
      expect(remapPath([WOVEN], []).keys).toEqual(["dpoa"]);
    });

    it("no earlier coaching mentioned is the Coaching Form, not the follow-up", () => {
      expect(remapPath(COACH_TURNS, COACH_REPLIES).keys.slice(1)).toEqual(["coaching", "coaching", "coaching", "coaching"]);
    });

    it("a follow-up the manager mentions is still the Follow-Up Coaching Form", () => {
      expect(remapPath([COACH_TURNS[0]!, EARLIER], COACH_REPLIES).keys[1]).toBe("follow-up-coaching");
    });

    it("conv_mvmyqvkq2zwzrln: the reply names no Disciplinary Action policy and cites no source", () => {
      const { slots, response } = groundFormSlots({ raw: WOVEN.remap, history: [], question: WOVEN.question, today: TODAY, people: [] });
      expect(slots.policySection).not.toBe("Disciplinary Action");
      expect(response.content).not.toMatch(/Disciplinary Action/);
      expect(response.citations).toEqual([]);
    });
  });

  describe("intent read, then the proposal", () => {
    beforeEach(() => vi.stubEnv("FORM_CHOICE_STATED_ENABLED", "true"));

    it("conv_mvmvl6jy23nwuuk: the coaching form and the team coaching worksheets are the Coaching Form", async () => {
      const { keys, saved } = await intentPath(CLOSING_TURNS, [CA_REPLY]);
      expect(keys).toEqual(["coaching", "coaching"]);
      expect(saved?.templateKey).toBe("coaching");
    });

    it("conv_mvmw1ccu2t7y3bi: every coaching turn stays the Coaching Form", async () => {
      const { keys, saved } = await intentPath(PERFORMANCE_TURNS, PERFORMANCE_REPLIES);
      expect(keys).toEqual(["coaching", "coaching", "coaching", "coaching", "coaching"]);
      expect(saved?.templateKey).toBe("coaching");
    });

    it('"Create a Coaching Form" after a late opening is the Coaching Form', async () => {
      // The late-opening conversation already holds a Corrective Action.
      const { keys } = await intentPath([PERFORMANCE_TURNS[1]!, AFTER_LATE_OPENING], [CA_REPLY], {
        ...storedState(),
        templateKey: "dpoa",
      });
      expect(keys).toEqual(["dpoa", "coaching"]);
    });

    it("a team worksheet request on its own is the Coaching Form", async () => {
      const { keys } = await intentPath([{ ...CLOSING_TURNS[1]!, intent: { formType: null, formTurn: true } }], []);
      expect(keys).toEqual(["coaching"]);
    });

    it('conv_mvmyba3d2ojmzuf: "Create a Policy Review" is the Policy Review', async () => {
      const { keys, saved } = await intentPath(POLICY_REVIEW_TURNS, [CELL_PHONE_REPLY]);
      expect(keys[1]).toBe("policy-review");
      expect(saved?.templateKey).toBe("policy-review");
    });

    it('"create a CA" is the Corrective Action Form, fresh and after a coaching form', async () => {
      expect((await intentPath([CREATE_CA], [])).saved?.templateKey).toBe("dpoa");
      const after = await intentPath([PERFORMANCE_TURNS[0]!, CREATE_CA], ["Here is what I would put on a **Coaching Form**."]);
      expect(after.saved?.templateKey).toBe("dpoa");
      expect(after.keys[1]).toBe("dpoa");
      expect((await intentPath([WOVEN], [])).keys).toEqual(["dpoa"]);
    });

    it("a stored Disciplinary Action policy does not turn a coaching request into a Corrective Action", async () => {
      const stored = { ...storedState(), employeeName: "test testy", policyHeading: "Disciplinary Action", policyPage: 14 };
      const { keys, saved } = await intentPath([PERFORMANCE_TURNS[0]!], [], stored);
      expect(keys).toEqual(["coaching"]);
      expect(saved?.policyHeading).toBeNull();
    });

    it("no earlier coaching mentioned is the Coaching Form, not the follow-up", async () => {
      const { keys, saved } = await intentPath(COACH_TURNS, COACH_REPLIES);
      expect(keys.slice(1)).toEqual(["coaching", "coaching", "coaching", "coaching"]);
      expect(saved?.templateKey).toBe("coaching");
    });

    it("a follow-up the manager mentions is still the Follow-Up Coaching Form", async () => {
      const { saved } = await intentPath([COACH_TURNS[0]!, EARLIER], COACH_REPLIES);
      expect(saved?.templateKey).toBe("follow-up-coaching");
    });

    it("a Policy reference line names no form", () => {
      expect(
        detectTemplateIntent(`Policy reference: Disciplinary Action, JBA Policy Manual p.14.\n${PERFORMANCE_CONCERN}`),
      ).toEqual({ kind: "explicit", templateKey: "coaching" });
      expect(detectTemplateIntent("Policy reference: Disciplinary Action, JBA Policy Manual p.14.")).toEqual({ kind: "none" });
    });
  });

  describe("off, as before", () => {
    it("the intent read took the form from the assistant's Corrective Action Form", async () => {
      const { keys } = await intentPath(PERFORMANCE_TURNS, PERFORMANCE_REPLIES);
      expect(keys.slice(1)).toContain("dpoa");
    });

    it("the remap and the intent read gave the follow-up card with no earlier coaching mentioned", async () => {
      expect(remapPath(COACH_TURNS, COACH_REPLIES).keys.slice(1)).toEqual([
        "follow-up-coaching",
        "follow-up-coaching",
        "follow-up-coaching",
        "follow-up-coaching",
      ]);
      expect((await intentPath(COACH_TURNS, COACH_REPLIES)).saved?.templateKey).toBe("follow-up-coaching");
    });

    it("a stored Disciplinary Action line made a coaching request a Corrective Action", () => {
      expect(
        detectTemplateIntent(`Policy reference: Disciplinary Action, JBA Policy Manual p.14.\n${PERFORMANCE_CONCERN}`),
      ).toEqual({ kind: "explicit", templateKey: "dpoa" });
    });
  });
});
