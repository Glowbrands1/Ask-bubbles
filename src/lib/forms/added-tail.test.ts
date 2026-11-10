import { describe, expect, it } from "vitest";

import { addedTail } from "./added-tail";

const OLD = "Observed:\nOttoline Ormsworth was late on 11/5/26.\n\nExpectation:\nOttoline is expected to arrive on time.";

describe("addedTail (ADD_NOT_REPEATED, QA's live Bubbles round 15)", () => {
  it("the field's text run onto one line, then the new sentence: only the new sentence", () => {
    expect(addedTail(OLD, "Observed: Ottoline Ormsworth was late on 11/5/26. Expectation: Ottoline is expected to arrive on time. Ottoline was reminded of the policy.")).toBe(
      "Ottoline was reminded of the policy.",
    );
  });
  it("the field's text as it is, then the new sentence", () => {
    expect(addedTail(OLD, `${OLD}\nOttoline was reminded of the policy.`)).toBe("Ottoline was reminded of the policy.");
  });
  it("a new sentence alone is not a repeat", () => {
    expect(addedTail(OLD, "Ottoline was reminded of the policy.")).toBeNull();
  });
  it("the field's text changed on the way is not a repeat", () => {
    expect(addedTail(OLD, "Observed: Ottoline Ormsworth was late on 11/6/26. Expectation: on time. Reminded.")).toBeNull();
  });
  it("the field's text alone adds nothing", () => {
    expect(addedTail(OLD, OLD.replace(/\n/g, " "))).toBeNull();
  });
});
