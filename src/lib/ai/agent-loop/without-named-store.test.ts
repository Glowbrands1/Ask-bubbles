import { describe, expect, it } from "vitest";

import { withoutNamedSalon } from "./tools";

/* R13 (QA's Bubbles round 2, 22 Nov 2026): the store the manager named leaves the account whole, its state too. */
describe("withoutNamedSalon: a store phrase with its state", () => {
  it("takes \"At Dodge, NE\" out whole at the start of the account", () => {
    expect(withoutNamedSalon("At Dodge, NE on 10/16/26 Testy was not properly measuring and weighing product.", "loc-264")).toBe(
      "On 10/16/26 Testy was not properly measuring and weighing product.",
    );
  });

  it("keeps the sentence's full stop when the phrase ends one mid-account", () => {
    expect(withoutNamedSalon("Testy was late at Dodge, NE. She did not call.", "loc-264")).toBe("Testy was late. She did not call.");
  });

  it("leaves a phrase whose word after the comma is not the store's own (\"at Dodge, she …\")", () => {
    expect(withoutNamedSalon("At Dodge, she was late on 10/16/26.", "loc-264")).toBe("She was late on 10/16/26.");
    expect(withoutNamedSalon("Testy was late at the bank, NE side.", "loc-264")).toBe("Testy was late at the bank, NE side.");
  });
});
