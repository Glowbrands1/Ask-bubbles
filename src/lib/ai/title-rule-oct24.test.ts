import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatFormProposal } from "@/types";

import { groundFormSlots } from "./form-full-remap";
import { EMPTY_CONVERSATION_FORM_STATE, prependFormState, type ConversationFormState } from "./form-state";
import { applyGroundedProposal, type GroundedPerson, type GroundedPrep } from "./grounded-entities";
import { decideIntentTurn, type IntentTurnInput } from "./intent-slots";
import type { AskResponse } from "./types";

/**
 * The job title is a title the manager stated (ported from the sibling app,
 * QA live round 4, 24 Oct 2026; MANAGER_WORDS_ONLY_ENABLED).
 *
 * The four QA turns, with this app's stores and job titles, through every
 * reader that fills the card's Job title here: form-full-remap (live,
 * FORM_FULL_REMAP_ENABLED), the intent read, and grounded entities.
 *
 * 1. A clause the model copied ("test was late opening store") is not a title.
 * 2. "ass't store manager" is the assistant title, not Store Manager.
 * 3. "HR" was never typed ("throught" holds the letters).
 * 4. A pasted Late Opening policy ("Managers or District Managers will be
 *    responsible …") does not make the employee a District Manager.
 */

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({ from: () => ({ insert: async () => ({ error: null }) }) }),
}));

const FLAG = "MANAGER_WORDS_ONLY_ENABLED";
const TODAY = "2026-10-24";
const CA_REPLY = "Here is the Corrective Action Form.";

const CLAUSE_FIRST = "Create a coaching form for a performance concern.";
const CLAUSE = "name is test testy, todays date, bellevue location, test was late opening store";
const ASST = "create coaching form. test testy is ass't store manager. test did not call anyone about opening late";
const HR =
  "Please make me a coaching form for test employee at the kearney location Test did not complete closing duties. Trash was not taken out of the bathrooms, there was no\ntoilet paper in the women's bathroom, and there were no spray towels in the rooms also all the cleaning duties were signed off in the binder and not alll were completed and the way she signed off on the checklist was incorrect she signed one box with a arrown throught the rest each box needs an initial";
// The JBA Policy Manual paragraph as this app indexes it (knowledge_chunks).
const PASTE =
  "When an employee assigned to open a location is unable to open the location at the proper\ntime, the employee must notify the manager as soon as possible. The manager of the salon will\nbe required to open the salon and work until the person originally assigned arrives, or a\nreplacement is found. The employee who failed to open will then be required to reimburse The\nCompany $25.00 via payroll deduction (when applicable and following all state and local\nguidelines), for all expenses incurred. Managers or District Managers will be responsible for\noffering restitution to affected clients, as well as giving the payroll deduct total to Payroll. *";
const PASTE_HISTORY = [
  { role: "user", content: "create a CA form for ima employee, soap maker at kearney, for opening store late on 9-28-26" },
  { role: "assistant", content: CA_REPLY },
  { role: "user", content: "this should be a written and note a verbal ca was given on 9-1-26" },
  { role: "assistant", content: CA_REPLY },
];
const PASTE_SAVED = {
  employeeName: "ima employee",
  title: "soap maker",
  locationId: "loc-66",
  formDate: "2026-09-28",
  warningLevel: "written" as const,
  templateKey: "dpoa",
};

const STORES = [
  { id: "loc-66", name: "Kearney, NE" },
  { id: "loc-236", name: "Grand Island, NE" },
] as const;

