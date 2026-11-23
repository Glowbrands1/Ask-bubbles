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

/* QA's live round 3 (22 Nov 2026, U35): "Liesl Vargas received a customer complaint" for "Liesl Moreno Vargas" (names invented below). */
describe("a two-word surname is never cut to one word", () => {
  const short = (text: string) => withShortName(text, "Anouk Pellinor Duarte", "Anouk").text;
  it("first name + part of the surname, either word, is the person", () => {
    expect(short("Anouk Duarte received a customer complaint.")).toBe("Anouk received a customer complaint.");
    expect(short("Anouk Pellinor was late; Anouk Pellinor Duarte's shift ran over.")).toBe("Anouk was late; Anouk's shift ran over.");
  });
  it("leaves the first name alone, quoted words, and a one-word surname as before", () => {
    expect(short("a complaint about Anouk")).toBe("a complaint about Anouk");
    expect(short('she said "Anouk Duarte was rude"')).toBe('she said "Anouk Duarte was rude"');
    expect(withShortName("Tovald Brisbee was late", "Tovald Brisbee", "Tovald").text).toBe("Tovald was late");
  });
  it("the reply's Observation line too", () => {
    expect(replyWithShortName("**Observation of Offense:** Anouk Duarte received a customer complaint.", "Anouk Pellinor Duarte", "Anouk", "Corrective Action Form").text).toBe("**Observation of Offense:** Anouk received a customer complaint.");
  });
});

describe("withOwnOtherFirstNames (U19, QA's live re-run 23 Nov 2026)", () => {
  it("the legal first name in the account becomes the card's short name, so one person is named", async () => {
    const { withOwnOtherFirstNames } = await import("./short-name");
    const out = withOwnOtherFirstNames("On 11/14 Ilsabet worked 50 minutes over the scheduled shift and did not clean up after themself.", ["Ilsabet"], "Corvelle", "Sabeth");
    expect(out.text).toBe("On 11/14 Sabeth worked 50 minutes over the scheduled shift and did not clean up after themself.");
  });

  it("the full other name with the surname, and text in quotes left as written", async () => {
    const { withOwnOtherFirstNames } = await import("./short-name");
    expect(withOwnOtherFirstNames("Ilsabet Corvelle said \"ask Ilsabet\" and left.", ["Ilsabet"], "Corvelle", "Sabeth").text).toBe("Sabeth said \"ask Ilsabet\" and left.");
  });

  it("a longer name that starts with the other first name is someone else", async () => {
    const { withOwnOtherFirstNames } = await import("./short-name");
    expect(withOwnOtherFirstNames("Ilsabetta covered the shift.", ["Ilsabet"], "Corvelle", "Sabeth").text).toBe("Ilsabetta covered the shift.");
  });
});
