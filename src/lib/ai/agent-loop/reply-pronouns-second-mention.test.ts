import { describe, expect, it } from "vitest";

import { withoutPersonPronouns } from "./reply-pronouns";

/*
 * Ported from the sibling app (its QA, 20 Nov 2026, item 19; the production audit; names invented, `replay-pack/loop-roster.ts`): the name-for-pronoun swap read clumsily, "<P> did not
 * come into <P>'s scheduled shift today". A second mention of the same person in one sentence reads naturally, and no
 * she/her is kept.
 */
describe("withoutPersonPronouns: the person's second mention in a sentence", () => {
  it("a possessive after a preposition is 'the'", () => {
    expect(withoutPersonPronouns("Fenna did not come into her scheduled shift today.", "Fenna").text).toBe(
      "Fenna did not come into the scheduled shift today.",
    );
    expect(withoutPersonPronouns("She did not come in for her 9:30 shift.", "Fenna").text).toBe("Fenna did not come in for the 9:30 shift.");
  });

  it("a repeated subject after 'and' is dropped", () => {
    expect(withoutPersonPronouns("Fenna came in late and she left early.", "Fenna").text).toBe("Fenna came in late and left early.");
  });

  it("the first mention, and a possessive that is not after a preposition, keep the name", () => {
    expect(withoutPersonPronouns("She said her car broke down.", "Fenna").text).toBe("Fenna said Fenna's car broke down.");
    expect(withoutPersonPronouns("The form is ready. Her shift starts at 9.", "Fenna").text).toBe("The form is ready. Fenna's shift starts at 9.");
  });

  it("never keeps a pronoun", () => {
    for (const line of ["Fenna did not come into her scheduled shift today.", "Fenna came in late and she left early.", "She was late to her shift and she did not call."]) {
      expect(withoutPersonPronouns(line, "Fenna").text).not.toMatch(/\b(?:she|her|he|him|his)\b/i);
    }
  });
});
