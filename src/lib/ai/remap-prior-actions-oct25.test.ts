import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { statedPriorActions } from "@/lib/forms/prior-actions";

import { groundFormSlots } from "./form-full-remap";
import { decideIntentTurn } from "./intent-slots";

/**
 * ============================================================================
 * PRIOR ACTIONS AS MANAGERS WRITE THEM, ON THE REMAP PATH — QA, 25 OCT 2026
 * ============================================================================
 *
 * PRIOR_ACTIONS_PARSE_ENABLED. This app's forms run through the full remap
 * (FORM_FULL_REMAP_ENABLED); its card read prior actions only from "prior =
 * …" and "coached on …". The managers' turns are copied exactly:
 *
 *   conv_mvmzn0sn2pfk6uk  "Previous coaching was a Verbal CA 10-1-26." —
 *                         no prior action on the card.
 *   conv_mvmzlt9o219eiga  "Her prior coaching is her policy manual
 *                         ackwnelegement on 9/01." (typo kept) — none.
 *   conv_mvmznap42vcw0dl  "previous coaching jba manual 11-1-26. on
 *                         10-22-26 …" then "jba manual 11-1-25" — the form
 *                         was dated 2025-11-01, the coaching's date.
 *   conv_mvmzmhst2si3jfr  "previous coaching - jba policy manual 1-20-26." —
 *                         "Action plan: Previous coaching", no prior action.
 *
 * And the same mechanisms Ask Sunny's managers hit: a list after "verbal
 * warning received … Coaching 9/8/2026, …" kept only its first step
 * (Ask Sunny conv_mvmvlnel251xs4k, told here in this app's words), "prior
 * verbal 9-1-26" gave nothing, and "previous coaching: jba policy manual
 * 1-1-26, verbal ca 9-1-26" is two lines. The model's reading is the one
 * chat_traces stored where there is one.
 */

const FLAG = "PRIOR_ACTIONS_PARSE_ENABLED";
const TODAY = "2026-10-24";

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({ from: () => ({ insert: async () => ({ error: null }) }) }),
}));

