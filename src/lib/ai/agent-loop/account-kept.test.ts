import { describe, expect, it } from "vitest";

import { unaskedAccountChange } from "./account-kept";

const SHOWN = "On 10/22/26, Wren was not scheduled to work and came into the store to show the team the new puppy. Wren was in the store 45 min.";

describe("unaskedAccountChange (A7 T5, QA's option 2)", () => {
  it("a role line the manager's latest message does not bring is unasked", () => {
    expect(unaskedAccountChange(SHOWN, `Wren is a team member. ${SHOWN}`, "store location is empire, sd. create corrective action")).toBe(true);
  });

  it("a punctuation-only change is unasked; spacing alone is no change", () => {
    expect(unaskedAccountChange(SHOWN, SHOWN.replace("10/22/26,", "10/22/26"), "store location is empire, sd. create corrective action")).toBe(true);
    expect(unaskedAccountChange(SHOWN, SHOWN.replace(". ", ".  "), "anything")).toBe(false);
  });

  it("a change the manager's latest message brings (a word added or dropped) is asked", () => {
    expect(unaskedAccountChange(SHOWN, SHOWN.replace("45 min", "30 min"), "she was in the store 30 min, not 45")).toBe(false);
    expect(unaskedAccountChange(SHOWN, `${SHOWN} She also yelled at a guest.`, "she also yelled at a guest")).toBe(false);
    expect(unaskedAccountChange(SHOWN, SHOWN.replace(" to show the team the new puppy", ""), "take out the part about the puppy")).toBe(false);
  });
});
