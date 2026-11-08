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
});