beforeEach(() => {
  vi.stubEnv("FORM_FULL_REMAP_ENABLED", "1");
  vi.stubEnv(FLAG, "1");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

type Turn = { role: string; content: string };

function remap(turns: string[], raw: Record<string, unknown>) {
  const history: Turn[] = [];
  for (const text of turns.slice(0, -1)) {
    history.push({ role: "user", content: text }, { role: "assistant", content: "Here is the Corrective Action Form." });
  }
  return groundFormSlots({
    raw: { templateKey: "dpoa", employeeName: "Test Employee", observation: null, actionPlan: null, ...raw },
    history,
    question: turns.at(-1)!,
    today: TODAY,
    people: [],
  });
}

const lines = (value: string | null) => (value ?? "").split("\n").filter(Boolean);

/*
 * QA decision, 25 Oct 2026: a prior-action line holds no word the manager did
 * not say. These expectations read "Coaching — signed 09/08/2026" before; the
 * managers below never wrote "signed", so the line is "Coaching — 09/08/2026",
 * and a manual they named reads as its title, "JBA Policy Manual" ("jba
 * manual" was "JBA Manual"). "signed" stays when they write it (last block).
 */

describe("1. a prior list keeps every step the manager named", () => {
  const SAID =
    "Avery Holt today under performance for September below goal on sales per guest and add-on sales verbal warning received Open Ended Questions Coaching 9/8/2026, Focus Item Coaching 9/15/2026, New Product Coaching 9/25/2026 not payroll deductible Team Member at Kearney";

  it("lists 9/8, 9/15 and 9/25 on the card, and dates none of them on the form", () => {
    const { slots, response } = remap([SAID], { employeeName: "Avery Holt" });
    expect(lines(slots.priorActions)).toEqual([
      "Coaching — 09/08/2026",
      "Coaching — 09/15/2026",
      "Coaching — 09/25/2026",
    ]);
    expect(response.formProposal?.priorActions).toBe(slots.priorActions);
    expect(slots.incidentDateIso ?? null).toBeNull();
  });

  it("the intent path's reader lists all three", () => {
    expect(statedPriorActions(SAID, TODAY)).toHaveLength(3);
  });
});

describe("2. \"prior verbal 9-1-26\" is a prior action", () => {
  it.each([
    ["prior verbal 9-1-26", "Verbal warning — 09/01/2026"],
    ["previous verbal 9-1-26", "Verbal warning — 09/01/2026"],
    ["prior written 9-1-26", "Written warning — 09/01/2026"],
    ["had a verbal on 9-1-26", "Verbal warning — 09/01/2026"],
    ["prior verbal ca 9-1-26", "Verbal corrective action — 09/01/2026"],
  ])("%s", (phrase, expected) => {
    const { slots } = remap([`create written ca for Test Employee at Kearney. she was late on 10/20/26. ${phrase}. no payroll deduct`], {});
    expect(lines(slots.priorActions)).toEqual([expected]);
    expect(slots.incidentDateIso).toBe("2026-10-20");
  });
});

describe("3 and 4. a labelled history, with a colon or a dash", () => {
  it("\"previous coaching: jba policy manual 1-1-26, verbal ca 9-1-26\" is both lines", () => {
    const { slots } = remap(
      ["create written ca for Test Employee at Kearney. she was late on 10/20/26. previous coaching: jba policy manual 1-1-26, verbal ca 9-1-26. no payroll deduct"],
      {},
    );
    expect(lines(slots.priorActions)).toEqual([
      "Coaching — JBA Policy Manual — 01/01/2026",
      "Verbal corrective action — 09/01/2026",
    ]);
    expect(slots.incidentDateIso).toBe("2026-10-20");
  });

  it("\"previous coaching - jba policy manual 1-20-26\" is one line, never \"Action plan: Previous coaching\" (conv_mvmzmhst2si3jfr)", () => {
    const { slots, response } = remap(
      [
        "create ca form for Test Employee for a register shortage on 10-20-26. payroll deduct applies and $3.25 will be deducted from check. previous coaching - jba policy manual 1-20-26.",
      ],
      // The model's reading production stored (chat_traces.slots).
      { observation: "Register shortage", actionPlan: "Previous coaching" },
    );
    expect(lines(slots.priorActions)).toEqual(["Coaching — JBA Policy Manual — 01/20/2026"]);
    expect(slots.actionPlan).toBeNull();
    expect(response.content).not.toMatch(/Action plan:\*\*\s*Previous coaching/i);
    expect(slots.incidentDateIso).toBe("2026-10-20");
  });
});

describe("5. \"Previous coaching was a Verbal CA 10-1-26\" (conv_mvmzn0sn2pfk6uk)", () => {
  it("is one verbal corrective action, and 10-1-26 is not the form's date", () => {
    const { slots } = remap(
      [
        "create a written corrective action for Team Member, Test Employee. Test was assigned to complete policy acknowledgements in woven by 10-15-26 and failed to meet the deadline. Previous coaching was a Verbal CA 10-1-26. Payroll deduct is not applicable.",
      ],
      { observation: "create a for Team Member" },
    );
    expect(lines(slots.priorActions)).toEqual(["Verbal corrective action — 10/01/2026"]);
    expect(slots.incidentDateIso).not.toBe("2026-10-01");
  });
});

describe("6. \"Her prior coaching is her policy manual ackwnelegement on 9/01\" (conv_mvmzlt9o219eiga)", () => {
  it("is a prior action, and the form stays dated October 11", () => {
    const { slots } = remap(
      [
        "I need a CA form for Test Employee at Kearney for being out of dress code on October 11",
        "This is a verbal warning. Her prior coaching is her policy manual ackwnelegement on 9/01. payroll deduction is not applicable.",
      ],
      { observation: "Employee was out of dress code" },
    );
    expect(lines(slots.priorActions)).toEqual(["Coaching — JBA Policy Manual ackwnelegement — 09/01/2026"]);
    expect(slots.incidentDateIso).toBe("2026-10-11");
  });
});

describe("7. a prior-coaching date never dates the form (conv_mvmznap42vcw0dl)", () => {
  it("dates the form 10-22-26, and the coaching moves to 11-1-25", () => {
    const { slots, response } = remap(
      [
        "do verbal for team member Test Employee at empire, sd. payroll deduct does not apply. previous coaching jba manual 11-1-26. on 10-22-26 Test was not scheduled to work and came into the store to show her team her new puppy. Test was in the store 45 min",
        "jba manual 11-1-25",
        "cite pets in workplace",
        "cite animals in the workplace policy",
        "store location is empire, sd. create corrective action",
      ],
      { jobTitle: "Team Member", observation: "sd. create corrective action" },
    );
    expect(slots.incidentDateIso).toBe("2026-10-22");
    expect(response.formProposal?.formDate).toBe("2026-10-22");
    expect(lines(slots.priorActions)).toEqual(["Coaching — JBA Policy Manual — 11/01/2025"]);
  });
});

/*
 * THE INTENT PATH. With the remap off, a form turn is read by the intent
 * read and the proposal, whose "Prior actions" line is `statedPriorActions`.
 * The intent read took the form's date from every date in the conversation,
 * so the model's "2025-11-01" was accepted (the same turns as case 7).
 */
describe("the intent path reads the same history and the same date", () => {
  const STORES = [{ id: "loc-66", name: "Kearney, NE" }];
  const FIRST =
    "do verbal for team member Test Employee at empire, sd. payroll deduct does not apply. previous coaching jba manual 11-1-26. on 10-22-26 Test was not scheduled to work and came into the store to show her team her new puppy. Test was in the store 45 min";

  it("case 7: the model's 2025-11-01 does not date the form", () => {
    const state = decideIntentTurn({
      question: "jba manual 11-1-25",
      history: [
        { role: "user", content: FIRST },
        { role: "assistant", content: "Can you confirm the correct store name or number?" },
      ],
      today: TODAY,
      saved: null,
      raw: { employee: "Test Employee", store: null, title: "Team Member", incidentType: null, incidentDate: "2025-11-01", payrollAmount: null, warningLevel: "verbal", formType: "CA", formTurn: true },
      people: [],
      stores: STORES,
      headings: ["Standards of Conduct"],
      templates: [{ key: "dpoa", name: "Corrective Action Form" }],
      formInProgress: true,
    }).state;
    expect(state.formDate).toBe("2026-10-22");
  });

  it.each([
    ["Previous coaching was a Verbal CA 10-1-26.", ["Verbal corrective action — 10/01/2026"]],
    ["Her prior coaching is her policy manual ackwnelegement on 9/01.", ["Coaching — JBA Policy Manual ackwnelegement — 09/01/2026"]],
    ["prior verbal 9-1-26", ["Verbal warning — 09/01/2026"]],
    ["previous coaching - jba policy manual 1-20-26.", ["Coaching — JBA Policy Manual — 01/20/2026"]],
    [
      "previous coaching: jba policy manual 1-1-26, verbal ca 9-1-26",
      ["Coaching — JBA Policy Manual — 01/01/2026", "Verbal corrective action — 09/01/2026"],
    ],
  ])("the proposal's prior line for %j", (said, expected) => {
    expect(statedPriorActions(said, TODAY)).toEqual(expected);
  });
});

/*
 * QA decisions, 25 Oct 2026, with REMAP_INCIDENT_FIX_ENABLED (the "previous
 * coaching: …" list reader) and PRIOR_ACTIONS_PARSE_ENABLED (this reader).
 */
describe("the line holds only the manager's words", () => {
  it("\"signed\" is on the line only when the manager wrote it", () => {
    expect(statedPriorActions("prior verbal ca signed 9-1-26", TODAY)).toEqual(["Verbal corrective action — signed 09/01/2026"]);
    expect(statedPriorActions("prior verbal ca 9-1-26", TODAY)).toEqual(["Verbal corrective action — 09/01/2026"]);
  });

  it("off, the line reads as before", () => {
    vi.stubEnv(FLAG, "");
    expect(statedPriorActions("prior verbal ca 9-1-26", TODAY)).toEqual(["Verbal corrective action — signed 09/01/2026"]);
  });
});
