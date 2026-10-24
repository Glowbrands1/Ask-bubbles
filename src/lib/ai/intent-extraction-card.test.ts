import { afterEach, describe, expect, it } from "vitest";

import { EMPTY_CONVERSATION_FORM_STATE } from "./form-state";
import { decideIntentTurn, type IntentTurnInput } from "./intent-slots";
import type { GroundedPerson } from "./grounded-entities";

/**
 * Live replay, intent extraction on: four of five form cases made no card.
 * The reply was "Test Employee is not in the Woven roster", then the same
 * employee, store, and date again. One case looped on the date. One stated
 * "verbal, no payroll" that the manager had not said. The draft that did
 * appear had an empty observation.
 *
 * Flags off, the roster sentence and the missing-slot list stay as they are.
 */

const STORES = [
  { id: "loc-66", name: "Kearney, NE" },
  { id: "loc-219", name: "Lee's Summit, MO" },
] as const;

const TEMPLATES = [
  { key: "dpoa", name: "Corrective Action Form" },
  { key: "coaching", name: "Coaching Form" },
] as const;

const FLAGS = ["INTENT_EXTRACTION_ENABLED", "TYPED_NAME_ENABLED"] as const;
const PREVIOUS: Partial<Record<(typeof FLAGS)[number], string | undefined>> = {};

