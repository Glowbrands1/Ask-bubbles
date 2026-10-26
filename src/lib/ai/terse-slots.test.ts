import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { detectTemplateIntent } from "@/lib/forms/template-intent";

import { expandTerseRequest, withTerseSlots } from "./terse-slots";
import type { AskRequest } from "./types";

/**
 * conv_mvofim8a2lqx6jn and QA batches B2-B5 (25 Oct 2026): the managers'
 * terse turns exactly, with invented names (Quenby Arlott, Tamsin Vedder).
 * Each is also run all-caps.
 */
const FLAG = "TERSE_SLOT_READ_ENABLED";
const saved = process.env[FLAG];
const NO_NAME = "TERSE_INCIDENT_NO_NAME_ENABLED";
const savedNoName = process.env[NO_NAME];
// The strings below are TERSE_INCIDENT_NO_NAME off, whatever the run sets; its flag-on twins are at the end.
beforeEach(() => {
  delete process.env[NO_NAME];
});
afterEach(() => {
  if (saved === undefined) delete process.env[FLAG];
  else process.env[FLAG] = saved;
  if (savedNoName === undefined) delete process.env[NO_NAME];
  else process.env[NO_NAME] = savedNoName;
});

const TODAY = "2026-10-25";

const CASES: readonly [string, string][] = [
  ["ca quenby arlott kearney dress code 10/11 verbal", "Create a corrective action form for quenby arlott at kearney. On 10/11/26 quenby arlott dress code. This is a verbal warning."],
  [
    "verbal ca quenby arlott 10-10-26 visitors at work 40 min talking w friend ignoring guests prev coaching jba manual 1-1-26 no payroll dodge, ne tm",
    "Create a corrective action form for quenby arlott at dodge, ne, Team Member. On 10-10-26 quenby arlott visitors at work 40 min talking w friend ignoring guests prev coaching jba manual 1-1-26. This is a verbal warning. Payroll deduct is not applicable.",
  ],
  ["coaching quenby arlott tanned on clock 9-28-26 tm dodge, ne", "Create a coaching form for quenby arlott at dodge, ne, Team Member. On 9-28-26 quenby arlott tanned on clock."],
  ["coach tamsin vedder", "Create a coaching form for tamsin vedder."],
  [
    "exit form quenby arlott tm dodge, ne last day 10/9/26 resigned eligible for rehire",
    "Create an exit form for quenby arlott at dodge, ne, Team Member. last day 10/9/26 resigned eligible for rehire.",
  ],
];

describe("withTerseSlots", () => {
  it("passes the request on as it is with the flag off", () => {
    delete process.env[FLAG];
    const input = { question: CASES[0]![0], history: [], context: { todayIso: TODAY } } as unknown as AskRequest;
    expect(withTerseSlots(input)).toBe(input);
  });

  it("writes the terse turn out as the long form with the flag on", () => {
    process.env[FLAG] = "on";
    const out = withTerseSlots({ question: CASES[0]![0], history: [], context: { todayIso: TODAY } } as unknown as AskRequest);
    expect(out.question).toBe(CASES[0]![1]);
  });
});

describe("expandTerseRequest", () => {
  it.each(CASES)("writes out %s", (terse, long) => {
    expect(expandTerseRequest(terse, TODAY)).toBe(long);
  });

  it.each(CASES)("reads %s the same in capitals", (terse) => {
    const name = terse.includes("tamsin") ? "tamsin vedder" : "quenby arlott";
    expect(expandTerseRequest(terse.toUpperCase(), TODAY).toLowerCase()).toContain(`form for ${name}`);
  });

  it("the written-out requests name their form, and the store is never part of the name", () => {
    expect(detectTemplateIntent(CASES[0]![1])).toEqual({ kind: "explicit", templateKey: "dpoa" });
    expect(detectTemplateIntent(CASES[2]![1])).toEqual({ kind: "explicit", templateKey: "coaching" });
    for (const [, long] of CASES) expect(long).not.toMatch(/for quenby arlott (?:kearney|dodge)/);
  });

  it("leaves questions, topics, sentences and other uses of the words as typed", () => {
    for (const text of [
      "ca",
      "show me the ca for quenby arlott",
      "Sacramento, CA",
      "what is the exit process?",
      "exit process",
      "coaching tips for new hires",
      "ca for quenby arlott. she was late on 10-2.",
      "create a ca for quenby arlott",
    ]) {
      expect(expandTerseRequest(text, TODAY)).toBe(text);
    }
  });
});

/*
 * CHANGED ON PURPOSE, TERSE_INCIDENT_NO_NAME_ENABLED on (QA, 26 Oct 2026): the
 * incident sentence no longer repeats the employee's name ("On 9-20-26,
 * opened late 15 min"); the name stays in the request sentence, and the date,
 * level and deduction are unchanged. Flag off keeps the strings above.
 */
const CASES_NO_NAME: readonly [string, string][] = [
  [
    "ca quenby arlott kearney dress code 10/11 verbal",
    "Create a corrective action form for quenby arlott at kearney. On 10/11/26, dress code. This is a verbal warning.",
  ],
  [
    "verbal ca quenby arlott 10-10-26 visitors at work 40 min talking w friend ignoring guests prev coaching jba manual 1-1-26 no payroll dodge, ne tm",
    "Create a corrective action form for quenby arlott at dodge, ne, Team Member. On 10-10-26, visitors at work 40 min talking w friend ignoring guests prev coaching jba manual 1-1-26. This is a verbal warning. Payroll deduct is not applicable.",
  ],
  [
    "coaching quenby arlott tanned on clock 9-28-26 tm dodge, ne",
    "Create a coaching form for quenby arlott at dodge, ne, Team Member. On 9-28-26, tanned on clock.",
  ],
  [
    "coach tamsin vedder",
    "Create a coaching form for tamsin vedder.",
  ],
  [
    "exit form quenby arlott tm dodge, ne last day 10/9/26 resigned eligible for rehire",
    "Create an exit form for quenby arlott at dodge, ne, Team Member. last day 10/9/26 resigned eligible for rehire.",
  ],
];

describe("expandTerseRequest with TERSE_INCIDENT_NO_NAME_ENABLED on", () => {
  it.each(CASES_NO_NAME)("writes out %s", (terse, long) => {
    process.env[NO_NAME] = "true";
    expect(expandTerseRequest(terse, TODAY)).toBe(long);
  });

  it("withTerseSlots writes the terse turn out the same way", () => {
    process.env[FLAG] = "on";
    process.env[NO_NAME] = "true";
    const out = withTerseSlots({ question: CASES_NO_NAME[0]![0], history: [], context: { todayIso: TODAY } } as unknown as AskRequest);
    expect(out.question).toBe(CASES_NO_NAME[0]![1]);
  });
});
