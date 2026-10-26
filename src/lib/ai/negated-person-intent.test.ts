import { afterEach, describe, expect, it, vi } from "vitest";

import type { GroundedPerson } from "./grounded-entities";
import { decideIntentTurn, type IntentTurnInput } from "./intent-slots";

/**
 * NEGATED_PERSON_NO_CARD_ENABLED on the intent reading (QA-6, 26 Oct 2026).
 * With a Corrective Action open for Corvin Mallow, "never one for Rowan Pell"
 * and "do not make one for Rowan Pell" moved the form to Rowan Pell: the slot
 * model reads the person a turn names, negated or not, and the intent
 * reading took it. Each turn in lower case, Sentence case and ALL CAPS, with
 * the slot model reading Rowan Pell or Corvin Mallow (or nobody), a roster
 * holding both, and the store wording of this app. Rowan Pell and Corvin
 * Mallow are invented names.
 */

const STORES = [{ id: "loc-66", name: "Kearney, NE" }] as const;
const TEMPLATES = [{ key: "dpoa", name: "Corrective Action Form" }] as const;
const PEOPLE: GroundedPerson[] = [
  { id: "corvin", firstName: "Corvin", lastName: "Mallow", preferredFirstName: null, locationIds: ["loc-66"], title: "Team Member", primaryLocationName: "Kearney, NE" },
  { id: "rowan", firstName: "Rowan", lastName: "Pell", preferredFirstName: null, locationIds: ["loc-66"], title: "Team Member", primaryLocationName: "Kearney, NE" },
] as never;
const OPEN = "create a written CA for Corvin Mallow at the Kearney store for being late on 10-20-26";

const registers = (text: string) => [text.toLowerCase(), text.charAt(0).toUpperCase() + text.slice(1), text.toUpperCase()];

function slots(employee: string | null): Record<string, unknown> {
  return { employee, store: null, title: null, incidentType: null, incidentDate: null, payrollAmount: null, warningLevel: null, formType: null, formTurn: true };
}

function intent(overrides: Partial<IntentTurnInput>): IntentTurnInput {
  return {
    question: "",
    history: [],
    today: "2026-10-24",
    saved: null,
    raw: null,
    people: PEOPLE,
    stores: STORES,
    headings: ["Attendance"],
    templates: TEMPLATES,
    formInProgress: false,
    ...overrides,
  };
}

/** The employee the intent reading keeps for the open form after `second`, the slot model reading `model`. */
function employeeAfter(second: string, model: string | null): string | null {
  const one = decideIntentTurn(intent({ question: OPEN, raw: slots("Corvin Mallow") }));
  expect(one.state.employeeName).toBe("Corvin Mallow");
  const two = decideIntentTurn(
    intent({
      question: second,
      history: [
        { role: "user", content: OPEN },
        { role: "assistant", content: "I'll draft a **Corrective Action Form** for **Corvin Mallow** from what you've described." },
      ],
      saved: { ...one.state, templateKey: one.state.templateKey ?? "dpoa" },
      raw: slots(model),
      formInProgress: true,
    }),
  );
  return two.state.employeeName?.toLowerCase() ?? null;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

const MODEL = ["Rowan Pell", "Corvin Mallow", null] as const;

describe("NEGATED_PERSON_NO_CARD_ENABLED on: the intent reading's person", () => {
  it.each([...registers("never one for Rowan Pell"), ...registers("do not make one for Rowan Pell")])(
    "%s → not Rowan Pell; the form stays Corvin Mallow",
    (text) => {
      vi.stubEnv("NEGATED_PERSON_NO_CARD_ENABLED", "true");
      for (const model of MODEL) expect(employeeAfter(text, model), String(model)).toBe("corvin mallow");
    },
  );

  it.each(registers("no, not for Rowan Pell, for Corvin Mallow"))("%s → Corvin Mallow", (text) => {
    vi.stubEnv("NEGATED_PERSON_NO_CARD_ENABLED", "true");
    for (const model of MODEL) expect(employeeAfter(text, model), String(model)).toBe("corvin mallow");
  });

  it.each(registers("now one for Rowan Pell"))("%s → Rowan Pell when the model reads Rowan Pell (positive control)", (text) => {
    vi.stubEnv("NEGATED_PERSON_NO_CARD_ENABLED", "true");
    expect(employeeAfter(text, "Rowan Pell")).toBe("rowan pell");
  });

  it.each(registers("one for Rowan Pell, not Corvin Mallow"))("%s → Rowan Pell, whichever person the model reads", (text) => {
    vi.stubEnv("NEGATED_PERSON_NO_CARD_ENABLED", "true");
    expect(employeeAfter(text, "Rowan Pell")).toBe("rowan pell");
    expect(employeeAfter(text, "Corvin Mallow")).toBe("rowan pell");
  });
});

// Flag off: as on main, pinned (model Rowan Pell / Corvin Mallow / nobody). The negated turns move the form to Rowan Pell.
describe("NEGATED_PERSON_NO_CARD_ENABLED off: as on main", () => {
  it.each(
    [
      "never one for Rowan Pell",
      "do not make one for Rowan Pell",
      "no, not for Rowan Pell, for Corvin Mallow",
      "now one for Rowan Pell",
      "one for Rowan Pell, not Corvin Mallow",
    ].flatMap(registers),
  )("%s → rowan pell / corvin mallow / corvin mallow", (text) => {
    expect(MODEL.map((model) => employeeAfter(text, model))).toEqual(["rowan pell", "corvin mallow", "corvin mallow"]);
  });
});
