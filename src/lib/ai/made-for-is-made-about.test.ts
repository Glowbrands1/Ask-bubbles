import { afterEach, describe, expect, it } from "vitest";

import { asMadeAboutWording, madeAbout } from "./make-it-about";

const SAID = "can you make it for missing out monthly meeting";

describe("MADE_FOR_IS_MADE_ABOUT (ported from the sibling app: QA's live round 20 there, 10 Nov 2026)", () => {
  afterEach(() => {
    delete process.env.MADE_FOR_IS_MADE_ABOUT_ENABLED;
    delete process.env.POLITE_ABOUT_STAYS_CARD_ENABLED;
  });
  it("off, as before: the revision is given the sentence as said", () => {
    process.env.POLITE_ABOUT_STAYS_CARD_ENABLED = "true";
    expect(madeAbout(SAID)).toBe("missing out monthly meeting");
    expect(asMadeAboutWording(SAID)).toBe(SAID);
  });
  it("on: QA's exact sentence is given to the revision as \"make it about …\"", () => {
    process.env.POLITE_ABOUT_STAYS_CARD_ENABLED = "true";
    process.env.MADE_FOR_IS_MADE_ABOUT_ENABLED = "true";
    expect(asMadeAboutWording(SAID)).toBe("can you make it about missing out monthly meeting");
    expect(madeAbout(SAID, { aboutOnly: true })).toBeNull();
  });
  it("on, without POLITE_ABOUT_STAYS_CARD (\"for\" not read as a made-about): unchanged", () => {
    process.env.MADE_FOR_IS_MADE_ABOUT_ENABLED = "true";
    expect(madeAbout(SAID)).toBeNull();
    expect(asMadeAboutWording(SAID)).toBe(SAID);
  });
  it("on: a name, a date or \"make it about …\" is unchanged", () => {
    process.env.POLITE_ABOUT_STAYS_CARD_ENABLED = "true";
    process.env.MADE_FOR_IS_MADE_ABOUT_ENABLED = "true";
    for (const text of ["make it for Perrin", "make it for 10/14/26", "make it about showing up late"]) {
      expect(asMadeAboutWording(text), text).toBe(text);
    }
  });
});