afterEach(() => {
  for (const key of FLAGS) {
    const value = PREVIOUS[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function flags(on: { intent?: boolean; typedName?: boolean }) {
  for (const key of FLAGS) PREVIOUS[key] = process.env[key];
  process.env.INTENT_EXTRACTION_ENABLED = on.intent ? "on" : "off";
  process.env.TYPED_NAME_ENABLED = on.typedName ? "on" : "off";
}

function person(locationIds: readonly string[]): GroundedPerson {
  return {
    id: "emp-marissa",
    firstName: "Marissa",
    lastName: "Lempka",
    preferredFirstName: null,
    locationIds,
    title: "Store Manager",
    primaryLocationName: locationIds.length === 1 ? "Kearney, NE" : null,
  };
}

const MARISSA = person(["loc-66"]);

function turn(overrides: Partial<IntentTurnInput> = {}): IntentTurnInput {
  return {
    question: "",
    history: [],
    today: "2026-10-24",
    saved: null,
    raw: null,
    people: [MARISSA],
    stores: STORES,
    headings: ["Attendance"],
    templates: TEMPLATES,
    formInProgress: false,
    ...overrides,
  };
}

const INCIDENT =
  "corrective action for Test Employee at Kearney. She left the register drawer open on Oct 20.";

describe("intent extraction leaves the card in place", () => {
  it("uses a name that is not in Woven as typed, and does not block the card", () => {
    flags({ intent: true, typedName: true });
    const decision = decideIntentTurn(
      turn({
        question: INCIDENT,
        saved: { ...EMPTY_CONVERSATION_FORM_STATE, employeeId: "emp-marissa" },
        raw: {
          employee: "Test Employee",
          store: "Kearney",
          incidentType: "left the register drawer open",
          incidentDate: "Oct 20",
          formType: "corrective action",
          formTurn: true,
          warningLevel: "verbal",
          payrollAmount: "no",
        },
      }),
    );
    expect(decision.state.employeeName).toBe("Test Employee");
    expect(decision.state.employeeId).toBeNull();
    expect(decision.state.locationId).toBe("loc-66");
    expect(decision.state.formDate).toBe("2026-10-20");
    expect(decision.clarification).toBeNull();
    expect(decision.question).not.toContain("not in the Woven roster");
    expect(decision.question).toContain("She left the register drawer open");
    expect(decision.question).not.toContain("Warning level:");
    expect(decision.question).not.toContain("No payroll deduction");
    expect(decision.state.warningLevel).toBeNull();
    expect(decision.state.payrollDeduct).toBeNull();
  });

  it("still blocks that name when typed names are off", () => {
    flags({ intent: true, typedName: false });
    const decision = decideIntentTurn(
      turn({
        question: INCIDENT,
        raw: {
          employee: "Test Employee",
          store: "Kearney",
          incidentDate: "Oct 20",
          incidentType: "left the register drawer open",
          formType: "corrective action",
          formTurn: true,
        },
      }),
    );
    expect(decision.state.employeeName).toBeNull();
    expect(decision.clarification).toContain("**Test Employee** is not in the Woven roster");
  });

  it("does not ask again for an employee, store, or date already on the form state", () => {
    flags({ intent: true, typedName: true });
    const opened = decideIntentTurn(
      turn({
        question: INCIDENT,
        raw: {
          employee: "Test Employee",
          store: "Kearney",
          incidentDate: "Oct 20",
          incidentType: "left the register drawer open",
          formType: "corrective action",
          formTurn: true,
        },
      }),
    );
    const decision = decideIntentTurn(
      turn({
        question: "ok",
        saved: opened.state,
        history: [
          { role: "user", content: INCIDENT },
          {
            role: "assistant",
            content:
              "Which store did you mean?\n1. **Kearney, NE**\n2. **Lee's Summit, MO**\nWhich date should go on the form?\n1. **10/20/2026**\n2. **10/24/2026**\nTest Employee is not in the Woven roster",
          },
        ],
        raw: { employee: null, store: null, incidentDate: null, warningLevel: "verbal", payrollAmount: "no", formTurn: true },
      }),
    );
    expect(decision.state.employeeName).toBe("Test Employee");
    expect(decision.state.locationId).toBe("loc-66");
    expect(decision.state.formDate).toBe("2026-10-20");
    expect(decision.clarification ?? "").not.toMatch(/which employee/i);
    expect(decision.clarification ?? "").not.toMatch(/which store/i);
    expect(decision.clarification ?? "").not.toMatch(/which date/i);
    expect(decision.clarification ?? "").not.toContain("the date it happened");
    expect(decision.clarification ?? "").not.toContain("not in the Woven roster");
    expect(decision.state.warningLevel).toBeNull();
    expect(decision.state.payrollDeduct).toBeNull();
  });

  it("does not adopt a warning level or a payroll answer the manager did not say", () => {
    flags({ intent: true, typedName: true });
    const decision = decideIntentTurn(
      turn({
        question: "Please file the corrective action. She left the register drawer open.",
        history: [
          {
            role: "assistant",
            content: "Verbal Warning or Written Warning? Is payroll deduct applicable? I'll file this as verbal, no payroll.",
          },
        ],
        raw: {
          employee: "Test Employee",
          warningLevel: "verbal",
          payrollAmount: "no",
          formType: "corrective action",
          formTurn: true,
          incidentType: "left the register drawer open",
        },
      }),
    );
    expect(decision.state.warningLevel).toBeNull();
    expect(decision.state.payrollDeduct).toBeNull();
    expect(decision.state.employeeName).toBe("Test Employee");
    expect(decision.question).not.toContain("Warning level:");
    expect(decision.question).not.toContain("No payroll deduction");
    expect(decision.question).toContain("She left the register drawer open");
    expect(decision.clarification ?? "").not.toContain("Which warning");
  });

  it("keeps a warning and a payroll answer the manager did say", () => {
    flags({ intent: true, typedName: true });
    const decision = decideIntentTurn(
      turn({
        question: "verbal corrective action for Test Employee, no payroll deduction. She left the register drawer open on Oct 20.",
        raw: {
          employee: "Test Employee",
          warningLevel: "written",
          payrollAmount: null,
          incidentDate: "Oct 20",
          formType: "corrective action",
          formTurn: true,
          incidentType: "left the register drawer open",
        },
      }),
    );
    expect(decision.state.warningLevel).toBe("verbal");
    expect(decision.state.payrollDeduct).toBe("no");
    expect(decision.state.employeeName).toBe("Test Employee");
    expect(decision.question).toContain("She left the register drawer open");
  });

  it("asks which store once, then leaves the choice on the card", () => {
    flags({ intent: true, typedName: true });
    const both = person(["loc-66", "loc-219"]);
    const asked = decideIntentTurn(
      turn({
        question: "verbal corrective action for Marissa Lempka at Kearney and Lee's Summit. She left the register drawer open on Oct 20.",
        people: [both],
        raw: {
          employee: "Marissa Lempka",
          store: "Kearney and Lee's Summit",
          incidentDate: "Oct 20",
          warningLevel: "verbal",
          formType: "corrective action",
          formTurn: true,
          incidentType: "left the register drawer open",
        },
      }),
    );
    expect(asked.clarification).toContain("Which store did you mean");
    expect(asked.question).toContain("She left the register drawer open");
    expect(asked.state.locationId).toBeNull();

    const again = decideIntentTurn(
      turn({
        question: "I already told you",
        people: [both],
        history: [
          { role: "user", content: asked.question },
          { role: "assistant", content: asked.clarification ?? "" },
        ],
        saved: asked.state,
        raw: { employee: "Marissa Lempka", formTurn: true },
      }),
    );
    expect(again.clarification ?? "").not.toMatch(/which store/i);
    expect(again.state.employeeName).toBe("Marissa Lempka");
    expect(again.state.formDate).toBe("2026-10-20");
  });

  it("asks which date once, then stops looping", () => {
    flags({ intent: true, typedName: true });
    const asked = decideIntentTurn(
      turn({
        question: "corrective action for Test Employee at Kearney on Oct 20 and also on Oct 22. She left the register drawer open.",
        raw: {
          employee: "Test Employee",
          store: "Kearney",
          formType: "corrective action",
          formTurn: true,
          incidentType: "left the register drawer open",
        },
      }),
    );
    expect(asked.clarification).toContain("Which date");
    expect(asked.state.formDate).toBeNull();
    expect(asked.state.employeeName).toBe("Test Employee");
    expect(asked.state.locationId).toBe("loc-66");

    const again = decideIntentTurn(
      turn({
        question: "the same day",
        history: [
          { role: "user", content: "corrective action for Test Employee at Kearney on Oct 20 and also on Oct 22. She left the register drawer open." },
          { role: "assistant", content: asked.clarification ?? "" },
        ],
        saved: asked.state,
        raw: { employee: "Test Employee", formTurn: true, incidentDate: "Oct 24" },
      }),
    );
    expect(again.clarification ?? "").not.toMatch(/which date/i);
    expect(again.clarification ?? "").not.toContain("the date it happened");
    expect(again.state.formDate).toBeNull();
    expect(again.state.employeeName).toBe("Test Employee");
    expect(again.state.locationId).toBe("loc-66");
  });
});
