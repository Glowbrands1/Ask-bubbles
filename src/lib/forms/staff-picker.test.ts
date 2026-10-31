import { describe, expect, it } from "vitest";

import { asksForWholeStaff } from "./staff-picker";

/** QA, 30 Oct 2026: the managers' wording. */
const ASKED = [{ role: "assistant" as const, content: "Here is what I would put on a **Coaching Form**.\n\nWho is this form for?" }];

describe("asksForWholeStaff", () => {
  it.each([
    ["for whole staff - associates", ASKED, true],
    ["can you create a coaching form for my whole staff?", [], true],
    ["a coaching form for all associates", [], true],
    ["coaching form for everyone at the store", [], true],
    ["for whole staff - associates", [], false],
    ["how is the whole team doing on sales?", [], false],
    ["create a coaching form for Marnie Holloway", [], false],
  ])("%s", (said, history, expected) => {
    expect(asksForWholeStaff(said, history)).toBe(expected);
  });
});
