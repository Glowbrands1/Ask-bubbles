import { afterEach, describe, expect, it } from "vitest";

import { addedDetailTurns } from "./added-detail";
import { FORM_OPPORTUNITY_LEAD_AT_END, formOpportunityLead } from "./form-opportunity";

/**
 * Pau via QA, 5 Nov 2026 (sf-b6), the manager's turns verbatim (person
 * invented). The reply ended "Based on what you've described, I can
 * prepare:" with nothing after it, and the next card ignored the detail added
 * on turn 3.
 */
const T2 = "I need a corrective action form for Wynne Sarrow for counting the drawer early and turning away a customer";
const T3 =
  "can you have it include that we recieved a customer complaint from Sunday 11-1, she started closing the last register at 4:56pm and we cant close until the store is closed at 5pm, we had a customer come in at 4:59 and was told them that we were closed";
const T4 = "Create a Corrective Action Form from this conversation.";
const ISSUE = "counting the drawer early and turning away a customer";

afterEach(() => {
  delete process.env.FORM_LEAD_FULL_SENTENCE_ENABLED;
});

describe("FORM_LEAD_FULL_SENTENCE_ENABLED: the line before the form cards", () => {
  it("off, it ends with a colon (the reported reply)", () => {
    expect(formOpportunityLead(["Corrective Action Form", "Coaching Form"])).toMatch(/:\s*$/);
  });

  it("on, it is a whole sentence naming the forms", () => {
    process.env.FORM_LEAD_FULL_SENTENCE_ENABLED = "true";
    const two = formOpportunityLead(["Corrective Action Form", "Coaching Form"]);
    expect(two).toBe("Based on what you've described, I can prepare the **Corrective Action Form** or the **Coaching Form** — pick one below.");
    expect(formOpportunityLead(["Coaching Form"])).toBe("Based on what you've described, I can prepare the **Coaching Form**.");
    expect(formOpportunityLead([])).toMatch(/:\s*$/);
  });

  it("either form is found at the end of a reply, so an open draft drops it", () => {
    process.env.FORM_LEAD_FULL_SENTENCE_ENABLED = "true";
    for (const lead of [formOpportunityLead(["Coaching Form"]), "Based on what you've described, I can prepare:"]) {
      expect(`Some answer.\n\n${lead}`.replace(FORM_OPPORTUNITY_LEAD_AT_END, "")).toBe("Some answer.");
    }
  });
});

describe("CA_CARD_ADDED_DETAIL_ENABLED: what the manager added after the request", () => {
  it("turn 3 is the added detail; the form request is not", () => {
    expect(addedDetailTurns([T2, T3, T4], ISSUE)).toEqual([T3]);
  });

  it("nothing before the request, and nothing without an Issue", () => {
    expect(addedDetailTurns([T3, T2, T4], ISSUE)).toEqual([]);
    expect(addedDetailTurns([T2, T3, T4], null)).toEqual([]);
  });
});
