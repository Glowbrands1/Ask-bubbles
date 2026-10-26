import { afterEach, describe, expect, it, vi } from "vitest";

import { fieldLines } from "@/lib/ai/intake-augment";
import { decideIntentTurn, type IntentTurnInput } from "@/lib/ai/intent-slots";
import {
  blankYearlessStepDates,
  datesInTextWithYearless,
  heldCoachingDates,
  listFormDates,
  listIncidentDates,
  priorStepDate,
} from "@/lib/forms/form-date-answer";
import { incidentDates } from "@/lib/forms/incident-dates";
import { statedPriorActions } from "@/lib/forms/prior-actions";
import { readReopenRequest } from "@/lib/forms/reopen-request";
import { managerStatedWarningLevel, statedWarningLevel, warningLevelFromTurns } from "@/lib/forms/warning-level";

/**
 * ============================================================================
 * QA, 26 OCT 2026 — PRIOR ACTIONS TYPED WITH NO COMMA BETWEEN THEM
 * ============================================================================
 *
 * The manager's words, as QA reported them:
 *
 *   "prior coaching verbal 6/25 written 7/28 no deduct"
 *
 * With PRIOR_ACTIONS_PARSE_ENABLED (on in production) the second prior action
 * read "Written warning — verbal 6/25 — 07/28/2026": with no comma, 7/28 was
 * no list item, and the labelled-step reader took every word back to "prior
 * coaching" as its topic. "prior coaching: verbal 6/25, written 7/28" read
 * cleanly. PRIOR_ACTIONS_NO_COMMA_ENABLED lets a step item set off by spaces
 * alone continue the list, each item holding only its own words.
 *
 * Every case runs all lowercase, in sentence case, and in sentence case with
 * names and levels Capitalized. Names are invented ("Test Employee", "Test
 * Store"). Year-less dates take TODAY's year, passed in as the other
 * year-less suites do (`app/api/chat/prior-actions-yearless-oct25.test.ts`).
 */

const TODAY = "2026-10-26";

const PRIORS = ["Verbal warning — 06/25/2026", "Written warning — 07/28/2026"];

/** All lowercase; sentence case; sentence case with names and levels Capitalized. */
function variants(text: string): string[] {
  const lower = text.toLowerCase();
  const sentence = lower.replace(/(^|[.!?]\s+)([a-z])/g, (_, lead: string, letter: string) => lead + letter.toUpperCase());
  const capitalized = sentence.replace(
    /\b(verbal|written|final|coaching|coachings|test employee|test store|rowan pell)\b/g,
    (word) => word.replace(/\b[a-z]/g, (letter) => letter.toUpperCase()),
  );
  return [...new Set([lower, sentence, capitalized])];
}

