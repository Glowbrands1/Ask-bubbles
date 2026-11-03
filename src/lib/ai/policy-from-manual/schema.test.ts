import { describe, expect, it } from "vitest";

import { PolicyPick, policyPickJsonSchema } from "./schema";

/** Step A: the approved five-field schema plus `alternatives` and `asks_about_policy` (STEP_A_PROPOSAL section 4). */

describe("PolicyPick", () => {
  it("matches the approved JSON schema", () => {
    expect(policyPickJsonSchema()).toMatchSnapshot();
  });

  it("accepts a pick and refuses one missing a field", () => {
    const pick = {
      section_title: "Attendance",
      page: 14,
      chunk_id: "idx-41",
      quote: "It is the responsibility of each employee to know his or her work schedule and to always be on time.",
      confidence: 0.9,
      alternatives: [],
      asks_about_policy: false,
    };
    expect(PolicyPick.safeParse(pick).success).toBe(true);
    expect(PolicyPick.safeParse({ ...pick, quote: undefined }).success).toBe(false);
  });
});
