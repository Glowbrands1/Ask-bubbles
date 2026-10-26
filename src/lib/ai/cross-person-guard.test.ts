import { afterEach, describe, expect, it } from "vitest";

import type { ChatFormProposal } from "@/types";

import { samePerson, withCrossPersonGuard } from "./cross-person-guard";
import type { AskRequest, AskResponse } from "./types";

/**
 * Ask Bubbles conv_mvoftzhs29se8nb, 25 Oct 2026. The manager's turns and the
 * app's replies are copied exactly; the names are invented (Lena Marsh is the
 * first employee, Petra Linwood the second).
 *
 * Request 1 said "no payroll deduct" for Lena. Request 2, for Petra, never
 * mentioned payroll, and Petra's card read "Is payroll deduct applicable?
 * **No**". The same carry-over in the sibling app (conv_mvoetxo92fraflz) kept the
 * first employee's incident in Observation of Offense.
 */
const FLAG = "CROSS_PERSON_INCIDENT_GUARD_ENABLED";
const saved = process.env[FLAG];
afterEach(() => {
  if (saved === undefined) delete process.env[FLAG];
  else process.env[FLAG] = saved;
});

const TURN_1 =
  "create verbal CA for lena marsh for violating visitors at work policy on 10-10-26. lena spent 40 minutes talking with friend and ignoring guests. previous coaching was jba policy manual 1-1-26";
const TURN_2 = "no payroll deduct";
const TURN_3 = "create a corrective action form for petra linwood. on 10-20-26 petra was talking on her cell phone for over 30 minutes";

function card(employeeName: string, sourceMessageIds: string[], extra: Partial<ChatFormProposal> = {}): ChatFormProposal {
  return {
    proposalId: `prop-${employeeName}`,
    supportsInlineDraft: true,
    templateKey: "dpoa",
    templateName: "Corrective Action Form",
    variantKey: null,
    employeeName,
    employeeRole: null,
    formDate: "2026-10-10",
    locationId: null,
    locationName: null,
    locationResolution: "not_applicable",
    authorizedLocationIds: [],
    status: "ready",
    sourceMessageIds,
    ...extra,
  };
}

const LENA_REPLY = [
  "I'll draft a **Corrective Action Form** for **lena marsh** from what you've described, and check the applicable company policy before anything policy-related goes on it.",
  "",
  "**Issue:** violating visitors at work policy on 10-10-26 · **Type of warning:** Verbal Warning, as you said — tell me if that should change",
  "",
  "**Prior actions:** Coaching — JBA Policy Manual — 01/01/2026, as you said. I'll list it on the form — tell me if that should change.",
  "",
  "Is payroll deduct applicable? **No** — tell me if that should change.",
].join("\n");

const PETRA_REPLY = [
  "I'll draft a **Corrective Action Form** for **petra linwood** from what you've described, and check the applicable company policy before anything policy-related goes on it.",
  "",
  "**Issue:** on 10-20-26 petra was talking on her cell phone for over 30 minutes · **Type of warning:** Verbal Warning, as you said — tell me if that should change",
  "",
  "**Prior actions:** Coaching — JBA Policy Manual — 01/01/2026, as you said. I'll list it on the form — tell me if that should change.",
  "",
  "Is payroll deduct applicable? **No** — tell me if that should change.",
].join("\n");

const HISTORY = [
  { id: "m0", role: "user", content: TURN_1 },
  { id: "m1", role: "assistant", content: LENA_REPLY, formProposal: card("lena marsh", ["m0"], { warningLevel: "verbal" }) },
  { id: "m2", role: "user", content: TURN_2 },
  { id: "m3", role: "assistant", content: LENA_REPLY, formProposal: card("lena marsh", ["m0", "m2"], { warningLevel: "verbal", payrollDeduct: "no" }) },
];

const RESPONSE = {
  content: PETRA_REPLY,
  citations: [],
  formProposal: card("petra linwood", ["m0", "m2", "m4"], {
    warningLevel: "verbal",
    payrollDeduct: "no",
    priorActions: "Coaching — JBA Policy Manual — 01/01/2026",
    issue: "on 10-20-26 petra was talking on her cell phone for over 30 minutes",
  }),
} as unknown as AskResponse;

const REQUEST = {
  question: TURN_3,
  questionMessageId: "m4",
  history: HISTORY,
  context: { todayIso: "2026-10-25" },
} as unknown as AskRequest;

describe("CROSS_PERSON_INCIDENT_GUARD_ENABLED off", () => {
  it("returns Petra's card as main does, Lena's answers included", () => {
    delete process.env[FLAG];
    const out = withCrossPersonGuard(RESPONSE, REQUEST);
    expect(out).toBe(RESPONSE);
    expect(out.content).toContain("Is payroll deduct applicable? **No**");
  });
});

