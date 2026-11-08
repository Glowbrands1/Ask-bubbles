import { afterEach, describe, expect, it, vi } from "vitest";

import { readEmployeeMentions } from "./proposal";

vi.mock("server-only", () => ({}));

/** REQUEST_FROM_NAMES_EMPLOYEE_ENABLED (QA, 8 Nov 2026; the managers' wording, word for word). */
const SAID = "Please create another corrective action from marnie holloway. This would be a verbal due to not completing her woven courses by the deadline";

afterEach(() => vi.unstubAllEnvs());

describe("\"<form> from <name>\"", () => {
  it("names nobody with the flag off (as before), the employee with it on", () => {
    expect(readEmployeeMentions(SAID).names).toEqual([]);
    vi.stubEnv("REQUEST_FROM_NAMES_EMPLOYEE_ENABLED", "1");
    expect(readEmployeeMentions(SAID).names.map((name) => name.toLowerCase())).toEqual(["marnie holloway"]);
  });

  it("never reads a word that cannot start a name", () => {
    vi.stubEnv("REQUEST_FROM_NAMES_EMPLOYEE_ENABLED", "1");
    expect(readEmployeeMentions("redo the corrective action from last week").names).toEqual([]);
    expect(readEmployeeMentions("the coaching form from my district manager").names).toEqual([]);
  });

  /*
   * QA, the Bubbles round-5 gate (8 Nov 2026): corrective-action-warning-level-e2e's "… she has a written warning
   * from august" read ["rosalyn test", "august"] with the flag on. A month, a weekday or a word that says when is never
   * a person after "from", in any case.
   */
  it.each([
    "she has a written warning from august",
    "she has a written warning from August",
    "a verbal warning from aug",
    "the coaching form from monday",
    "a written warning from Tuesday",
    "the corrective action from last week",
    "a coaching from the summer",
    "a written warning from q3",
    "the warning from previous review",
    "a ca from october 2025",
  ])("%s: names nobody", (text) => {
    vi.stubEnv("REQUEST_FROM_NAMES_EMPLOYEE_ENABLED", "1");
    expect(readEmployeeMentions(text).names).toEqual([]);
  });

  it("the gate's sentence: only the employee, with the flag on and off", () => {
    const said = "create a ca form for marnie holloway, she was late again for 30 mins today. given verbal warning on 9/21. she has a written warning from august";
    expect(readEmployeeMentions(said).names.map((name) => name.toLowerCase())).toEqual(["marnie holloway"]);
    vi.stubEnv("REQUEST_FROM_NAMES_EMPLOYEE_ENABLED", "1");
    expect(readEmployeeMentions(said).names.map((name) => name.toLowerCase())).toEqual(["marnie holloway"]);
  });
});
