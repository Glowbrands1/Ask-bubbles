import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RosterEmployee } from "@/lib/forms/employee-match";

import { appSentencesOnePerLine, isAppLine, withoutAppLines } from "./app-sentences";
import { groundFormSlots } from "./form-full-remap";
import { EMPTY_CONVERSATION_FORM_STATE, prependFormState, type ConversationFormState } from "./form-state";
import type { GroundedPerson } from "./grounded-entities";
import { decideIntentTurn, type IntentTurnInput } from "./intent-slots";

/**
 * The app's own lines are not the manager's words (ported from Ask Sunny,
 * 24 Oct 2026).
 *
 * Form state, intake augmentation and grounded entities write lines such as
 * "The employee is Test Employee. Job title: CA. It happened at Kearney, NE."
 * onto the question. A reader that takes them as the manager's words prints
 * a job title or an Observation the manager never wrote. Same expected card
 * in both apps; here the live form path is form-full-remap
 * (FORM_FULL_REMAP_ENABLED), and the intent path where it reads a title.
 *
 * The first case is this app's own production turn (conv_mvmz8pys26bs2ax).
 * The others are the Ask Sunny managers' turns, with this app's stores and
 * job titles.
 */

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({ from: () => ({ insert: async () => ({ error: null }) }) }),
}));

const FLAG = "MANAGER_WORDS_ONLY_ENABLED";
const TODAY = "2026-10-24";
const PEOPLE: readonly RosterEmployee[] = [];

