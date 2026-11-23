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

/*
 * Ported from the sibling app (its QA's live R13 on its main, 22 Nov 2026): the manager typed "at Dodge, NE. location."
 * and the live account kept "Location, on 10/16/26 …" or "On 10/16/26 location, Testy …": the phrase and its state left,
 * the word that closed the manager's place phrase stayed. A word of the phrase itself (the store's name or the place words
 * the phrase is already read with) after the state, up to the phrase's comma or full stop, leaves with it.
 */
describe("withoutNamedSalon: the phrase's own place word after the state", () => {
  it("takes \"At Dodge, NE location,\" out whole", () => {
    expect(withoutNamedSalon("At Dodge, NE location, on 10/16/26 Testy was not properly measuring and weighing product.", "loc-264")).toBe(
      "On 10/16/26 Testy was not properly measuring and weighing product.",
    );
  });

  it("takes \"At Dodge, NE. location.\" out whole, as the manager typed it", () => {
    expect(withoutNamedSalon("At Dodge, NE. location. On 10/16/26 Testy was not properly measuring and weighing product.", "loc-264")).toBe(
      "On 10/16/26 Testy was not properly measuring and weighing product.",
    );
  });

  it("takes \"at Dodge, NE location,\" out after the date (the live card: \"On 10/16/26 location, Testy …\")", () => {
    expect(withoutNamedSalon("On 10/16/26 at Dodge, NE location, Testy was not properly measuring and weighing product.", "loc-264")).toBe(
      "On 10/16/26 Testy was not properly measuring and weighing product.",
    );
  });

  it("mid-account, keeps the sentence's own full stop once", () => {
    expect(withoutNamedSalon("Testy was late at Dodge, NE. location. She did not call.", "loc-264")).toBe("Testy was late. She did not call.");
    expect(withoutNamedSalon("Testy was late at Dodge, NE store, on 10/16/26.", "loc-264")).toBe("Testy was late on 10/16/26.");
  });

  it("keeps words after the state that are not the phrase's (\"NE on 10/16/26\", \"NE side\")", () => {
    expect(withoutNamedSalon("At Dodge, NE on 10/16/26 Testy was late.", "loc-264")).toBe("On 10/16/26 Testy was late.");
    expect(withoutNamedSalon("Testy was late at the bank, NE side.", "loc-264")).toBe("Testy was late at the bank, NE side.");
  });
});

/*
 * QA's Bubbles live re-run (23 Nov 2026, A1; production 9340334): T3 "Create the coaching form with the information given.
 * Her name is <P> and she is at Dodge. She is a makery associate" got the card's account "<First>, was 10 minutes late to
 * the shift on 10/5." The model wrote the store as an aside ("<P>, at Dodge, was …"), and the strip took the phrase and its
 * closing comma but left the opening one. A store phrase between two commas leaves with one of them; a comma after the
 * phrase that closes an earlier aside (", a makery associate at Dodge, was") stays.
 */
describe("withoutNamedSalon: commas around a store phrase", () => {
  it("takes an aside \", at Dodge,\" out with one of its commas", () => {
    expect(withoutNamedSalon("Della, at Dodge, was 10 minutes late to the shift on 10/5.", "loc-264")).toBe("Della was 10 minutes late to the shift on 10/5.");
  });

  it("keeps the comma that closes an earlier aside", () => {
    expect(withoutNamedSalon("Della, a makery associate at Dodge, was 10 minutes late to the shift on 10/5.", "loc-264")).toBe(
      "Della, a makery associate, was 10 minutes late to the shift on 10/5.",
    );
  });

  it("an aside that ends the sentence keeps the full stop", () => {
    expect(withoutNamedSalon("Della was 10 minutes late to the shift on 10/5, at Dodge. She did not call.", "loc-264")).toBe(
      "Della was 10 minutes late to the shift on 10/5. She did not call.",
    );
  });
});
