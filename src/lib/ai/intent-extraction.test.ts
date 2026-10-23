import { describe, expect, it } from "vitest";

import { intentExtractionEnabled } from "@/lib/config/chat-quality-flags";

import { EMPTY_CONVERSATION_FORM_STATE } from "./form-state";
import { decideIntentTurn, headingFromAccount, normalizeIncidentDate, payrollAmounts, type IntentTurnInput } from "./intent-slots";
import type { GroundedPerson } from "./grounded-entities";

/**
 * Varied phrasings, lowercase names, typos, and date formats.
 *
 * The model is not called. The tool payload is what a faithful copy of the
 * manager's words would be, and the assertions are the grounded result.
 * People are synthetic. Stores are this company's.
 */

const STORES = [
  { id: "loc-66", name: "Kearney, NE" },
  { id: "loc-219", name: "Lee's Summit, MO" },
] as const;

const TEMPLATES = [
  { key: "dpoa", name: "Corrective Action Form" },
  { key: "coaching", name: "Coaching Form" },
] as const;

const HEADINGS = ["Attendance", "Late Opening", "Standards of Conduct"];

function person(input: {
  id: string;
  first: string;
  last: string;
  locationIds: readonly string[];
  title: string;
  preferred?: string;
}): GroundedPerson {
  return {
    id: input.id,
    firstName: input.first,
    lastName: input.last,
    preferredFirstName: input.preferred ?? null,
    locationIds: input.locationIds,
    title: input.title,
    primaryLocationName:
      input.locationIds.length === 1 ? STORES.find((store) => store.id === input.locationIds[0])?.name ?? null : null,
  };
}

const MARISSA = person({
  id: "emp-marissa",
  first: "Marissa",
  last: "Lempka",
  locationIds: ["loc-66"],
  title: "Store Manager",
});

const ALEX_KEARNEY = person({
  id: "emp-alex-k",
  first: "Alex",
  last: "Rivera",
  locationIds: ["loc-66"],
  title: "Store Manager",
});

const ALEX_SUMMIT = person({
  id: "emp-alex-s",
  first: "Alex",
  last: "Rivera",
  locationIds: ["loc-219"],
  title: "Sales Associate",
});

function turn(overrides: Partial<IntentTurnInput> = {}): IntentTurnInput {
  return {
    question: "",
    history: [],
    today: "2026-10-23",
    saved: null,
    raw: null,
    people: [MARISSA],
    stores: STORES,
    headings: HEADINGS,
    templates: TEMPLATES,
    formInProgress: false,
    ...overrides,
  };
}

describe("incident dates normalize from the forms they are typed in", () => {
  const cases: readonly [string, string | null][] = [
    ["2026-10-01", "2026-10-01"],
    ["10/1/2026", "2026-10-01"],
    ["10/01/2026", "2026-10-01"],
    ["10-1-2026", "2026-10-01"],
    ["10-1-26", "2026-10-01"],
    ["October 1, 2026", "2026-10-01"],
    ["october 1, 2026", "2026-10-01"],
    ["Oct. 1st 2026", "2026-10-01"],
    ["1 October 2026", "2026-10-01"],
    ["1st of October 2026", "2026-10-01"],
    ["october 1", "2026-10-01"],
    ["13/40/2026", null],
    ["February 31, 2026", null],
  ];

  it.each(cases)("%s → %s", (raw, iso) => {
    expect(normalizeIncidentDate(raw, "2026-10-23")).toBe(iso);
  });
});

