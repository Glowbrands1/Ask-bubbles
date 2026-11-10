import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readEmployeeMentions } from "./proposal";

// EXIT_ANSWER_NOT_A_CORRECTION_ENABLED (QA, the Bubbles live tester, 8 Nov 2026). The person and address invented.
const TURN_1 =
  "create an exit for marnie holloway, assistant store manager at lees summit, mo. last day worked 10-26-26. store items not returned and $25 will be payroll deducted for store key. immediate voluntary term, no notice given. payroll deduct applies. drop wage and forfeit bonus. not eligible for rehire. marnie's address is 48 Ne Briar Hollow Lane, lees summit, MO. 64064";

beforeEach(() => {
  vi.stubEnv("EXIT_TERMS_NOT_NAMES_ENABLED", "true");
  vi.stubEnv("EXIT_ANSWER_NOT_A_CORRECTION_ENABLED", "true");
});
afterEach(() => vi.unstubAllEnvs());

describe("EXIT_ANSWER_NOT_A_CORRECTION_ENABLED", () => {
  it("off: \"not returned\" / \"not eligible\" make the turn a correction naming other people (the bug)", () => {
    vi.stubEnv("EXIT_ANSWER_NOT_A_CORRECTION_ENABLED", "");
    const reading = readEmployeeMentions(TURN_1);
    expect(reading.negated).toEqual(expect.arrayContaining(["returned", "eligible"]));
    expect(reading.names.length).toBeGreaterThan(1);
  });

  it("on: the exit answers negate nothing, and the turn names only the employee", () => {
    const reading = readEmployeeMentions(TURN_1);
    expect(reading.negated).toEqual([]);
    expect(reading.names.map((name) => name.toLowerCase())).toEqual(["marnie holloway"]);
  });

  /*
   * The Bubbles gate runner, R6-2 (8 Nov 2026): an exit form typed as lines in turn 2, its last line "… payroll deduction
   * does not apply eligible for rehire". With the flag on, the exit term was dropped and with it the reading of the name
   * line, so the card asked "Who is this Resignation/Exit Form for?". The name on its own line is still the answer.
   */
  const LINES =
    "Thessaly Varrow\nTeam Member Part Time \nNE Omaha Dodge\nGave notice - fulfilled notice\nGave notice 9/25/26 - date notice fulfilled 10/9/26\nResigning to pursue other career options\nStore items returned payroll deduction does not apply eligible for rehire";

  it("on: an exit form typed as lines keeps the name on its own line", () => {
    const reading = readEmployeeMentions(LINES);
    expect(reading.negated).toEqual([]);
    expect(reading.names).toEqual(["Thessaly Varrow"]);
    expect(reading.explicit).toBe(true);
  });

  it("off: the same lines read the same name, as before", () => {
    vi.stubEnv("EXIT_ANSWER_NOT_A_CORRECTION_ENABLED", "");
    expect(readEmployeeMentions(LINES).names).toEqual(["Thessaly Varrow"]);
  });

  it("on: turn 1 on one line names no clause as a person (no own line)", () => {
    expect(readEmployeeMentions(TURN_1).names.map((name) => name.toLowerCase())).toEqual(["marnie holloway"]);
  });

  it("on: a real correction of the person still negates the name", () => {
    expect(readEmployeeMentions("not Jane, it's for Ana Ruiz").negated.map((name) => name.toLowerCase())).toContain("jane");
  });
});