describe("CROSS_PERSON_INCIDENT_GUARD_ENABLED on", () => {
  it("does not carry Lena's payroll answer, prior coaching or warning level onto Petra's card", () => {
    process.env[FLAG] = "on";
    const out = withCrossPersonGuard(RESPONSE, REQUEST);
    expect(out.formProposal?.employeeName).toBe("petra linwood");
    expect(out.formProposal?.payrollDeduct).toBeNull();
    expect(out.formProposal?.priorActions).toBeNull();
    expect(out.formProposal?.warningLevel).toBeNull();
    expect(out.content).not.toContain("Is payroll deduct applicable? **No**");
    expect(out.content).not.toContain("JBA Policy Manual — 01/01/2026");
    expect(out.content).not.toContain("Verbal Warning, as you said");
    expect(out.content).toContain("**Is payroll deduct applicable?** Yes or No?");
    expect(out.content).toContain("**Verbal Warning** or a **Written Warning**?");
    // Petra's own incident stays, and the draft is written from her turn only.
    expect(out.content).toContain("**Issue:** on 10-20-26 petra was talking on her cell phone for over 30 minutes");
    expect(out.formProposal?.formDate).toBe("2026-10-20");
    expect(out.formProposal?.sourceMessageIds).toEqual(["m4"]);
  });

  it("keeps a level Petra's own request states", () => {
    process.env[FLAG] = "on";
    const question = "create a verbal corrective action form for petra linwood. on 10-20-26 petra was talking on her cell phone for over 30 minutes";
    const out = withCrossPersonGuard(RESPONSE, { ...REQUEST, question } as AskRequest);
    expect(out.formProposal?.warningLevel).toBe("verbal");
    expect(out.content).toContain("Verbal Warning, as you said");
  });

  it("changes nothing when the card keeps the same person", () => {
    process.env[FLAG] = "on";
    const same = { ...RESPONSE, content: LENA_REPLY, formProposal: card("lena marsh", ["m0", "m2", "m4"]) };
    expect(withCrossPersonGuard(same, { ...REQUEST, question: "yes" } as AskRequest)).toBe(same);
    expect(samePerson("mara quill", "Mara Quil")).toBe(true);
  });

  it("reads the switch in lowercase and sentence case", () => {
    process.env[FLAG] = "on";
    for (const question of [TURN_3, "Create a corrective action form for Petra linwood. On 10-20-26 petra was talking on her cell phone for over 30 minutes"]) {
      const out = withCrossPersonGuard(RESPONSE, { ...REQUEST, question } as AskRequest);
      expect(out.formProposal?.payrollDeduct).toBeNull();
      expect(out.formProposal?.priorActions).toBeNull();
    }
  });
});

/**
 * QA-6, 26 Oct 2026: one shared word made two people one ("Marla Quince" /
 * "Marla Voss"), so the first person's incident stayed on the new person's
 * card. Names invented.
 */
describe("CROSS_PERSON_INCIDENT_GUARD_ENABLED: two people are one only when first and last names match", () => {
  it.each([
    ["Marla Quince", "Marla Voss", false],
    ["Rowan Pell", "Avery Pell", false],
    ["Marla Quince", "Avery Quince", false],
    ["Test Employee", "Test Employee Two", false],
    ["Rowan Pell", "Rowan Pelt", true],
    ["Marla Quince", "Marla Quinse", true],
    ["Mara Quil", "Mara Quill", true],
    ["Rowan Pell", "Rowan", true],
  ])("%s / %s → %s", (a, b, same) => {
    expect(samePerson(a, b)).toBe(same);
    expect(samePerson(b.toUpperCase(), a.toLowerCase())).toBe(same);
  });

  it.each([
    ["create a corrective action form for lena voss. on 10-20-26 lena was talking on her cell phone for over 30 minutes", "lena voss"],
    ["Create a corrective action form for Lena Voss. On 10-20-26 Lena was talking on her cell phone for over 30 minutes", "Lena Voss"],
    ["CREATE A CORRECTIVE ACTION FORM FOR AVERY MARSH. ON 10-20-26 AVERY WAS TALKING ON HER CELL PHONE FOR OVER 30 MINUTES", "AVERY MARSH"],
  ])("'%s' carries none of Lena Marsh's answers", (question, person) => {
    process.env[FLAG] = "on";
    const response = { ...RESPONSE, formProposal: { ...RESPONSE.formProposal!, employeeName: person } } as AskResponse;
    const out = withCrossPersonGuard(response, { ...REQUEST, question } as AskRequest);
    expect(out.formProposal?.payrollDeduct).toBeNull();
    expect(out.formProposal?.priorActions).toBeNull();
    expect(out.formProposal?.warningLevel).toBeNull();
  });
});