function flags(parse: boolean, noComma: boolean): void {
  vi.stubEnv("PRIOR_ACTIONS_PARSE_ENABLED", parse ? "1" : "");
  vi.stubEnv("PRIOR_ACTIONS_NO_COMMA_ENABLED", noComma ? "1" : "");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

const FLAG_ON: { text: string; priors: string[]; incidents: string[] }[] = [
  { text: "prior coaching verbal 6/25 written 7/28 no deduct", priors: PRIORS, incidents: [] },
  { text: "prior coaching verbal 6/25/2026 written 7/28/2026", priors: PRIORS, incidents: [] },
  { text: "previous coaching verbal 6/25 written 7/28", priors: PRIORS, incidents: [] },
  {
    text: "prior verbal 9/1 written 9/15",
    priors: ["Verbal warning — 09/01/2026", "Written warning — 09/15/2026"],
    incidents: [],
  },
  { text: "no prior", priors: [], incidents: [] },
  // Neighbours that already read cleanly and must keep doing so.
  { text: "prior coaching: verbal 6/25, written 7/28", priors: PRIORS, incidents: [] },
  {
    text: "previous coaching. she was late (10/20/2026) and left early (10/22/2026)",
    priors: [],
    incidents: ["2026-10-20", "2026-10-22"],
  },
  {
    text: "create a written ca for Test Employee at Test Store, late to open 10/20/2026. prior coaching verbal 6/25 written 7/28 no deduct",
    priors: PRIORS,
    incidents: ["2026-10-20"],
  },
];

/*
 * ============================================================================
 * QA, 26 OCT 2026 (THE SIBLING APP'S ROUND 3, PORTED) — A MANAGER'S REGISTER
 * ============================================================================
 *
 * The sibling app's two turns, carried over in this app's store wording, the
 * employee invented ("Rowan Pell"):
 *
 *   (1) "ca rowan pell written 10/22 back room station 4 prior coaching verbal
 *       6/25 written 7/28 no deduct" — the list after an incident date, in a
 *       longer turn, reads as two clean priors with the flag on.
 *
 *   (2) "perf ca rowan pell 270 units below goal upt atv verbal prior
 *       coachings 9/8 9/15 9/25 no deduct" — the priors accumulated
 *       ("Coaching — 9/8 — 09/15/2026; Coaching — 9/8 9/15 — 09/25/2026"),
 *       and Type of Warning was blank though the manager said "verbal". The
 *       form's date was never a prior's here: `groundDate` takes the slot
 *       model's date only from the form-date reader's own list (pinned below).
 */
const QA_ONE = "ca rowan pell written 10/22 back room station 4 prior coaching verbal 6/25 written 7/28 no deduct";
const QA_TWO = "perf ca rowan pell 270 units below goal upt atv verbal prior coachings 9/8 9/15 9/25 no deduct";
const COACHINGS = ["Coaching — 09/08/2026", "Coaching — 09/15/2026", "Coaching — 09/25/2026"];

FLAG_ON.push(
  { text: QA_ONE, priors: PRIORS, incidents: ["2026-10-22"] },
  { text: QA_TWO, priors: COACHINGS, incidents: [] },
  { text: "prior coachings 9/8 9/15 9/25", priors: COACHINGS, incidents: [] },
  { text: "prior coachings 9/8, 9/15 and 9/25", priors: COACHINGS, incidents: [] },
  { text: "prior coachings: 9/8 9/15 9/25", priors: COACHINGS, incidents: [] },
  {
    text: "prior coaching 9/8 9/15",
    priors: ["Coaching — 09/08/2026", "Coaching — 09/15/2026"],
    incidents: [],
  },
  // The incident date the turn gives is kept; the bare list stays history.
  {
    text: "perf ca rowan pell below goal on 10/20 verbal prior coachings 9/8 9/15 9/25 no deduct",
    priors: COACHINGS,
    incidents: ["2026-10-20"],
  },
  // An account after the list ends it: "late again 10/20" is an incident.
  {
    text: "prior coachings 9/8 9/15 late again 10/20",
    priors: ["Coaching — 09/08/2026", "Coaching — 09/15/2026"],
    incidents: ["2026-10-20"],
  },
);

describe("PRIOR_ACTIONS_NO_COMMA_ENABLED on (with PRIOR_ACTIONS_PARSE_ENABLED, as in production)", () => {
  for (const { text, priors, incidents } of FLAG_ON) {
    for (const variant of variants(text)) {
      it(`"${variant}"`, () => {
        flags(true, true);
        expect(statedPriorActions(variant, TODAY)).toEqual(priors);
        expect(incidentDates(variant, TODAY)).toEqual(incidents);
      });
    }
  }
});

/*
 * THE FORM'S DATE AND TYPE OF WARNING, through the intent reading
 * (`decideIntentTurn`, the production path), with the slot model's reading as
 * it came back: the first date, the last one, or none.
 */
function turn(question: string, incidentDate: string | null) {
  const input: IntentTurnInput = {
    question,
    history: [],
    today: TODAY,
    saved: null,
    raw: { employee: "Rowan Pell", incidentDate, warningLevel: null, formType: "corrective action", formTurn: true },
    people: [],
    stores: [{ id: "store-test", name: "Test Store" }],
    headings: ["Attendance", "Standards of Conduct"],
    templates: [{ key: "dpoa", name: "Corrective Action Form" }],
    formInProgress: false,
  };
  return decideIntentTurn(input).state;
}

describe("(2) the form's date and level, flag on", () => {
  for (const variant of variants(QA_TWO)) {
    for (const model of ["9/8", "9/25", null]) {
      for (const managerOnly of [true, false]) {
        it(`"${variant}" (model ${model ?? "none"}, WARNING_LEVEL_MANAGER_ONLY_ENABLED ${managerOnly ? "on" : "off"})`, () => {
          flags(true, true);
          vi.stubEnv("WARNING_LEVEL_MANAGER_ONLY_ENABLED", managerOnly ? "1" : "");
          const state = turn(variant, model);
          // No incident date in the turn: dated the day it is created, never a prior coaching's date.
          expect(state.formDate).toBeNull();
          expect(state.warningLevel).toBe("verbal");
          expect(listIncidentDates(variant, TODAY)).toEqual([]);
        });
      }
    }
  }

  it("a turn that gives its incident date keeps it, whatever the model copied", () => {
    flags(true, true);
    const said = "perf ca rowan pell below goal on 10/20 verbal prior coachings 9/8 9/15 9/25 no deduct";
    for (const model of ["10/20", "9/25", null]) expect(turn(said, model).formDate).toBe("2026-10-20");
  });

  it("(1): dated 10/22, whatever the model copied", () => {
    flags(true, true);
    for (const model of ["10/22", "7/28", null]) expect(turn(QA_ONE, model).formDate).toBe("2026-10-22");
  });
});

describe("(2c) the level before the history label (warning-level.ts)", () => {
  it("is this form's level in every register, flag on", () => {
    flags(true, true);
    for (const variant of variants(QA_TWO)) {
      expect(statedWarningLevel(variant, TODAY)).toBe("verbal");
      expect(warningLevelFromTurns([variant], TODAY)).toBe("verbal");
      expect(managerStatedWarningLevel([{ role: "user", content: variant }], TODAY)).toBe("verbal");
    }
    expect(statedWarningLevel("ca rowan pell late to open 10/20 written prior warnings 9/1 9/15", TODAY)).toBe("written");
  });

  it("is never read after words of history, or without a request for the form", () => {
    flags(true, true);
    expect(statedWarningLevel("she had a verbal prior coaching 9/8", TODAY)).toBeNull();
    expect(statedWarningLevel("ca rowan pell, she got a verbal prior coaching 9/8", TODAY)).toBeNull();
    expect(statedWarningLevel("verbal prior coachings 9/8 9/15", TODAY)).toBeNull();
    // A level stated for the form elsewhere is untouched.
    expect(statedWarningLevel("create a written ca for rowan pell. verbal prior coachings 9/8 9/15", TODAY)).toBe("written");
    expect(statedWarningLevel(QA_ONE, TODAY)).toBeNull();
  });

  it("flag off, or without PRIOR_ACTIONS_PARSE_ENABLED, it reads as before (pinned)", () => {
    for (const [parse, noComma] of [
      [true, false],
      [false, true],
      [false, false],
    ] as const) {
      flags(parse, noComma);
      expect(statedWarningLevel(QA_TWO, TODAY)).toBeNull();
      expect(warningLevelFromTurns([QA_TWO], TODAY)).toBeNull();
    }
  });
});

/*
 * ============================================================================
 * QA, 26 OCT 2026 (BOTH APPS) — A PRIOR IN A SHORT SECOND SENTENCE
 * ============================================================================
 *
 * The tester's turn, in this app's store wording, the employee invented:
 *
 *   "Write up Rowan Pell, Assistant Manager, Kearney, no call no show today.
 *    I coached her on 10-16 and gave a verbal on 10-21."
 *
 * No prior action was listed, and the form was dated 10/21: the held-coaching
 * reader ran back across "10-16 and gave a verbal on" and took the verbal for
 * the coaching, so the intake's yearless line read "It happened on
 * 10/21/2026". With PRIOR_ACTIONS_NO_COMMA_ENABLED on, both are listed, and
 * neither is "it happened on".
 */
const NCNS = "Write up Rowan Pell, Assistant Manager, Kearney, no call no show today. I coached her on 10-16 and gave a verbal on 10-21.";
const NCNS_PRIORS = ["Coaching — 10/16/2026", "Verbal warning — 10/21/2026"];

/** QA's casings: all lowercase, sentence case, ALL CAPS, the name typed lowercase or Capitalized. */
const NCNS_CASINGS = [
  NCNS.toLowerCase(),
  NCNS,
  NCNS.replace("Rowan Pell", "rowan pell"),
  NCNS.replace("Rowan Pell", "rowan pell").replace("Assistant Manager", "assistant manager"),
  NCNS.toUpperCase(),
];

/** The intake's "It happened on …" line, the date the plain proposal flow puts on the form. */
const happened = (said: string) => fieldLines(said, TODAY).filter((line) => line.startsWith("It happened on"));

describe("a prior in a short second sentence (flag on)", () => {
  for (const said of NCNS_CASINGS) {
    it(`"${said}"`, () => {
      flags(true, true);
      expect(statedPriorActions(said, TODAY)).toEqual(NCNS_PRIORS);
      expect(incidentDates(said, TODAY)).toEqual([]);
      expect(listIncidentDates(said, TODAY)).toEqual([]);
      // Neither is "it happened on …": the incident was today, and both are history.
      expect(blankYearlessStepDates(said, TODAY)).not.toMatch(/10-16|10-21/);
      expect(happened(said)).toEqual([]);
      for (const model of ["10-21", "10-16", null]) expect(turn(said, model).formDate).toBeNull();
    });
  }

  it.each([
    ["write up rowan pell, no call no show today. I coached her on 10-16.", ["Coaching — 10/16/2026"]],
    ["write up rowan pell, no call no show today. she already got a verbal on 10-21.", ["Verbal warning — 10/21/2026"]],
    ["write up rowan pell, no call no show today. had a written on 10-21.", ["Written warning — 10/21/2026"]],
    ["write up rowan pell, no call no show today. I coached her on 10/16 and gave a verbal on 10/21.", NCNS_PRIORS],
  ])("%s", (said, priors) => {
    flags(true, true);
    expect(statedPriorActions(said, TODAY)).toEqual(priors);
    expect(incidentDates(said, TODAY)).toEqual([]);
  });

  it("a Coaching Form's own coaching is still its date, and is never blanked", () => {
    flags(true, true);
    const coaching = "coaching form for rowan pell, she was late on 10/5 and 10/15, I coached her on 10/16";
    expect(heldCoachingDates(coaching, TODAY)).toEqual(["2026-10-16"]);
    const yearless = "coaching form for rowan pell, she was late on 10-5 and 10-15, I coached her on 10-16";
    expect(blankYearlessStepDates(yearless, TODAY)).toBe(yearless);
    expect(happened(yearless)).toEqual(["It happened on 10/16/2026."]);
  });

  it("flag off: no prior is listed, and the verbal's date is \"it happened on\" (QA's defect, pinned)", () => {
    flags(true, false);
    for (const said of NCNS_CASINGS) {
      expect(statedPriorActions(said, TODAY)).toEqual([]);
      expect(happened(said)).toEqual(["It happened on 10/21/2026."]);
    }
  });
});

describe("PRIOR_ACTIONS_NO_COMMA_ENABLED off: today's output, pinned", () => {
  // Pinned on purpose: this is the defect QA reported, the second line keeping
  // the first item's words. The new flag off must leave it byte for byte.
  const GARBLED: [string, string[]][] = [
    ["prior coaching verbal 6/25 written 7/28 no deduct", ["Verbal warning — 06/25/2026", "Written warning — verbal 6/25 — 07/28/2026"]],
    ["prior coaching verbal 6/25/2026 written 7/28/2026", ["Verbal warning — 06/25/2026", "Written warning — verbal 6/25/2026 — 07/28/2026"]],
    ["previous coaching verbal 6/25 written 7/28", ["Verbal warning — 06/25/2026", "Written warning — verbal 6/25 — 07/28/2026"]],
    ["prior verbal 9/1 written 9/15", ["Verbal warning — 09/01/2026", "Written warning — 9/1 — 09/15/2026"]],
    [
      "create a written ca for Test Employee at Test Store, late to open 10/20/2026. prior coaching verbal 6/25 written 7/28 no deduct",
      ["Verbal warning — 06/25/2026", "Written warning — verbal 6/25 — 07/28/2026"],
    ],
  ];
  for (const [text, priors] of GARBLED) {
    it(`"${text}" with PRIOR_ACTIONS_PARSE_ENABLED alone`, () => {
      flags(true, false);
      expect(statedPriorActions(text, TODAY)).toEqual(priors);
    });
  }

  it("(2): the priors accumulate and the level is blank (QA's defect)", () => {
    flags(true, false);
    expect(statedPriorActions(QA_TWO, TODAY)).toEqual([
      "Coaching — 09/08/2026",
      "Coaching — 9/8 — 09/15/2026",
      "Coaching — 9/8 9/15 — 09/25/2026",
    ]);
    expect(statedPriorActions("prior coachings 9/8, 9/15 and 9/25", TODAY)).toEqual(["Coaching — 09/08/2026"]);
    expect(incidentDates("prior coachings 9/8, 9/15 and 9/25", TODAY)).toEqual(["2026-09-15", "2026-09-25"]);
    // Here the model's copy of a prior's date never dated the form (`groundDate`).
    expect(turn(QA_TWO, "9/25").formDate).toBeNull();
    vi.stubEnv("WARNING_LEVEL_MANAGER_ONLY_ENABLED", "1");
    expect(turn(QA_TWO, null).warningLevel).toBeNull();
  });

  it("(2) with the new flag on but PRIOR_ACTIONS_PARSE_ENABLED off, the same as off", () => {
    flags(false, false);
    const before = { priors: statedPriorActions(QA_TWO, TODAY), date: turn(QA_TWO, "9/25").formDate };
    flags(false, true);
    expect({ priors: statedPriorActions(QA_TWO, TODAY), date: turn(QA_TWO, "9/25").formDate }).toEqual(before);
  });

  it("Capitalized levels keep the manager's casing in the garbled line", () => {
    flags(true, false);
    expect(statedPriorActions("Prior coaching Verbal 6/25 Written 7/28 no deduct", TODAY)).toEqual([
      "Verbal warning — 06/25/2026",
      "Written warning — Verbal 6/25 — 07/28/2026",
    ]);
  });

  it("the new flag without PRIOR_ACTIONS_PARSE_ENABLED changes nothing", () => {
    const text = "prior coaching verbal 6/25 written 7/28 no deduct";
    flags(false, false);
    const before = statedPriorActions(text, TODAY);
    expect(before).toEqual(["Verbal warning — signed 06/25/2026", "Written warning — verbal 6/25 — signed 07/28/2026"]);
    flags(false, true);
    expect(statedPriorActions(text, TODAY)).toEqual(before);
    expect(statedPriorActions("prior verbal 9/1 written 9/15", TODAY)).toEqual([]);
    expect(incidentDates("prior verbal 9/1 written 9/15", TODAY)).toEqual(["2026-09-01", "2026-09-15"]);
  });
});

/*
 * ============================================================================
 * NEVER-BREAK: FLAG OFF == MAIN, WITH THE PRODUCTION FLAGS ON
 * ============================================================================
 *
 * PRIOR_ACTIONS_PARSE_ENABLED and REOPEN_VERB_GUARD_ENABLED are on in
 * production, and this change touches the readers both use. With
 * PRIOR_ACTIONS_NO_COMMA_ENABLED off, every reader below must return exactly
 * what main returns. `MAIN_OUTPUTS` was captured by running these inputs on
 * origin/main (e7a61f3) with the same three flags, and is hard-coded on
 * purpose: if this test fails, the flag-off path has changed — fix the code,
 * never the snapshot.
 *
 * The inputs are the manager turns this file's tests use plus ordinary
 * prior-actions and reopen turns, each as typed, all lowercase and in
 * sentence case. Names are invented ("Rowan Pell", "Test Store").
 */
const NEVER_BREAK_CASES = [
  "prior coaching verbal 6/25 written 7/28 no deduct",
  "prior verbal 9/1 written 9/15",
  QA_ONE,
  QA_TWO,
  "prior coachings 9/8, 9/15 and 9/25",
  NCNS,
  "coaching form for rowan pell, she was late on 10-5 and 10-15, I coached her on 10-16",
  "Create a verbal CA for Rowan Pell, late to open 10/20/2026. She had a coaching on 9/15/2026.",
  "Written warning for Rowan Pell, no call no show on 10-24. Previous verbal 9-15 and coaching 8-1.",
  "Final CA for Rowan Pell at Test Store. Prior actions: verbal 8/1, written 9/1.",
  "Rowan Pell was late 10/22 and left early 10/23. No prior actions.",
  "reopen the written ca for rowan pell, she was coached on 9-15",
  "Can you reopen the coaching form for Rowan Pell? Prior verbal 9-15 written 10-1.",
];

/** As typed; all lowercase; sentence case. */
function casings(text: string): string[] {
  const lower = text.toLowerCase();
  const sentence = lower.replace(/(^|[.!?]\s+)([a-z])/g, (_, lead: string, letter: string) => lead + letter.toUpperCase());
  return [...new Set([text, lower, sentence])];
}

/** Every reader this change touches, as the flag-off snapshot records it. */
function readers(said: string) {
  const { formDate, warningLevel } = turn(said, null);
  return {
    priors: statedPriorActions(said, TODAY),
    incidents: incidentDates(said, TODAY),
    listIncident: listIncidentDates(said, TODAY).map((d) => `${d.iso}@${d.index}`),
    listForm: listFormDates(said, TODAY).map((d) => `${d.iso}@${d.index}`),
    yearless: datesInTextWithYearless(said, TODAY).map((d) => `${d.iso}@${d.index}`),
    blanked: blankYearlessStepDates(said, TODAY),
    held: heldCoachingDates(said, TODAY),
    priorStep: priorStepDate(said, TODAY),
    fields: fieldLines(said, TODAY),
    level: statedWarningLevel(said, TODAY),
    levelTurns: warningLevelFromTurns([said], TODAY),
    managerLevel: managerStatedWarningLevel([{ role: "user", content: said }], TODAY),
    intent: { formDate, warningLevel },
    reopen: readReopenRequest(said),
  };
}

// Captured on origin/main e7a61f3 (same on b86bfd7) with PRIOR_ACTIONS_PARSE_ENABLED=1 and REOPEN_VERB_GUARD_ENABLED=1.
const MAIN_OUTPUTS: Record<string, ReturnType<typeof readers>> = {
  "prior coaching verbal 6/25 written 7/28 no deduct": {
    "priors": [
      "Verbal warning — 06/25/2026",
      "Written warning — verbal 6/25 — 07/28/2026"
    ],
    "incidents": [],
    "listIncident": [],
    "listForm": [],
    "yearless": [
      "2026-06-25@22",
      "2026-07-28@35"
    ],
    "blanked": "prior coaching verbal 6/25 written 7/28 no deduct",
    "held": [],
    "priorStep": "2026-07-28",
    "fields": [],
    "level": null,
    "levelTurns": null,
    "managerLevel": null,
    "intent": {
      "formDate": null,
      "warningLevel": null
    },
    "reopen": null
  },
  "Prior coaching verbal 6/25 written 7/28 no deduct": {
    "priors": [
      "Verbal warning — 06/25/2026",
      "Written warning — verbal 6/25 — 07/28/2026"
    ],
    "incidents": [],
    "listIncident": [],
    "listForm": [],
    "yearless": [
      "2026-06-25@22",
      "2026-07-28@35"
    ],
    "blanked": "Prior coaching verbal 6/25 written 7/28 no deduct",
    "held": [],
    "priorStep": "2026-07-28",
    "fields": [],
    "level": null,
    "levelTurns": null,
    "managerLevel": null,
    "intent": {
      "formDate": null,
      "warningLevel": null
    },
    "reopen": null
  },
  "prior verbal 9/1 written 9/15": {
    "priors": [
      "Verbal warning — 09/01/2026",
      "Written warning — 9/1 — 09/15/2026"
    ],
    "incidents": [],
    "listIncident": [],
    "listForm": [],
    "yearless": [
      "2026-09-01@13",
      "2026-09-15@25"
    ],
    "blanked": "prior verbal 9/1 written 9/15",
    "held": [],
    "priorStep": "2026-09-15",
    "fields": [],
    "level": null,
    "levelTurns": null,
    "managerLevel": null,
    "intent": {
      "formDate": null,
      "warningLevel": null
    },
    "reopen": null
  },
  "Prior verbal 9/1 written 9/15": {
    "priors": [
      "Verbal warning — 09/01/2026",
      "Written warning — 9/1 — 09/15/2026"
    ],
    "incidents": [],
    "listIncident": [],
    "listForm": [],
    "yearless": [
      "2026-09-01@13",
      "2026-09-15@25"
    ],
    "blanked": "Prior verbal 9/1 written 9/15",
    "held": [],
    "priorStep": "2026-09-15",
    "fields": [],
    "level": null,
    "levelTurns": null,
    "managerLevel": null,
    "intent": {
      "formDate": null,
      "warningLevel": null
    },
    "reopen": null
  },
  "ca rowan pell written 10/22 back room station 4 prior coaching verbal 6/25 written 7/28 no deduct": {
    "priors": [
      "Verbal warning — 06/25/2026",
      "Written warning — verbal 6/25 — 07/28/2026"
    ],
    "incidents": [
      "2026-10-22"
    ],
    "listIncident": [
      "2026-10-22@22"
    ],
    "listForm": [
      "2026-10-22@22"
    ],
    "yearless": [
      "2026-10-22@22",
      "2026-06-25@70",
      "2026-07-28@83"
    ],
    "blanked": "ca rowan pell written 10/22 back room station 4 prior coaching verbal 6/25 written 7/28 no deduct",
    "held": [],
    "priorStep": "2026-07-28",
    "fields": [],
    "level": null,
    "levelTurns": null,
    "managerLevel": null,
    "intent": {
      "formDate": "2026-10-22",
      "warningLevel": null
    },
    "reopen": null
  },
  "Ca rowan pell written 10/22 back room station 4 prior coaching verbal 6/25 written 7/28 no deduct": {
    "priors": [
      "Verbal warning — 06/25/2026",
      "Written warning — verbal 6/25 — 07/28/2026"
    ],
    "incidents": [
      "2026-10-22"
    ],
    "listIncident": [
      "2026-10-22@22"
    ],
    "listForm": [
      "2026-10-22@22"
    ],
    "yearless": [
      "2026-10-22@22",
      "2026-06-25@70",
      "2026-07-28@83"
    ],
    "blanked": "Ca rowan pell written 10/22 back room station 4 prior coaching verbal 6/25 written 7/28 no deduct",
    "held": [],
    "priorStep": "2026-07-28",
    "fields": [],
    "level": null,
    "levelTurns": null,
    "managerLevel": null,
    "intent": {
      "formDate": "2026-10-22",
      "warningLevel": null
    },
    "reopen": null
  },
  "perf ca rowan pell 270 units below goal upt atv verbal prior coachings 9/8 9/15 9/25 no deduct": {
    "priors": [
      "Coaching — 09/08/2026",
      "Coaching — 9/8 — 09/15/2026",
      "Coaching — 9/8 9/15 — 09/25/2026"
    ],
    "incidents": [],
    "listIncident": [],
    "listForm": [],
    "yearless": [
      "2026-09-08@71",
      "2026-09-15@75",
      "2026-09-25@80"
    ],
    "blanked": "perf ca rowan pell 270 units below goal upt atv verbal prior coachings 9/8 9/15 9/25 no deduct",
    "held": [],
    "priorStep": "2026-09-25",
    "fields": [],
    "level": null,
    "levelTurns": null,
    "managerLevel": null,
    "intent": {
      "formDate": null,
      "warningLevel": "verbal"
    },
    "reopen": null
  },
  "Perf ca rowan pell 270 units below goal upt atv verbal prior coachings 9/8 9/15 9/25 no deduct": {
    "priors": [
      "Coaching — 09/08/2026",
      "Coaching — 9/8 — 09/15/2026",
      "Coaching — 9/8 9/15 — 09/25/2026"
    ],
    "incidents": [],
    "listIncident": [],
    "listForm": [],
    "yearless": [
      "2026-09-08@71",
      "2026-09-15@75",
      "2026-09-25@80"
    ],
    "blanked": "Perf ca rowan pell 270 units below goal upt atv verbal prior coachings 9/8 9/15 9/25 no deduct",
    "held": [],
    "priorStep": "2026-09-25",
    "fields": [],
    "level": null,
    "levelTurns": null,
    "managerLevel": null,
    "intent": {
      "formDate": null,
      "warningLevel": "verbal"
    },
    "reopen": null
  },
  "prior coachings 9/8, 9/15 and 9/25": {
    "priors": [
      "Coaching — 09/08/2026"
    ],
    "incidents": [
      "2026-09-15",
      "2026-09-25"
    ],
    "listIncident": [
      "2026-09-15@21",
      "2026-09-25@30"
    ],
    "listForm": [
      "2026-09-15@21",
      "2026-09-25@30"
    ],
    "yearless": [
      "2026-09-08@16",
      "2026-09-15@21",
      "2026-09-25@30"
    ],
    "blanked": "prior coachings 9/8, 9/15 and 9/25",
    "held": [],
    "priorStep": "2026-09-08",
    "fields": [],
    "level": null,
    "levelTurns": null,
    "managerLevel": null,
    "intent": {
      "formDate": null,
      "warningLevel": null
    },
    "reopen": null
  },
  "Prior coachings 9/8, 9/15 and 9/25": {
    "priors": [
      "Coaching — 09/08/2026"
    ],
    "incidents": [
      "2026-09-15",
      "2026-09-25"
    ],
    "listIncident": [
      "2026-09-15@21",
      "2026-09-25@30"
    ],
    "listForm": [
      "2026-09-15@21",
      "2026-09-25@30"
    ],
    "yearless": [
      "2026-09-08@16",
      "2026-09-15@21",
      "2026-09-25@30"
    ],
    "blanked": "Prior coachings 9/8, 9/15 and 9/25",
    "held": [],
    "priorStep": "2026-09-08",
    "fields": [],
    "level": null,
    "levelTurns": null,
    "managerLevel": null,
    "intent": {
      "formDate": null,
      "warningLevel": null
    },
    "reopen": null
  },
  "Write up Rowan Pell, Assistant Manager, Kearney, no call no show today. I coached her on 10-16 and gave a verbal on 10-21.": {
    "priors": [],
    "incidents": [],
    "listIncident": [],
    "listForm": [],
    "yearless": [],
    "blanked": "Write up Rowan Pell, Assistant Manager, Kearney, no call no show today. I coached her on 10-16 and gave a verbal on 10-21.",
    "held": [],
    "priorStep": null,
    "fields": [
      "It happened on 10/21/2026."
    ],
    "level": null,
    "levelTurns": null,
    "managerLevel": null,
    "intent": {
      "formDate": null,
      "warningLevel": "verbal"
    },
    "reopen": null
  },
  "write up rowan pell, assistant manager, kearney, no call no show today. i coached her on 10-16 and gave a verbal on 10-21.": {
    "priors": [],
    "incidents": [],
    "listIncident": [],
    "listForm": [],
    "yearless": [],
    "blanked": "write up rowan pell, assistant manager, kearney, no call no show today. i coached her on 10-16 and gave a verbal on 10-21.",
    "held": [],
    "priorStep": null,
    "fields": [
      "It happened on 10/21/2026."
    ],
    "level": null,
    "levelTurns": null,
    "managerLevel": null,
    "intent": {
      "formDate": null,
      "warningLevel": "verbal"
    },
    "reopen": null
  },
  "Write up rowan pell, assistant manager, kearney, no call no show today. I coached her on 10-16 and gave a verbal on 10-21.": {
    "priors": [],
    "incidents": [],
    "listIncident": [],
    "listForm": [],
    "yearless": [],
    "blanked": "Write up rowan pell, assistant manager, kearney, no call no show today. I coached her on 10-16 and gave a verbal on 10-21.",
    "held": [],
    "priorStep": null,
    "fields": [
      "It happened on 10/21/2026."
    ],
    "level": null,
    "levelTurns": null,
    "managerLevel": null,
    "intent": {
      "formDate": null,
      "warningLevel": "verbal"
    },
    "reopen": null
  },
  "coaching form for rowan pell, she was late on 10-5 and 10-15, I coached her on 10-16": {
    "priors": [],
    "incidents": [],
    "listIncident": [],
    "listForm": [],
    "yearless": [
      "2026-10-05@46",
      "2026-10-15@55"
    ],
    "blanked": "coaching form for rowan pell, she was late on 10-5 and 10-15, I coached her on 10-16",
    "held": [],
    "priorStep": null,
    "fields": [
      "It happened on 10/16/2026."
    ],
    "level": null,
    "levelTurns": null,
    "managerLevel": null,
    "intent": {
      "formDate": null,
      "warningLevel": null
    },
    "reopen": null
  },
  "coaching form for rowan pell, she was late on 10-5 and 10-15, i coached her on 10-16": {
    "priors": [],
    "incidents": [],
    "listIncident": [],
    "listForm": [],
    "yearless": [
      "2026-10-05@46",
      "2026-10-15@55"
    ],
    "blanked": "coaching form for rowan pell, she was late on 10-5 and 10-15, i coached her on 10-16",
    "held": [],
    "priorStep": null,
    "fields": [
      "It happened on 10/16/2026."
    ],
    "level": null,
    "levelTurns": null,
    "managerLevel": null,
    "intent": {
      "formDate": null,
      "warningLevel": null
    },
    "reopen": null
  },
  "Coaching form for rowan pell, she was late on 10-5 and 10-15, i coached her on 10-16": {
    "priors": [],
    "incidents": [],
    "listIncident": [],
    "listForm": [],
    "yearless": [
      "2026-10-05@46",
      "2026-10-15@55"
    ],
    "blanked": "Coaching form for rowan pell, she was late on 10-5 and 10-15, i coached her on 10-16",
    "held": [],
    "priorStep": null,
    "fields": [
      "It happened on 10/16/2026."
    ],
    "level": null,
    "levelTurns": null,
    "managerLevel": null,
    "intent": {
      "formDate": null,
      "warningLevel": null
    },
    "reopen": null
  },
  "Create a verbal CA for Rowan Pell, late to open 10/20/2026. She had a coaching on 9/15/2026.": {
    "priors": [
      "Coaching — 09/15/2026"
    ],
    "incidents": [
      "2026-10-20"
    ],
    "listIncident": [
      "2026-10-20@48"
    ],
    "listForm": [
      "2026-10-20@48"
    ],
    "yearless": [
      "2026-10-20@48",
      "2026-09-15@82"
    ],
    "blanked": "Create a verbal CA for Rowan Pell, late to open 10/20/2026. She had a coaching on 9/15/2026.",
    "held": [],
    "priorStep": "2026-09-15",
    "fields": [],
    "level": "verbal",
    "levelTurns": "verbal",
    "managerLevel": "verbal",
    "intent": {
      "formDate": "2026-10-20",
      "warningLevel": "verbal"
    },
    "reopen": null
  },
  "create a verbal ca for rowan pell, late to open 10/20/2026. she had a coaching on 9/15/2026.": {
    "priors": [
      "Coaching — 09/15/2026"
    ],
    "incidents": [
      "2026-10-20"
    ],
    "listIncident": [
      "2026-10-20@48"
    ],
    "listForm": [
      "2026-10-20@48"
    ],
    "yearless": [
      "2026-10-20@48",
      "2026-09-15@82"
    ],
    "blanked": "create a verbal ca for rowan pell, late to open 10/20/2026. she had a coaching on 9/15/2026.",
    "held": [],
    "priorStep": "2026-09-15",
    "fields": [],
    "level": "verbal",
    "levelTurns": "verbal",
    "managerLevel": "verbal",
    "intent": {
      "formDate": "2026-10-20",
      "warningLevel": "verbal"
    },
    "reopen": null
  },
  "Create a verbal ca for rowan pell, late to open 10/20/2026. She had a coaching on 9/15/2026.": {
    "priors": [
      "Coaching — 09/15/2026"
    ],
    "incidents": [
      "2026-10-20"
    ],
    "listIncident": [
      "2026-10-20@48"
    ],
    "listForm": [
      "2026-10-20@48"
    ],
    "yearless": [
      "2026-10-20@48",
      "2026-09-15@82"
    ],
    "blanked": "Create a verbal ca for rowan pell, late to open 10/20/2026. She had a coaching on 9/15/2026.",
    "held": [],
    "priorStep": "2026-09-15",
    "fields": [],
    "level": "verbal",
    "levelTurns": "verbal",
    "managerLevel": "verbal",
    "intent": {
      "formDate": "2026-10-20",
      "warningLevel": "verbal"
    },
    "reopen": null
  },
  "Written warning for Rowan Pell, no call no show on 10-24. Previous verbal 9-15 and coaching 8-1.": {
    "priors": [
      "Verbal warning — 09/15/2026",
      "Coaching — 08/01/2026"
    ],
    "incidents": [],
    "listIncident": [],
    "listForm": [],
    "yearless": [
      "2026-10-24@51",
      "2026-09-15@74",
      "2026-08-01@92"
    ],
    "blanked": "Written warning for Rowan Pell, no call no show on 10-24. Previous verbal      and coaching    .",
    "held": [],
    "priorStep": "2026-09-15",
    "fields": [
      "It happened on 10/24/2026."
    ],
    "level": "written",
    "levelTurns": "written",
    "managerLevel": "written",
    "intent": {
      "formDate": null,
      "warningLevel": null
    },
    "reopen": null
  },
  "written warning for rowan pell, no call no show on 10-24. previous verbal 9-15 and coaching 8-1.": {
    "priors": [
      "Verbal warning — 09/15/2026",
      "Coaching — 08/01/2026"
    ],
    "incidents": [],
    "listIncident": [],
    "listForm": [],
    "yearless": [
      "2026-10-24@51",
      "2026-09-15@74",
      "2026-08-01@92"
    ],
    "blanked": "written warning for rowan pell, no call no show on 10-24. previous verbal      and coaching    .",
    "held": [],
    "priorStep": "2026-09-15",
    "fields": [
      "It happened on 10/24/2026."
    ],
    "level": "written",
    "levelTurns": "written",
    "managerLevel": "written",
    "intent": {
      "formDate": null,
      "warningLevel": null
    },
    "reopen": null
  },
  "Written warning for rowan pell, no call no show on 10-24. Previous verbal 9-15 and coaching 8-1.": {
    "priors": [
      "Verbal warning — 09/15/2026",
      "Coaching — 08/01/2026"
    ],
    "incidents": [],
    "listIncident": [],
    "listForm": [],
    "yearless": [
      "2026-10-24@51",
      "2026-09-15@74",
      "2026-08-01@92"
    ],
    "blanked": "Written warning for rowan pell, no call no show on 10-24. Previous verbal      and coaching    .",
    "held": [],
    "priorStep": "2026-09-15",
    "fields": [
      "It happened on 10/24/2026."
    ],
    "level": "written",
    "levelTurns": "written",
    "managerLevel": "written",
    "intent": {
      "formDate": null,
      "warningLevel": null
    },
    "reopen": null
  },
  "Final CA for Rowan Pell at Test Store. Prior actions: verbal 8/1, written 9/1.": {
    "priors": [
      "Verbal warning — 08/01/2026",
      "Written warning — 09/01/2026"
    ],
    "incidents": [],
    "listIncident": [],
    "listForm": [],
    "yearless": [
      "2026-08-01@61",
      "2026-09-01@74"
    ],
    "blanked": "Final CA for Rowan Pell at Test Store. Prior actions: verbal 8/1, written 9/1.",
    "held": [],
    "priorStep": "2026-09-01",
    "fields": [],
    "level": "final_warning",
    "levelTurns": "final_warning",
    "managerLevel": null,
    "intent": {
      "formDate": null,
      "warningLevel": null
    },
    "reopen": null
  },
  "final ca for rowan pell at test store. prior actions: verbal 8/1, written 9/1.": {
    "priors": [
      "Verbal warning — 08/01/2026",
      "Written warning — 09/01/2026"
    ],
    "incidents": [],
    "listIncident": [],
    "listForm": [],
    "yearless": [
      "2026-08-01@61",
      "2026-09-01@74"
    ],
    "blanked": "final ca for rowan pell at test store. prior actions: verbal 8/1, written 9/1.",
    "held": [],
    "priorStep": "2026-09-01",
    "fields": [],
    "level": "final_warning",
    "levelTurns": "final_warning",
    "managerLevel": null,
    "intent": {
      "formDate": null,
      "warningLevel": null
    },
    "reopen": null
  },
  "Final ca for rowan pell at test store. Prior actions: verbal 8/1, written 9/1.": {
    "priors": [
      "Verbal warning — 08/01/2026",
      "Written warning — 09/01/2026"
    ],
    "incidents": [],
    "listIncident": [],
    "listForm": [],
    "yearless": [
      "2026-08-01@61",
      "2026-09-01@74"
    ],
    "blanked": "Final ca for rowan pell at test store. Prior actions: verbal 8/1, written 9/1.",
    "held": [],
    "priorStep": "2026-09-01",
    "fields": [],
    "level": "final_warning",
    "levelTurns": "final_warning",
    "managerLevel": null,
    "intent": {
      "formDate": null,
      "warningLevel": null
    },
    "reopen": null
  },
  "Rowan Pell was late 10/22 and left early 10/23. No prior actions.": {
    "priors": [],
    "incidents": [
      "2026-10-22",
      "2026-10-23"
    ],
    "listIncident": [
      "2026-10-22@20",
      "2026-10-23@41"
    ],
    "listForm": [
      "2026-10-22@20",
      "2026-10-23@41"
    ],
    "yearless": [
      "2026-10-22@20",
      "2026-10-23@41"
    ],
    "blanked": "Rowan Pell was late 10/22 and left early 10/23. No prior actions.",
    "held": [],
    "priorStep": null,
    "fields": [],
    "level": null,
    "levelTurns": null,
    "managerLevel": null,
    "intent": {
      "formDate": null,
      "warningLevel": null
    },
    "reopen": null
  },
  "rowan pell was late 10/22 and left early 10/23. no prior actions.": {
    "priors": [],
    "incidents": [
      "2026-10-22",
      "2026-10-23"
    ],
    "listIncident": [
      "2026-10-22@20",
      "2026-10-23@41"
    ],
    "listForm": [
      "2026-10-22@20",
      "2026-10-23@41"
    ],
    "yearless": [
      "2026-10-22@20",
      "2026-10-23@41"
    ],
    "blanked": "rowan pell was late 10/22 and left early 10/23. no prior actions.",
    "held": [],
    "priorStep": null,
    "fields": [],
    "level": null,
    "levelTurns": null,
    "managerLevel": null,
    "intent": {
      "formDate": null,
      "warningLevel": null
    },
    "reopen": null
  },
  "Rowan pell was late 10/22 and left early 10/23. No prior actions.": {
    "priors": [],
    "incidents": [
      "2026-10-22",
      "2026-10-23"
    ],
    "listIncident": [
      "2026-10-22@20",
      "2026-10-23@41"
    ],
    "listForm": [
      "2026-10-22@20",
      "2026-10-23@41"
    ],
    "yearless": [
      "2026-10-22@20",
      "2026-10-23@41"
    ],
    "blanked": "Rowan pell was late 10/22 and left early 10/23. No prior actions.",
    "held": [],
    "priorStep": null,
    "fields": [],
    "level": null,
    "levelTurns": null,
    "managerLevel": null,
    "intent": {
      "formDate": null,
      "warningLevel": null
    },
    "reopen": null
  },
  "reopen the written ca for rowan pell, she was coached on 9-15": {
    "priors": [
      "Coaching — 09/15/2026"
    ],
    "incidents": [],
    "listIncident": [],
    "listForm": [],
    "yearless": [
      "2026-09-15@57"
    ],
    "blanked": "reopen the written ca for rowan pell, she was coached on     ",
    "held": [],
    "priorStep": "2026-09-15",
    "fields": [],
    "level": null,
    "levelTurns": null,
    "managerLevel": null,
    "intent": {
      "formDate": null,
      "warningLevel": "written"
    },
    "reopen": null
  },
  "Reopen the written ca for rowan pell, she was coached on 9-15": {
    "priors": [
      "Coaching — 09/15/2026"
    ],
    "incidents": [],
    "listIncident": [],
    "listForm": [],
    "yearless": [
      "2026-09-15@57"
    ],
    "blanked": "Reopen the written ca for rowan pell, she was coached on     ",
    "held": [],
    "priorStep": "2026-09-15",
    "fields": [],
    "level": null,
    "levelTurns": null,
    "managerLevel": null,
    "intent": {
      "formDate": null,
      "warningLevel": "written"
    },
    "reopen": null
  },
  "Can you reopen the coaching form for Rowan Pell? Prior verbal 9-15 written 10-1.": {
    "priors": [
      "Verbal warning — 09/15/2026"
    ],
    "incidents": [],
    "listIncident": [],
    "listForm": [],
    "yearless": [
      "2026-09-15@62",
      "2026-10-01@75"
    ],
    "blanked": "Can you reopen the coaching form for Rowan Pell? Prior verbal      written 10-1.",
    "held": [],
    "priorStep": "2026-09-15",
    "fields": [],
    "level": null,
    "levelTurns": null,
    "managerLevel": null,
    "intent": {
      "formDate": null,
      "warningLevel": null
    },
    "reopen": {
      "mode": "edit",
      "templateKey": "coaching",
      "asksChange": false
    }
  },
  "can you reopen the coaching form for rowan pell? prior verbal 9-15 written 10-1.": {
    "priors": [
      "Verbal warning — 09/15/2026"
    ],
    "incidents": [],
    "listIncident": [],
    "listForm": [],
    "yearless": [
      "2026-09-15@62",
      "2026-10-01@75"
    ],
    "blanked": "can you reopen the coaching form for rowan pell? prior verbal      written 10-1.",
    "held": [],
    "priorStep": "2026-09-15",
    "fields": [],
    "level": null,
    "levelTurns": null,
    "managerLevel": null,
    "intent": {
      "formDate": null,
      "warningLevel": null
    },
    "reopen": {
      "mode": "edit",
      "templateKey": "coaching",
      "asksChange": false
    }
  },
  "Can you reopen the coaching form for rowan pell? Prior verbal 9-15 written 10-1.": {
    "priors": [
      "Verbal warning — 09/15/2026"
    ],
    "incidents": [],
    "listIncident": [],
    "listForm": [],
    "yearless": [
      "2026-09-15@62",
      "2026-10-01@75"
    ],
    "blanked": "Can you reopen the coaching form for rowan pell? Prior verbal      written 10-1.",
    "held": [],
    "priorStep": "2026-09-15",
    "fields": [],
    "level": null,
    "levelTurns": null,
    "managerLevel": null,
    "intent": {
      "formDate": null,
      "warningLevel": null
    },
    "reopen": {
      "mode": "edit",
      "templateKey": "coaching",
      "asksChange": false
    }
  }
};

describe("NEVER-BREAK: PRIOR_ACTIONS_NO_COMMA_ENABLED off, with PRIOR_ACTIONS_PARSE_ENABLED and REOPEN_VERB_GUARD_ENABLED on, reads exactly as main", () => {
  const inputs = NEVER_BREAK_CASES.flatMap(casings);

  function productionFlags(noComma: boolean): void {
    vi.stubEnv("PRIOR_ACTIONS_PARSE_ENABLED", "1");
    vi.stubEnv("REOPEN_VERB_GUARD_ENABLED", "1");
    vi.stubEnv("PRIOR_ACTIONS_NO_COMMA_ENABLED", noComma ? "1" : "");
  }

  it("covers every input main was run on, and no other", () => {
    expect(inputs.length).toBe(33);
    expect([...inputs].sort()).toEqual(Object.keys(MAIN_OUTPUTS).sort());
  });

  for (const said of inputs) {
    it(`"${said}"`, () => {
      productionFlags(false);
      expect(readers(said)).toEqual(MAIN_OUTPUTS[said]);
    });
  }

  it("the same inputs read differently with the flag on (the snapshot exercises the changed code)", () => {
    productionFlags(true);
    const changed = inputs.filter((said) => JSON.stringify(readers(said)) !== JSON.stringify(MAIN_OUTPUTS[said]));
    expect(changed.length).toBeGreaterThan(0);
  });
});
