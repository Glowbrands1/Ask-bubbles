import { describe, expect, it } from "vitest";

import { withoutStoreGuess } from "./store-guess";

describe("withoutStoreGuess (QA's Bubbles live re-run 2, 22 Nov 2026, A8)", () => {
  it("drops the sentence naming the guessed stores and the question right after it, keeping the rest", () => {
    const live =
      "You have two Sioux Falls stores — Sioux Falls, SD (W 41st St) and Sioux Falls, SD (E 18th St). Which one is this coaching for?\n\nThe team card now includes the new shipping-flow details. Once you confirm the store, it's ready for Create.";
    const out = withoutStoreGuess(live, ["Sioux Falls, SD (W 41st St)", "Sioux Falls, SD (E 18th St)"]);
    expect(out).not.toMatch(/Sioux Falls|Which one/);
    expect(out).toMatch(/^The team card now includes the new shipping-flow details\./);
  });

  it("keeps a question that does not follow a dropped sentence", () => {
    const out = withoutStoreGuess("Does this look right? Updated the card.", ["Sioux Falls, SD (W 41st St)"]);
    expect(out).toBe("Does this look right? Updated the card.");
  });
});
