import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { CARD_LINE_LABELS, cardLines, historyReply, withoutAppNotes, withoutCardLines } from "./card-lines";

/* QA's Bubbles live re-run 2 (22 Nov 2026, "saved ≠ card"). */
describe("card lines", () => {
  const faked =
    "Here's the updated Corrective Action Form for **Briony**.\n\n**Observation of Offense:** Briony did not put trash liners in.\n\n**Is payroll deduct applicable?** No, as you said.\n\nWarning level isn't set; tell me if it applies.\n\n[app note: this reply showed a card built with propose_form]";

  it("finds the card's own labelled lines, anywhere in the line, and not a bold word in a sentence", () => {
    expect(cardLines(faked).map((line) => line.label)).toEqual(["Observation of Offense", "Is payroll deduct applicable?"]);
    expect(cardLines("Noted the reason — **Reason for Resignation:** Second job.").map((line) => line.label)).toEqual(["Reason for Resignation"]);
    expect(cardLines("The card already cites the **Policy** that fits: **Standards of Conduct Policy, JBA Policy Manual p.12**.")).toEqual([]);
  });

  it("leaves out the card lines and never shows an app note", () => {
    expect(withoutAppNotes(withoutCardLines(faked))).toBe("Here's the updated Corrective Action Form for **Briony**.\n\nWarning level isn't set; tell me if it applies.");
  });

  it("shows an earlier card reply to the model as one stand-in line, with no note to copy", () => {
    const shown = historyReply(faked, "Corrective Action Form");
    expect(shown).not.toMatch(/app note|Observation of Offense|as you said/);
    expect(shown).toMatch(/\[card shown under this reply: Corrective Action Form, made by propose_form/);
  });

  it("every card label is one the rules book tells the model to write, or the exit form's own", () => {
    const book = readFileSync(new URL("./rules-book.ts", import.meta.url), "utf8");
    for (const label of CARD_LINE_LABELS.slice(0, 8)) expect(book, label).toContain(`**${label}`);
  });
});
