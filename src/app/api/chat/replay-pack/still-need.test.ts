import { describe, expect, it } from "vitest";

import { stillNeedWithoutQuestion } from "./still-need";

describe("the pack's \"I still need\" invariant", () => {
  it("still fails the original reply that asks nothing (eval b10, QA 3 Nov 2026)", () => {
    expect(stillNeedWithoutQuestion("I still need the same answer before I can make this card.")).toBe(true);
  });
  it("accepts who / which location / which date, as before", () => {
    expect(stillNeedWithoutQuestion("I still need to know who this is for before I can make this card. Who is this form for?")).toBe(false);
  });
  it("accepts another question in the same reply (the live loop's own wording, 22 Nov 2026)", () => {
    expect(stillNeedWithoutQuestion("The name on the card is already **Liesl Moreno Vargas**.\n\nI still need to know what happened with the customer complaint to finish the account on the form. What did the customer complain about?")).toBe(false);
    expect(stillNeedWithoutQuestion("I still need you to confirm the name before I can build the card. Did you mean **Liesl Moreno Vargas**?")).toBe(false);
  });
  it("accepts U25 T3's reply, a question after a dash in the same sentence (QA's Bubbles round 2; the person invented)", () => {
    /*
     * The tester's harness at fda046a stored this reply as empty: the pack's old check (`stillAsks`, who / which location
     * / which date only) threw on it. #1062 made the check read any question; this pins the reply that was rejected.
     */
    expect(stillNeedWithoutQuestion("I still need to know what happened for Annika's coaching form — could you tell me what it's about?")).toBe(false);
  });
  it("says nothing about a reply without \"I still need\"", () => {
    expect(stillNeedWithoutQuestion("Here's the card.")).toBe(false);
  });
});
