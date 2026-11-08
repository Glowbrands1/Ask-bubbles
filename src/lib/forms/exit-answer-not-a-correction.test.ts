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

  it("on: a real correction of the person still negates the name", () => {
    expect(readEmployeeMentions("not Jane, it's for Ana Ruiz").negated.map((name) => name.toLowerCase())).toContain("jane");
  });
});
