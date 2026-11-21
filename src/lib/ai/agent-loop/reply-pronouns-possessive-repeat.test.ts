import { describe, expect, it } from "vitest";

import { withoutPersonPronouns } from "./reply-pronouns";

/*
 * Port from the sibling app (QA2's live R3, 21 Nov 2026): the manager typed "…came into the store to show her team her new
 * puppy". The saved write-up read "… to show the team the new puppy", but the reply and the card's issue text read "to
 * show <P>'s team <P>'s new puppy". The reply/card pass writes the person's possessive the way the saved write-up does:
 * once the person is named in the sentence, an object "her <thing>" is "the <thing>". It keeps the name after a
 * conjunction, at a clause start, after "with"/"of", and in reported speech. This one rule replaces this app's earlier
 * extension (a possessive right after "show", and the next object after one already made "the"). Invented names
 * (`replay-pack/loop-roster.ts`; Corwin Ashdale is the lead, nobody on the roster).
 */
describe("the person's possessive, once they are named in the sentence", () => {
  it("QA2's R3: \"to show her team her new puppy\" reads as the saved write-up does", () => {
    expect(withoutPersonPronouns("Thaddea came into the store to show her team her new puppy.", "Thaddea").text).toBe("Thaddea came into the store to show the team the new puppy.");
    expect(withoutPersonPronouns("She came into the store to show her team her new puppy.", "Thaddea").text).toBe("Thaddea came into the store to show the team the new puppy.");
  });

  it("any object possessive of a person already named, not only after a preposition or \"show\"", () => {
    expect(withoutPersonPronouns("Fenna also left her station early that day.", "Fenna").text).toBe("Fenna also left the station early that day.");
  });

  it("the first mention in a sentence is still the name, and reported speech keeps the owner", () => {
    expect(withoutPersonPronouns("Her phone was out on the floor.", "Fenna").text).toBe("Fenna's phone was out on the floor.");
    expect(withoutPersonPronouns("She said her car broke down.", "Fenna").text).toBe("Fenna said Fenna's car broke down.");
  });

  /*
   * QA2's live R3 (the sibling's f059 case): "Her shift lead told her to go home and she refused" read "<P>'s shift lead,
   * <L>, told <P> to go home and <P> refused". The listener of the lead's instruction is named (f059: never a pronoun, never
   * dropped), so the possessive that opens the sentence is the plain "The shift lead".
   */
  it("QA2's R3: the opening possessive is plain when the listener is named later in the sentence", () => {
    expect(withoutPersonPronouns("Her shift lead, Corwin Ashdale, told her to go home and she refused.", "Fenna", ["Corwin Ashdale"]).text).toBe("The shift lead, Corwin Ashdale, told Fenna to go home and Fenna refused.");
    expect(withoutPersonPronouns("Her shift lead told her to go home and she refused.", "Fenna").text).toBe("The shift lead told Fenna to go home and Fenna refused.");
  });
});