describe("slots are grounded and only the missing ones are asked", () => {
  it("a lowercase name is the roster spelling, and a known date is not asked again", () => {
    const decision = decideIntentTurn(
      turn({
        question: "verbal corrective action for marissa lempka at kearney. she showed up late on october 1, 2026. payroll $25.",
        raw: {
          employee: "marissa lempka",
          store: "kearney",
          title: null,
          incidentType: "showed up late",
          incidentDate: "october 1, 2026",
          payrollAmount: "$25",
          warningLevel: "verbal",
          formType: "corrective action",
          formTurn: true,
        },
      }),
    );
    expect(decision.clarification).toBeNull();
    expect(decision.state.employeeName).toBe("Marissa Lempka");
    expect(decision.state.employeeId).toBe("emp-marissa");
    expect(decision.state.locationId).toBe("loc-66");
    expect(decision.state.title).toBe("Store Manager");
    expect(decision.state.incidentType).toBe("Attendance");
    expect(decision.state.formDate).toBe("2026-10-01");
    expect(decision.state.payrollAmount).toBe("25");
    expect(decision.state.warningLevel).toBe("verbal");
    expect(decision.state.templateKey).toBe("dpoa");
    expect(decision.question).toContain("The employee is Marissa Lempka.");
    expect(decision.question.toLowerCase()).not.toContain("i still need");
  });

  it("a typo of one person is that person", () => {
    const decision = decideIntentTurn(
      turn({
        question: "corrective action for marisa lempka, showed up late on 10/1/2026, verbal",
        raw: {
          employee: "marisa lempka",
          store: null,
          title: null,
          incidentType: "showed up late",
          incidentDate: "10/1/2026",
          payrollAmount: null,
          warningLevel: "verbal",
          formType: "Corrective Action Form",
          formTurn: true,
        },
      }),
    );
    expect(decision.state.employeeName).toBe("Marissa Lempka");
    expect(decision.state.incidentType).toBe("Attendance");
    expect(decision.clarification).toBeNull();
  });

  it("two people with one name are a choice that shows store and title", () => {
    const decision = decideIntentTurn(
      turn({
        question: "corrective action for alex rivera, she showed up late on 10/1/2026, verbal",
        people: [ALEX_KEARNEY, ALEX_SUMMIT],
        raw: {
          employee: "alex rivera",
          store: null,
          title: null,
          incidentType: "showed up late",
          incidentDate: "10/1/2026",
          payrollAmount: null,
          warningLevel: "verbal",
          formType: "corrective action",
          formTurn: true,
        },
      }),
    );
    expect(decision.clarification).toContain("Which person did you mean");
    expect(decision.clarification).toContain("Kearney, NE");
    expect(decision.clarification).toContain("Lee's Summit, MO");
    expect(decision.clarification).toContain("Store Manager");
    expect(decision.clarification).toContain("Sales Associate");
    expect(decision.clarification).not.toContain("I still need");
    expect(decision.state.employeeId).toBeNull();
  });

  it("a numbered reply selects that person and does not ask again", () => {
    const asked = decideIntentTurn(
      turn({
        question: "corrective action for alex rivera, showed up late on 10/1/2026, verbal",
        people: [ALEX_KEARNEY, ALEX_SUMMIT],
        raw: { employee: "alex rivera", formType: "corrective action", formTurn: true, incidentDate: "10/1/2026", warningLevel: "verbal", incidentType: "showed up late" },
      }),
    );
    const decision = decideIntentTurn(
      turn({
        question: "2",
        people: [ALEX_KEARNEY, ALEX_SUMMIT],
        history: [
          { role: "user", content: "corrective action for alex rivera, showed up late on 10/1/2026, verbal" },
          { role: "assistant", content: asked.clarification ?? "" },
        ],
        saved: asked.state,
        raw: { employee: null, formTurn: true },
      }),
    );
    expect(decision.state.employeeId).toBe("emp-alex-s");
    expect(decision.state.employeeName).toBe("Alex Rivera");
    expect(decision.state.title).toBe("Sales Associate");
    expect(decision.state.locationId).toBe("loc-219");
    expect(decision.clarification ?? "").not.toContain("Which person");
  });

  it("a store reply selects that person", () => {
    const asked = decideIntentTurn(
      turn({
        question: "alex rivera showed up late on 10-1-2026, verbal corrective action",
        people: [ALEX_KEARNEY, ALEX_SUMMIT],
        raw: { employee: "Alex Rivera", formTurn: true, formType: "corrective action", incidentDate: "10-1-2026", warningLevel: "verbal" },
      }),
    );
    const decision = decideIntentTurn(
      turn({
        question: "the lee's summit one",
        people: [ALEX_KEARNEY, ALEX_SUMMIT],
        history: [{ role: "assistant", content: asked.clarification ?? "" }],
        saved: asked.state,
        raw: { formTurn: true },
      }),
    );
    expect(decision.state.employeeId).toBe("emp-alex-s");
  });

  it("two stores are a choice, and naming one settles it", () => {
    const both = person({
      id: "emp-marissa",
      first: "Marissa",
      last: "Lempka",
      locationIds: ["loc-66", "loc-219"],
      title: "Store Manager",
    });
    const asked = decideIntentTurn(
      turn({
        question: "verbal corrective action for marissa lempka at kearney and lee's summit. she showed up late on october 1, 2026.",
        people: [both],
        raw: {
          employee: "marissa lempka",
          store: "kearney and lee's summit",
          incidentType: "showed up late",
          incidentDate: "october 1, 2026",
          warningLevel: "verbal",
          formType: "corrective action",
          formTurn: true,
        },
      }),
    );
    expect(asked.clarification).toContain("Which store did you mean");
    expect(asked.clarification).toContain("Kearney, NE");
    expect(asked.clarification).toContain("Lee's Summit, MO");
    expect(asked.state.locationId).toBeNull();

    const decision = decideIntentTurn(
      turn({
        question: "lee's summit",
        people: [both],
        history: [{ role: "assistant", content: asked.clarification ?? "" }],
        saved: asked.state,
        raw: { formTurn: true },
      }),
    );
    expect(decision.state.locationId).toBe("loc-219");
    expect(decision.clarification ?? "").not.toContain("Which store");
  });

  it("late opening is the heading only when the account is the store opening late", () => {
    expect(headingFromAccount("she showed up late for her shift", HEADINGS)).toBe("Attendance");
    expect(headingFromAccount("SHE SHOWED UP LATE", HEADINGS)).toBe("Attendance");
    expect(headingFromAccount("she was late opening the store", HEADINGS)).toBe("Late Opening");
    expect(headingFromAccount("opened the store late on 10/1", HEADINGS)).toBe("Late Opening");
    expect(headingFromAccount("she showed up late", ["Late Opening"])).toBeNull();
  });

  it("asks only for the slots the conversation has not settled", () => {
    const decision = decideIntentTurn(
      turn({
        question: "corrective action for marissa lempka, she showed up late",
        saved: {
          ...EMPTY_CONVERSATION_FORM_STATE,
          employeeName: "Marissa Lempka",
          employeeId: "emp-marissa",
          locationId: "loc-66",
          title: "Store Manager",
        },
        raw: {
          employee: "marissa lempka",
          incidentType: "showed up late",
          formType: "corrective action",
          formTurn: true,
        },
      }),
    );
    expect(decision.clarification).toBe("I still need the date it happened and the warning level, verbal or written.");
    expect(decision.clarification).not.toContain("which employee");
    expect(decision.clarification).not.toContain("which store");
  });

  it("two dates are a choice, and a date the text never stated is dropped", () => {
    const choice = decideIntentTurn(
      turn({
        question: "corrective action for marissa lempka on 10/1/2026 and also 10/15/2026, verbal, showed up late",
        raw: { employee: "Marissa Lempka", formType: "corrective action", formTurn: true, warningLevel: "verbal", incidentType: "showed up late" },
      }),
    );
    expect(choice.clarification).toContain("Which date");
    expect(choice.clarification).toContain("10/1/2026");
    expect(choice.clarification).toContain("10/15/2026");
    expect(choice.state.formDate).toBeNull();

    const invented = decideIntentTurn(
      turn({
        question: "corrective action for marissa lempka, showed up late, verbal",
        raw: { employee: "Marissa Lempka", incidentDate: "1999-01-01", formType: "corrective action", formTurn: true, warningLevel: "verbal", incidentType: "late" },
      }),
    );
    expect(invented.state.formDate).toBeNull();
    expect(invented.clarification).toContain("the date it happened");
  });

  it("reads payroll from dollars, a dollar sign, and a decimal", () => {
    expect(payrollAmounts("deduct 25 dollars and also $12.50").sort()).toEqual(["12.50", "25"]);
    const decision = decideIntentTurn(
      turn({
        question: "verbal corrective action for marissa lempka at kearney on 1 October 2026, showed up late, payroll of 25.00 dollars",
        raw: {
          employee: "Marissa Lempka",
          store: "Kearney",
          incidentType: "showed up late",
          incidentDate: "1 October 2026",
          payrollAmount: "25.00 dollars",
          warningLevel: "verbal",
          formType: "corrective action",
          formTurn: true,
        },
      }),
    );
    expect(decision.state.payrollAmount).toBe("25.00");
    expect(decision.state.formDate).toBe("2026-10-01");
    expect(decision.clarification).toBeNull();
  });

  it("a name that is not on the roster is not the employee", () => {
    const decision = decideIntentTurn(
      turn({
        question: "verbal corrective action for Casey Quinn at kearney on 10/1/2026, showed up late",
        raw: {
          employee: "Casey Quinn",
          store: "kearney",
          incidentDate: "10/1/2026",
          incidentType: "showed up late",
          warningLevel: "verbal",
          formType: "corrective action",
          formTurn: true,
        },
      }),
    );
    expect(decision.state.employeeName).toBeNull();
    expect(decision.state.employeeId).toBeNull();
    expect(decision.clarification).toContain("not in the Woven roster");
  });

  it("a policy question does not get a form interview", () => {
    const decision = decideIntentTurn(
      turn({
        question: "what does the attendance section say about being on time?",
        raw: { formTurn: false, incidentType: "attendance" },
      }),
    );
    expect(decision.clarification).toBeNull();
    expect(decision.question).toBe("what does the attendance section say about being on time?");
    expect(decision.state.incidentType).toBe("Attendance");
  });

  it("keeps a stored slot when this turn does not restate it", () => {
    const decision = decideIntentTurn(
      turn({
        question: "verbal",
        saved: {
          ...EMPTY_CONVERSATION_FORM_STATE,
          employeeName: "Marissa Lempka",
          employeeId: "emp-marissa",
          locationId: "loc-66",
          title: "Store Manager",
          formDate: "2026-10-01",
          incidentType: "Attendance",
          templateKey: "dpoa",
        },
        formInProgress: true,
        raw: { warningLevel: "verbal", formTurn: true },
      }),
    );
    expect(decision.clarification).toBeNull();
    expect(decision.state.employeeName).toBe("Marissa Lempka");
    expect(decision.state.warningLevel).toBe("verbal");
    expect(decision.state.formDate).toBe("2026-10-01");
  });

  it("a failed tool call still reads a date and a roster name out of the words", () => {
    const decision = decideIntentTurn(
      turn({
        question: "Marissa Lempka showed up late on 10/01/2026",
        raw: null,
        formInProgress: true,
      }),
    );
    expect(decision.state.employeeName).toBe("Marissa Lempka");
    expect(decision.state.formDate).toBe("2026-10-01");
    expect(decision.state.incidentType).toBe("Attendance");
  });
});

describe("INTENT_EXTRACTION_ENABLED", () => {
  it("is off unless set to 1, true, on, or yes", () => {
    const previous = process.env.INTENT_EXTRACTION_ENABLED;
    try {
      for (const value of [undefined, "", "0", "false", "off", "no", "YES "]) {
        if (value === undefined) delete process.env.INTENT_EXTRACTION_ENABLED;
        else process.env.INTENT_EXTRACTION_ENABLED = value;
        const on = value === "YES ";
        expect(intentExtractionEnabled()).toBe(on);
      }
      for (const value of ["1", "true", "on", "yes", " TRUE "]) {
        process.env.INTENT_EXTRACTION_ENABLED = value;
        expect(intentExtractionEnabled()).toBe(true);
      }
    } finally {
      if (previous === undefined) delete process.env.INTENT_EXTRACTION_ENABLED;
      else process.env.INTENT_EXTRACTION_ENABLED = previous;
    }
  });
});
