import { afterEach, describe, expect, it, vi } from "vitest";

import { addedDetail, withAddedDetailKept } from "./added-detail-kept";

// Pau via QA, sf-b6 (5 Nov 2026), in the manager's words; the person invented.
const T3 =
  "can you have it include that we recieved a customer complaint from Sunday 11-1, she started closing the last register at 4:56pm and we cant close until the store is closed at 5pm, we had a customer come in at 4:59 and was told them that we were closed";
const turns = [
  { id: "m2", role: "user", content: "I need a corrective action form for Wynne Sarrow for counting the drawer early and turning away a customer" },
  { id: "a2", role: "assistant", content: "I'll draft a Corrective Action Form for Wynne Sarrow." },
  { id: "m3", role: "user", content: T3 },
  { id: "a3", role: "assistant", content: "I can add that detail as the factual account on the form." },
  { id: "m4", role: "user", content: "Create a Corrective Action Form from this conversation." },
];
const CARD = {
  content: "I'll draft a **Corrective Action Form** for **Wynne Sarrow** from what you've described.\n\n**Issue:** counting the drawer early and turning away a customer\n\nCreate the draft here when you're ready, and edit it below.",
  formProposal: { employeeName: "Wynne Sarrow", sourceMessageIds: ["m2", "m4"] },
};

describe("ADDED_DETAIL_KEPT_ENABLED", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reads what the manager asked to add, without the ask", () => {
    expect(addedDetail(T3)).toMatch(/^we recieved a customer complaint from Sunday 11-1/);
    expect(addedDetail("can you tell me the policy on closing early?")).toBeNull();
  });

  it("off: the card is left as it is", () => {
    expect(withAddedDetailKept(CARD, turns)).toEqual(CARD);
  });

  it("on: the turn joins the card's turns, in order, and shows before the closing line", () => {
    vi.stubEnv("ADDED_DETAIL_KEPT_ENABLED", "true");
    const out = withAddedDetailKept(CARD, turns);
    expect(out.formProposal.sourceMessageIds).toEqual(["m2", "m3", "m4"]);
    const blocks = out.content.split("\n\n");
    expect(blocks[blocks.length - 2]).toMatch(/^\*\*Also on the draft:\*\* we recieved a customer complaint/);
    expect(blocks[blocks.length - 1]).toMatch(/^Create the draft here/);
  });

  it("on: a turn about somebody else is left out", () => {
    vi.stubEnv("ADDED_DETAIL_KEPT_ENABLED", "true");
    const other = turns.map((turn) => (turn.id === "m3" ? { ...turn, content: "can you have it include that Marnie Holloway also closed the register early at 4:50pm" } : turn));
    expect(withAddedDetailKept(CARD, other)).toEqual(CARD);
  });
});
