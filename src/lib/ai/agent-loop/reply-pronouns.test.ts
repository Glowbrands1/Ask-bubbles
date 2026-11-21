import { describe, expect, it } from "vitest";

import { withoutPersonPronouns } from "./reply-pronouns";

/*
 * Ported from the sibling app (its QA live retest, 20 Nov 2026, masked): the lead was named in T1 and is not on the
 * roster, so on T2 ("a corrective action") no other name was known, and "<A>'s shift lead, <L>, told her …" read <A> as
 * the teller. The teller is the subject before the verb, known or not; a possessive never tells. Invented names only:
 * Fenna (the loop cases' roster, `replay-pack/loop-roster.ts`) and Corwin Ashdale, the lead (nobody on the roster).
 */
describe("withoutPersonPronouns: the teller need not be a known name (the person told, across turns)", () => {
  it("\"Fenna's shift lead, Corwin Ashdale, told her …\" and \"Her shift lead, …\" name Fenna, with no other name known", () => {
    expect(withoutPersonPronouns("**Observation of Offense:** Fenna's shift lead, Corwin Ashdale, told her to clock out early and she refused.", "Fenna", []).text)
      .toBe("**Observation of Offense:** Fenna's shift lead, Corwin Ashdale, told Fenna to clock out early and Fenna refused.");
    // Changed on purpose (port from the sibling app, QA2's live R3, 21 Nov 2026): the opening "Her" is the plain "The" when the told listener is named later in the sentence.
    expect(withoutPersonPronouns("**Observation of Offense:** Her shift lead, Corwin Ashdale, told her to clock out early and she refused.", "Fenna", []).text)
      .toBe("**Observation of Offense:** The shift lead, Corwin Ashdale, told Fenna to clock out early and Fenna refused.");
  });
});
