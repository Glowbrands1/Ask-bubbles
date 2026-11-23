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
    /* QA's ruling (22 Nov 2026, Pau's round 3 U23, option 2 in the card/reply pass only): the first possessive of the named person keeps its owner; a second one in the sentence, or one after a place/time preposition, is "the". CHANGED ON PURPOSE. Was "to show the team the new puppy" (the saved write-up keeps that, HR's 3 Oct design). */
    expect(withoutPersonPronouns("Thaddea came into the store to show her team her new puppy.", "Thaddea").text).toBe("Thaddea came into the store to show Thaddea's team the new puppy.");
    expect(withoutPersonPronouns("She came into the store to show her team her new puppy.", "Thaddea").text).toBe("Thaddea came into the store to show Thaddea's team the new puppy.");
  });

  it("any object possessive of a person already named, not only after a preposition or \"show\"", () => {
    /* QA's ruling (22 Nov 2026, Pau's round 3 U23, option 2 in the card/reply pass only): the first possessive of the named person keeps its owner; a second one in the sentence, or one after a place/time preposition, is "the". CHANGED ON PURPOSE. Was "left the station". */
    expect(withoutPersonPronouns("Fenna also left her station early that day.", "Fenna").text).toBe("Fenna also left Fenna's station early that day.");
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

/*
 * Pau's round 3 (22 Nov 2026, U23; QA's ruling, option 2 in the card/reply pass only): the manager's T5 "Multiple times
 * she has talked about her boyfriend …" and T6 "… constantly bothering them not just about products but about her personal
 * life" read "the boyfriend" and "the personal life" on the card and in the reply: whose it was got lost. The first
 * possessive of the named person keeps its owner; item 19's "the" after a place/time preposition and the R3 puppy's
 * second possessive stay. Invented name (the tester's): Tamsin, the preferred name.
 */
describe("the owner is kept on the first possessive (round 3, U23)", () => {
  it("T5: \"Multiple times she has talked about her boyfriend …\" keeps whose boyfriend", () => {
    const out = withoutPersonPronouns("Multiple times Tamsin has talked about her boyfriend or ex boyfriend with customers.", "Tamsin").text;
    expect(out).toBe("Multiple times Tamsin has talked about Tamsin's boyfriend or ex boyfriend with customers.");
  });
  it("T6: \"… not just about products but about her personal life\" keeps whose personal life", () => {
    const out = withoutPersonPronouns("Tamsin will also follow customers around the store, constantly bothering them not just about products but about her personal life.", "Tamsin").text;
    expect(out).toBe("Tamsin will also follow customers around the store, constantly bothering them not just about products but about Tamsin's personal life.");
    expect(out).not.toMatch(/the personal life/);
  });
  it("control (item 19): after a place or time preposition it is still \"the\"", () => {
    expect(withoutPersonPronouns("Fenna did not come into her scheduled shift today.", "Fenna").text).toBe("Fenna did not come into the scheduled shift today.");
  });
  it("control (QA2's R3): a second possessive in the sentence is \"the\"", () => {
    expect(withoutPersonPronouns("Thaddea came into the store to show her team her new puppy.", "Thaddea").text).toBe("Thaddea came into the store to show Thaddea's team the new puppy.");
  });
});
