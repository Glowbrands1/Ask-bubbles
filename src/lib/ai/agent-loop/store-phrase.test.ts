import { describe, expect, it } from "vitest";

import { storePhraseLeftInAccount } from "./store-phrase";

/* QA's Bubbles live re-run (22 Nov 2026, A7 follow-up): the card's store, still in its account, by the store reader. */
describe("storePhraseLeftInAccount", () => {
  const manager = "do verbal for team member Wren Halvorsen at empire, sd. payroll deduct does not apply. on 10-22-26 Wren was not scheduled to work and came into the store to show her team her new puppy.";

  it("names the manager's store phrase the model reworded into the account mid-sentence", () => {
    expect(storePhraseLeftInAccount("On 10/22/26 Wren was not scheduled to work and came into the store at Empire to show the team the new puppy.", manager, "loc-225")).toBe("Empire");
  });

  it("another store's street form, too", () => {
    expect(storePhraseLeftInAccount("Testy was at West Dodge measuring product wrong.", "ca for Testy at west dodge. he was not measuring product", "loc-264")).toBe("West Dodge");
  });

  it("nothing when the account no longer names it, or for another store", () => {
    expect(storePhraseLeftInAccount("On 10/22/26 Wren was not scheduled to work and came into the store.", manager, "loc-225")).toBeNull();
    expect(storePhraseLeftInAccount("Wren came in at Empire to show the team.", manager, "loc-338")).toBeNull();
  });

  it("control: a manager who also used the phrase another way (\"at kearney high to show …\") is never flagged", () => {
    const words = "ca for Odile at kearney. she was at kearney high to show the team her puppy";
    expect(storePhraseLeftInAccount("Odile was at kearney high to show the team her puppy.", words, "loc-66")).toBeNull();
  });
});
