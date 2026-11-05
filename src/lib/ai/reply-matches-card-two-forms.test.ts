import { describe, expect, it } from "vitest";

import type { ChatFormProposal } from "@/types";

import { replyMatchesCard } from "./reply-matches-card";
import type { AskResponse } from "./types";

/**
 * REPLY_MATCHES_CARD_ENABLED with TWO cards (QA's tester, 5 Nov 2026, item 6 "two forms", live in this app): the
 * cards were right — a Coaching Form for person R, a Corrective Action Form for person R2 — but the reply's
 * Corrective Action section said "I can create a Corrective Action Form for [R]." under the heading and card that
 * are R2. The step read only the first card. Invented people (on the cases' fixture roster).
 */
const ROSTER = ["Marnie Holloway", "Remy Calder"];

function card(proposalId: string, templateKey: string, templateName: string, employeeName: string | null): ChatFormProposal {
  return {
    proposalId,
    templateKey,
    templateName,
    supportsInlineDraft: true,
    variantKey: null,
    employeeName,
    employeeRole: null,
    formDate: null,
    locationId: "loc-264",
    locationName: null,
    locationResolution: "resolved",
    authorizedLocationIds: ["loc-264"],
    status: employeeName ? "ready" : "needs_employee",
    sourceMessageIds: [],
  };
}

const COACHING = card("p1", "coaching", "Coaching Form", "Marnie Holloway");
const CA = card("p2", "dpoa", "Corrective Action Form", "Remy Calder");
const two = (content: string): AskResponse => ({ content, citations: [], formProposal: COACHING, formProposals: [COACHING, CA] });

const TEXT = [
  "I can create a **Coaching Form** for **Marnie Holloway**.",
  "",
  "**Policy:** Customer Service. I'll cite that section of the current policy manual on the draft.",
  "",
  "I can create a **Corrective Action Form** for **Remy Calder**.",
  "",
  "**Policy:** Late Opening, as you said. I'll quote that section from the current policy manual on the draft.",
].join("\n");

describe("REPLY_MATCHES_CARD with two cards: each section matches its own card", () => {
  it("the Corrective Action section keeps its own person (QA's item 6), and the Coaching section keeps hers", () => {
    const out = replyMatchesCard(two(TEXT), ROSTER, "coaching form for Marnie Holloway and a CA for Remy Calder for opening late").content;
    expect(out).toContain("I can create a **Corrective Action Form** for **Remy Calder**.");
    expect(out).toContain("I can create a **Coaching Form** for **Marnie Holloway**.");
    expect(out).not.toContain("**Corrective Action Form** for **Marnie Holloway**");
  });

  it("each card's own policy line stays (no one-policy rule across two forms)", () => {
    const out = replyMatchesCard(two(TEXT), ROSTER, "coaching form for Marnie Holloway and a CA for Remy Calder for opening late").content;
    expect(out).toContain("**Policy:** Customer Service.");
    expect(out).toContain("**Policy:** Late Opening, as you said.");
  });

  it("a section that names the wrong person for its card is corrected to that card's person", () => {
    const wrong = TEXT.replace("**Corrective Action Form** for **Remy Calder**", "**Corrective Action Form** for **Marnie Holloway**");
    const out = replyMatchesCard(two(wrong), ROSTER, "coaching form for Marnie Holloway and a CA for Remy Calder").content;
    expect(out).toContain("I can create a **Corrective Action Form** for **Remy Calder**.");
    expect(out).toContain("I can create a **Coaching Form** for **Marnie Holloway**.");
  });

  it("negative: one card is as before (rule 2 sets the card's person)", () => {
    const one: AskResponse = { content: "I can create a **Corrective Action Form** for **Marnie Holloway**.", citations: [], formProposal: CA };
    expect(replyMatchesCard(one, ROSTER).content).toBe("I can create a **Corrective Action Form** for **Remy Calder**.");
  });
});
