import { describe, expect, it } from "vitest";

import { replyWithShortName, withShortName } from "./short-name";

/* Ported from the sibling app (its QA, 20 Nov 2026): "ca for <full name>, late 11/18" named the person in full on the card, the reply and Observed. Invented name (the loop cases' roster). */
describe("withShortName (an account)", () => {
  it("puts the short name in place of the full name, possessive and any case included", () => {
    expect(withShortName("Fenna Prewitt was late on 11/18.", "Fenna Prewitt", "Fenna")).toEqual({ text: "Fenna was late on 11/18.", replaced: 1 });
    expect(withShortName("fenna prewitt missed Fenna Prewitt's shift.", "Fenna Prewitt", "Fenna").text).toBe("Fenna missed Fenna's shift.");
  });
  it("leaves text in quotes, a single-word name and an equal short name alone", () => {
    expect(withShortName('The guest said "Fenna Prewitt was rude." Fenna Prewitt apologised.', "Fenna Prewitt", "Fenna").text).toBe('The guest said "Fenna Prewitt was rude." Fenna apologised.');
    expect(withShortName("Fenna was late.", "Fenna", "Fenna").replaced).toBe(0);
    expect(withShortName("Fenna Prewitt was late.", "Fenna Prewitt", "Fenna Prewitt").replaced).toBe(0);
  });
  it("never shortens a longer name that only starts the same", () => {
    expect(withShortName("Fenna Prewittson was late.", "Fenna Prewitt", "Fenna").replaced).toBe(0);
  });
});

describe("replyWithShortName (the reply)", () => {
  const reply = [
    "Here's the Corrective Action Form for **Fenna Prewitt**.",
    "",
    "**Fenna Prewitt** isn't on the staff list, so I've used the name as you typed it.",
    "",
    "**Observation of Offense:** Fenna Prewitt was late on 11/18. Is this for Fenna Prewitt at West Dodge?",
  ].join("\n");
  it("shortens the opener for this card's form and the account, and keeps the bold confirm line and the question", () => {
    const out = replyWithShortName(reply, "Fenna Prewitt", "Fenna", "Corrective Action Form");
    expect(out.text).toBe([
      "Here's the Corrective Action Form for **Fenna**.",
      "",
      "**Fenna Prewitt** isn't on the staff list, so I've used the name as you typed it.",
      "",
      "**Observation of Offense:** Fenna was late on 11/18. Is this for Fenna Prewitt at West Dodge?",
    ].join("\n"));
    expect(out.replaced).toBe(2);
  });
  it("keeps every other bold mention (Using **<full name>** from your staff list)", () => {
    expect(replyWithShortName("Using **Fenna Prewitt** from your staff list.", "Fenna Prewitt", "Fenna", "Corrective Action Form").replaced).toBe(0);
  });
});