beforeEach(() => {
  vi.stubEnv("FORM_FULL_REMAP_ENABLED", "1");
  vi.stubEnv("ANTI_LOOP_ENABLED", "1");
  vi.stubEnv(FLAG, "1");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function state(over: Partial<ConversationFormState>): ConversationFormState {
  return { ...EMPTY_CONVERSATION_FORM_STATE, ...over };
}

function remap(input: { question: string; history?: { role: string; content: string }[]; raw?: Record<string, unknown> }) {
  return groundFormSlots({
    raw: { templateKey: "dpoa", observation: null, actionPlan: null, ...(input.raw ?? {}) },
    history: input.history ?? [],
    question: input.question,
    today: TODAY,
    people: PEOPLE,
  });
}

describe("remap: the job title and what happened are the manager's words", () => {
  it("CA for Test Employee at Dodge, NE, register short $40 on 10-20, payroll deduct $40 applies", () => {
    const question = "CA for Test Employee at Dodge, NE, register short $40 on 10-20, payroll deduct $40 applies";
    // As production sent it (chat_traces.original_query), and as the intent
    // path would send it, with the state lines in front.
    const sent = prependFormState(
      question,
      state({ employeeName: "Test Employee", title: "CA", locationId: "loc-264", payrollDeduct: "yes", payrollAmount: "40" }),
    );
    expect(sent).toContain("Job title: CA. It happened at Omaha, NE (West Dodge Rd).");
    for (const text of [question, sent]) {
      const { slots, response } = remap({ question: text, raw: { employeeName: "Test Employee", jobTitle: "CA" } });
      expect(slots.jobTitle).toBeNull();
      expect(slots.observation ?? "").not.toMatch(/It happened|Job title|Policy reference/i);
      expect(response.content).not.toMatch(/It happened/i);
    }
  });

  it("create a CA form for ima employee, soap maker at kearney, for opening store late on 9-28-26", () => {
    const question = "create a CA form for ima employee, soap maker at kearney, for opening store late on 9-28-26";
    const sent = prependFormState(
      question,
      state({ employeeName: "ima employee", title: "soap maker", locationId: "loc-66", formDate: "2026-09-28", policyHeading: "Late Opening", policyPage: 15, incidentType: "Late Opening" }),
    );
    for (const text of [question, sent]) {
      const { slots } = remap({ question: text, raw: { employeeName: "ima employee" } });
      expect(slots.jobTitle).toBe("Soap Maker");
      expect(slots.observation ?? "").not.toMatch(/It happened|Job title|Policy reference|Incident:/i);
    }
  });

  it("name is test testy, todays date, bellevue location, test was late opening store", () => {
    const first = "Create a coaching form for a performance concern.";
    const question = "name is test testy, todays date, bellevue location, test was late opening store";
    const sent = prependFormState(
      question,
      state({ employeeName: "test testy", title: "test was late opening store", formDate: TODAY, warningLevel: "written" }),
    );
    for (const text of [question, sent]) {
      const { slots } = remap({
        question: text,
        history: [{ role: "user", content: first }, { role: "assistant", content: "Here is the Corrective Action Form." }],
        raw: { employeeName: "test testy", jobTitle: "test was late opening store" },
      });
      expect(slots.jobTitle).toBeNull();
    }
  });

  it("create coaching form. test testy is ass't store manager. test did not call anyone about opening late", () => {
    const question = "create coaching form. test testy is ass't store manager. test did not call anyone about opening late";
    const { slots } = remap({ question, raw: { templateKey: "coaching", employeeName: "test testy" } });
    expect(slots.jobTitle).toBe("Assistant Manager");
  });

  it("Please make me a coaching form for test employee at the kearney location … (\"HR\" was never typed)", () => {
    const question =
      "Please make me a coaching form for test employee at the kearney location Test did not complete closing duties. Trash was not taken out of the bathrooms, there was no\ntoilet paper in the women's bathroom, and there were no spray towels in the rooms also all the cleaning duties were signed off in the binder and not alll were completed and the way she signed off on the checklist was incorrect she signed one box with a arrown throught the rest each box needs an initial";
    const sent = prependFormState(question, state({ employeeName: "test employee", title: "HR", locationId: "loc-66" }));
    for (const text of [question, sent]) {
      const { slots } = remap({ question: text, raw: { templateKey: "coaching", employeeName: "test employee", jobTitle: "HR" } });
      expect(slots.jobTitle).toBeNull();
    }
  });

  it("works at Grand Island is the store, not what happened", () => {
    const history = [
      { role: "user", content: "I need to coach an employee" },
      { role: "assistant", content: "Happy to help." },
      { role: "user", content: "Her name is Test Employee" },
      { role: "assistant", content: "Here is the Coaching Form." },
    ];
    for (const said of ["She works at Grand Island", "Test Employee works at Grand Island"]) {
      const sent = prependFormState(said, state({ employeeName: "Test Employee", locationId: "loc-236", templateKey: "coaching" }));
      for (const text of [said, sent]) {
        const { slots } = remap({ question: text, history, raw: { templateKey: "coaching", employeeName: "Test Employee" } });
        expect(slots.observation).toBeNull();
      }
    }
    const later = [
      ...history,
      { role: "user", content: "Test Employee works at Grand Island" },
      { role: "assistant", content: "Here is the Coaching Form." },
      { role: "user", content: "It happened on 10-21" },
      { role: "assistant", content: "Here is the Coaching Form." },
    ];
    const { slots } = remap({
      question: "on cell phone 30+ min at the front desk",
      history: later,
      raw: { templateKey: "coaching", employeeName: "Test Employee" },
    });
    // The note as this app already words it; not "works", not "Her name is".
    expect(slots.observation).toBe("cell phone use 30+ min");
  });

  it("a pasted Late Opening policy is not the title", () => {
    // The JBA Policy Manual paragraph as this app indexes it (knowledge_chunks).
    const paste =
      "When an employee assigned to open a location is unable to open the location at the proper\ntime, the employee must notify the manager as soon as possible. The manager of the salon will\nbe required to open the salon and work until the person originally assigned arrives, or a\nreplacement is found. The employee who failed to open will then be required to reimburse The\nCompany $25.00 via payroll deduction (when applicable and following all state and local\nguidelines), for all expenses incurred. Managers or District Managers will be responsible for\noffering restitution to affected clients, as well as giving the payroll deduct total to Payroll. *";
    const history = [
      { role: "user", content: "create a CA form for ima employee, soap maker at kearney, for opening store late on 9-28-26" },
      { role: "assistant", content: "Here is the Corrective Action Form." },
      { role: "user", content: "this should be a written and note a verbal ca was given on 9-1-26" },
      { role: "assistant", content: "Here is the Corrective Action Form." },
    ];
    const { slots } = remap({ question: paste, history, raw: { employeeName: "ima employee" } });
    expect(slots.jobTitle).toBe("Soap Maker");
  });

  it("off, remap reads the question as main does", () => {
    vi.stubEnv(FLAG, "");
    const sent = prependFormState(
      "create coaching form. test testy is ass't store manager. test did not call anyone about opening late",
      state({ employeeName: "test testy" }),
    );
    expect(remap({ question: sent, raw: { templateKey: "coaching", employeeName: "test testy" } }).slots.jobTitle).toBe(
      "Store Manager",
    );
  });
});

/*
 * QA decision, 25 Oct 2026: "With MANAGER_WORDS_ONLY on, drop only the
 * clauses that just request the form, name the employee or give their place
 * (the store, job title at a place). Keep everything else word for word."
 * QA's example in this app's words: "She opened the store late at Grand
 * Island" is "She opened the store late". On the live remap path with
 * REMAP_INCIDENT_FIX_ENABLED on too. Before this change the one-sentence
 * account was left to the model's summary: a copy of the sentence was refused
 * as the question itself and the card asked "What happened?" again, and a
 * two-sentence account kept "at Grand Island".
 */
describe("remap, MANAGER_WORDS_ONLY + REMAP_INCIDENT_FIX: What happened without the request, the name or the store", () => {
  const history = [
    { role: "user", content: "I need to coach an employee" },
    { role: "assistant", content: "Happy to help." },
    { role: "user", content: "Her name is Test Employee" },
    { role: "assistant", content: "Here is the Coaching Form." },
  ];

  beforeEach(() => {
    vi.stubEnv("REMAP_INCIDENT_FIX_ENABLED", "1");
  });

  function observed(question: string, modelObservation: string | null, employeeName = "Test Employee", turns = history) {
    return remap({ question, history: turns, raw: { templateKey: "coaching", employeeName, observation: modelObservation } }).slots
      .observation;
  }

  it("She opened the store late at Grand Island → She opened the store late", () => {
    const said = "She opened the store late at Grand Island";
    // With no summary from the model, and with the model copying the sentence.
    expect(observed(said, null)).toBe("She opened the store late");
    expect(observed(said, said)).toBe("She opened the store late");
  });

  it("She opened the store late at Grand Island. She did not call anyone", () => {
    expect(observed("She opened the store late at Grand Island. She did not call anyone", null)).toBe(
      "She opened the store late. She did not call anyone",
    );
  });

  it("create a CA form for ima employee, soap maker at kearney, for opening store late on 9-28-26", () => {
    const said = "create a CA form for ima employee, soap maker at kearney, for opening store late on 9-28-26";
    // The request, the name and "soap maker at kearney" go. The incident's own
    // date at the end goes too: this path's date rule, the date is the form's date.
    expect(observed(said, null, "ima employee", [])).toBe("opening store late");
  });

  it("create a CA form for test employee at kearney, she opened the store late", () => {
    // Was "at kearney".
    expect(observed("create a CA form for test employee at kearney, she opened the store late", null)).toBe(
      "she opened the store late",
    );
  });

  it("She works at Grand Island is still no account, also when the model copies it", () => {
    const said = "She works at Grand Island";
    expect(observed(said, null)).toBeNull();
    expect(observed(said, said)).toBeNull();
    // A place that is not a store is part of what happened.
    expect(observed("on cell phone 30+ min at the front desk", null)).toBe("cell phone use 30+ min");
  });
});

const STORES = [
  { id: "loc-66", name: "Kearney, NE" },
  { id: "loc-236", name: "Grand Island, NE" },
] as const;

function person(id: string, first: string, title: string): GroundedPerson {
  return { id, firstName: first, lastName: "Example", locationIds: ["loc-66"], title, primaryLocationName: "Kearney, NE" };
}

function turn(overrides: Partial<IntentTurnInput>): IntentTurnInput {
  return {
    question: "",
    history: [],
    today: TODAY,
    saved: null,
    raw: null,
    people: [person("emp-pat", "Pat", "District Manager"), person("emp-sam", "Sam", "Assistant Manager")],
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

describe("intent path: the title is read from the manager's turns", () => {
  it("a pasted Late Opening policy does not make ima employee a District Manager", () => {
    const paste =
      "When an employee assigned to open a location is unable to open the location at the proper\ntime, the employee must notify the manager as soon as possible. The manager of the salon will\nbe required to open the salon and work until the person originally assigned arrives, or a\nreplacement is found. The employee who failed to open will then be required to reimburse The\nCompany $25.00 via payroll deduction (when applicable and following all state and local\nguidelines), for all expenses incurred. Managers or District Managers will be responsible for\noffering restitution to affected clients, as well as giving the payroll deduct total to Payroll. *";
    const decision = decideIntentTurn(
      turn({
        question: paste,
        history: [
          { role: "user", content: "create a CA form for ima employee at kearney, for opening store late on 9-28-26" },
          { role: "assistant", content: "Here is the Corrective Action Form." },
        ],
        saved: state({ employeeName: "ima employee", locationId: "loc-66", templateKey: "dpoa" }),
        raw: { formTurn: true },
      }),
    );
    expect(decision.state.title).toBeNull();
  });

  it("ass't store manager is the assistant title", () => {
    const decision = decideIntentTurn(
      turn({
        question: "create coaching form. test testy is ass't store manager. test did not call anyone about opening late",
        people: [person("emp-pat", "Pat", "Store Manager"), person("emp-sam", "Sam", "Assistant Manager")],
        raw: { employee: "test testy", formTurn: true },
      }),
    );
    expect(decision.state.title).toBe("Assistant Manager");
  });
});

describe("app-sentences", () => {
  it("knows a line the app wrote from a line the manager wrote", () => {
    expect(
      isAppLine(
        "The employee is ima employee. Job title: soap maker. It happened at Kearney, NE. It happened on 9/28/2026. Warning level: written. Payroll deduct applies. Policy reference: Late Opening, JBA Policy Manual p.15. Incident: Late Opening. Payroll deduction of $25.00.",
      ),
    ).toBe(true);
    expect(isAppLine("It happened on 10-21")).toBe(false);
    expect(isAppLine("She works at Grand Island")).toBe(false);
  });

  it("drops the app's lines and splits them for a line reader", () => {
    const text = "The employee is Test Employee. Job title: CA. It happened at Kearney, NE.\nCA for Test Employee at Kearney";
    expect(withoutAppLines(text)).toBe("CA for Test Employee at Kearney");
    expect(appSentencesOnePerLine(text).split("\n")).toEqual([
      "The employee is Test Employee.",
      "Job title: CA.",
      "It happened at Kearney, NE.",
      "CA for Test Employee at Kearney",
    ]);
  });
});
