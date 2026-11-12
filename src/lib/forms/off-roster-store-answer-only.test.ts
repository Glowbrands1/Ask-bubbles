import { describe, expect, it } from "vitest";

import { storeOnlyAnswer } from "./off-roster-ask";

/* OFF_ROSTER_STORE_ANSWER_ONLY_ENABLED (QA's #735 ruling, 12 Nov 2026): which replies are only a store. */
describe("storeOnlyAnswer", () => {
  it.each(["dodge", "Dodge", "Omaha, NE (West Dodge Rd)", "at our dodge store"])("only a store: %s", (said) => {
    expect(storeOnlyAnswer(said)).toBe(true);
  });

  it.each(["she was late at dodge", "kira dunmore", "use Kira Dunmore", "yes"])("more than a store, or none: %s", (said) => {
    expect(storeOnlyAnswer(said)).toBe(false);
  });
});
