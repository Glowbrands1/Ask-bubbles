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
// These pin TERSE_SLOT_READ alone. With TERSE_COMMAND_ONLY_ENABLED on as well,
// a "ca for <name> …" sentence is left as typed on purpose (QA, 26 Oct 2026),
// pinned in terse-command-only.test.ts, so that flag is cleared here.
const COMMAND_ONLY = "TERSE_COMMAND_ONLY_ENABLED";
const savedCommandOnly = process.env[COMMAND_ONLY];
beforeEach(() => {
  delete process.env[COMMAND_ONLY];
});
afterEach(() => {
  if (saved === undefined) delete process.env[FLAG];
  else process.env[FLAG] = saved;
  if (savedCommandOnly === undefined) delete process.env[COMMAND_ONLY];
  else process.env[COMMAND_ONLY] = savedCommandOnly;
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

/**
 * The flag-on twin (coordinator rule, 26 Oct 2026). Changed on purpose with
 * TERSE_COMMAND_ONLY_ENABLED on as well: a "ca for <name> …" sentence is left
 * as typed, so the readers read it as the request it already is.
 */
describe("expandTerseRequest with TERSE_COMMAND_ONLY_ENABLED on", () => {
  it("leaves the 'ca for' sentence as typed, in lowercase and capitals", () => {
    process.env[COMMAND_ONLY] = "on";
    const sentence = "ca for quenby arlott not opening store on time and no call no show";
    expect(expandTerseRequest(sentence, TODAY)).toBe(sentence);
    expect(expandTerseRequest(sentence.toUpperCase(), TODAY)).toBe(sentence.toUpperCase());
    expect(expandTerseRequest(CASES[0]![0], TODAY)).toBe(CASES[0]![1]);
  });
});