beforeEach(() => {
  vi.stubEnv("FORM_FULL_REMAP_ENABLED", "1");
  vi.stubEnv("ANTI_LOOP_ENABLED", "1");
  vi.stubEnv("TYPED_NAME_ENABLED", "1");
  vi.stubEnv(FLAG, "1");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function state(over: Partial<ConversationFormState>): ConversationFormState {
  return { ...EMPTY_CONVERSATION_FORM_STATE, ...over };
}

function person(id: string, first: string, title: string): GroundedPerson {
  return { id, firstName: first, lastName: "Example", locationIds: ["loc-66"], title, primaryLocationName: "Kearney, NE" };
}

const ROSTER = [person("emp-pat", "Pat", "District Manager"), person("emp-sam", "Sam", "Store Manager")];

function turn(overrides: Partial<IntentTurnInput>): IntentTurnInput {
  return {
    question: "",
    history: [],
    today: TODAY,
    saved: null,
    raw: null,
    people: ROSTER,
    stores: STORES,
    headings: ["Late Opening", "Attendance"],
    templates: [
      { key: "dpoa", name: "Corrective Action Form" },
      { key: "coaching", name: "Coaching Form" },
    ],
    formInProgress: false,
    ...overrides,
  };
}

function remap(input: { question: string; history?: { role: string; content: string }[]; raw?: Record<string, unknown> }) {
  return groundFormSlots({
    raw: { templateKey: "dpoa", observation: null, actionPlan: null, ...(input.raw ?? {}) },
    history: input.history ?? [],
    question: input.question,
    today: TODAY,
    people: [],
  });
}

function card(over: Partial<ChatFormProposal>): ChatFormProposal {
  return {
    proposalId: "p-1",
    templateKey: "dpoa",
    templateName: "Corrective Action Form",
    supportsInlineDraft: false,
    variantKey: null,
    employeeName: null,
    employeeRole: null,
    employeeRoleSource: null,
    formDate: null,
    incidentTime: null,
    payrollDeduct: null,
    warningLevel: null,
    issue: null,
    priorActions: null,
    locationId: "loc-66",
    locationName: "Kearney, NE",
    locationResolution: "resolved",
    authorizedLocationIds: ["loc-66"],
    status: "ready",
    sourceMessageIds: [],
    ...over,
  } as ChatFormProposal;
}

function grounded(question: string, proposal: ChatFormProposal): ChatFormProposal | null | undefined {
  const prep: GroundedPrep = {
    question,
    rosterIds: null,
    keptTypedNames: [],
    unmatched: [],
    ambiguous: [],
    ambiguousTyped: null,
    keptTypedName: null,
    employeeId: null,
  };
  const response: AskResponse = { content: CA_REPLY, citations: [], formProposal: proposal } as AskResponse;
  return applyGroundedProposal(response, { people: ROSTER, prep, rosterEmpty: false }).formProposal;
}

describe("1. name is test testy, todays date, bellevue location, test was late opening store", () => {
  const history = [
    { role: "user", content: CLAUSE_FIRST },
    { role: "assistant", content: CA_REPLY },
  ];

  it("remap: no title, and the card and reply print none", () => {
    const sent = prependFormState(CLAUSE, state({ employeeName: "test testy", title: "test was late opening store", formDate: TODAY }));
    for (const text of [CLAUSE, sent]) {
      const { slots, response } = remap({ question: text, history, raw: { employeeName: "test testy", jobTitle: "test was late opening store" } });
      expect(slots.jobTitle).toBeNull();
      expect(response.formProposal?.employeeRole ?? null).toBeNull();
      expect(response.content).not.toMatch(/Job title:/);
    }
  });

  it("intent: the model's clause is not kept as the title", () => {
    const decision = decideIntentTurn(
      turn({
        question: CLAUSE,
        history,
        saved: state({ templateKey: "dpoa", policyHeading: "Late Opening", policyPage: 15 }),
        raw: { employee: "test testy", title: "test was late opening store", formTurn: true, policyHeading: "Late Opening" },
      }),
    );
    expect(decision.state.title).toBeNull();
    expect(decision.question).not.toMatch(/Job title:/);
  });
});

describe("2. create coaching form. test testy is ass't store manager. test did not call anyone about opening late", () => {
  it("remap: Assistant Manager on the card", () => {
    const { slots, response } = remap({ question: ASST, raw: { templateKey: "coaching", employeeName: "test testy" } });
    expect(slots.jobTitle).toBe("Assistant Manager");
    expect(response.formProposal?.employeeRole).toBe("Assistant Manager");
  });

  it("intent: Assistant Manager, also when the roster lists a Store Manager", () => {
    for (const people of [ROSTER, []]) {
      const decision = decideIntentTurn(
        turn({
          question: ASST,
          people,
          saved: state({ employeeName: "test testy", templateKey: "coaching", formDate: TODAY }),
          raw: { employee: "test testy", title: "ass't store manager", formTurn: true },
        }),
      );
      expect(decision.state.title).toBe("Assistant Manager");
    }
  });

  it("grounded entities: the card's title is Assistant Manager", () => {
    const sent = prependFormState(ASST, state({ employeeName: "test testy", templateKey: "coaching" }));
    const proposal = grounded(sent, card({ templateKey: "coaching", templateName: "Coaching Form", employeeName: "test testy" }));
    expect(proposal?.employeeRole).toBe("Assistant Manager");
  });
});

describe("3. Please make me a coaching form for test employee at the kearney location … (\"HR\" was never typed)", () => {
  it("remap: no title", () => {
    const sent = prependFormState(HR, state({ employeeName: "test employee", title: "HR", locationId: "loc-66" }));
    for (const text of [HR, sent]) {
      const { slots, response } = remap({ question: text, raw: { templateKey: "coaching", employeeName: "test employee", jobTitle: "HR" } });
      expect(slots.jobTitle).toBeNull();
      expect(response.formProposal?.employeeRole ?? "").not.toMatch(/HR|It happened/);
    }
  });

  it("intent: the model's HR is not kept", () => {
    const decision = decideIntentTurn(turn({ question: HR, raw: { employee: "test employee", title: "HR", store: "kearney", formTurn: true } }));
    expect(decision.state.title).toBeNull();
  });

  it("grounded entities: the title is not \"HR. It happened\"", () => {
    const sent = prependFormState(HR, state({ employeeName: "test employee", title: "HR", locationId: "loc-66", templateKey: "coaching" }));
    expect(sent).toContain("Job title: HR. It happened at");
    const proposal = grounded(sent, card({ templateKey: "coaching", templateName: "Coaching Form", employeeName: "test employee" }));
    expect(proposal?.employeeRole ?? "").not.toMatch(/It happened/i);
  });
});

describe("4. a pasted Late Opening policy does not make ima employee a District Manager", () => {
  it("remap: the title stays Soap Maker", () => {
    const { slots, response } = remap({ question: PASTE, history: PASTE_HISTORY, raw: { employeeName: "ima employee" } });
    expect(slots.jobTitle).toBe("Soap Maker");
    expect(response.formProposal?.employeeRole).toBe("Soap Maker");
  });

  it("intent: the title the manager stated stays", () => {
    const decision = decideIntentTurn(turn({ question: PASTE, history: PASTE_HISTORY, saved: state(PASTE_SAVED), raw: { formTurn: true } }));
    // "soap maker at kearney" in the manager's first turn, in this app's wording.
    expect(decision.state.title).toBe("Soap Maker");
  });

  it("grounded entities: the saved title line is read, not the paste", () => {
    const sent = prependFormState(PASTE, state(PASTE_SAVED));
    const proposal = grounded(sent, card({ employeeName: "ima employee", employeeRole: "soap maker" }));
    expect(proposal?.employeeRole).toBe("Soap Maker");
  });
});

describe("flag off: every reader as main has it", () => {
  beforeEach(() => {
    vi.stubEnv(FLAG, "");
  });

  it("ass't store manager still reads Store Manager", () => {
    expect(remap({ question: ASST, raw: { templateKey: "coaching", employeeName: "test testy" } }).slots.jobTitle).toBe("Store Manager");
    const decision = decideIntentTurn(
      turn({ question: ASST, raw: { employee: "test testy", title: "ass't store manager", formTurn: true } }),
    );
    expect(decision.state.title).toBe("Store Manager");
    const sent = prependFormState(ASST, state({ employeeName: "test testy", templateKey: "coaching" }));
    expect(grounded(sent, card({ templateKey: "coaching", employeeName: "test testy" }))?.employeeRole).toBe("Store Manager");
  });

  it("a pasted policy still reads District Manager", () => {
    expect(remap({ question: PASTE, history: PASTE_HISTORY, raw: { employeeName: "ima employee" } }).slots.jobTitle).toBe(
      "District Manager",
    );
    const decision = decideIntentTurn(turn({ question: PASTE, history: PASTE_HISTORY, saved: state(PASTE_SAVED), raw: { formTurn: true } }));
    expect(decision.state.title).toBe("District Manager");
    const sent = prependFormState(PASTE, state(PASTE_SAVED));
    expect(grounded(sent, card({ employeeName: "ima employee", employeeRole: "soap maker" }))?.employeeRole).toBe("District Manager");
  });
});
