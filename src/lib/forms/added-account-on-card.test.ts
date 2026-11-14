import { afterEach, describe, expect, it } from "vitest";

import { addedAccount, withAddedAccountOnCard } from "./added-account-on-card";

/** ADDED_ACCOUNT_ON_CARD_ENABLED: QA's Bubbles 17q live test, item 7 (12 Nov 2026), the manager's words; the person invented. */
const CARD = { employeeName: "Marnie Holloway", sourceMessageIds: ["m1", "m2"], issue: "she was late on 11/3/26" };
const CONTENT = "I'll draft a **Corrective Action Form** for **Marnie Holloway**.\n\n**Issue:** she was late on 11/3/26 · **Store:** West Dodge";
const TURNS = [
  { id: "m1", role: "user", content: "create a CA for Marnie Holloway, she was late on 11/3/26" },
  { id: "a1", role: "assistant", content: "…" },
  { id: "m2", role: "user", content: "she also left the register unlocked" },
];

afterEach(() => {
  delete process.env.ADDED_ACCOUNT_ON_CARD_ENABLED;
});

describe("ADDED_ACCOUNT_ON_CARD_ENABLED", () => {
  it("off: the card is as the forms path wrote it", () => {
    const answer = { content: CONTENT, formProposal: CARD };
    expect(withAddedAccountOnCard(answer, TURNS)).toBe(answer);
  });

  it("on: \"she also left the register unlocked\" joins the card's What happened and its Issue line", () => {
    process.env.ADDED_ACCOUNT_ON_CARD_ENABLED = "true";
    const next = withAddedAccountOnCard({ content: CONTENT, formProposal: CARD }, TURNS);
    expect(next.formProposal?.issue).toBe("she was late on 11/3/26. She also left the register unlocked");
    expect(next.content).toContain("**Issue:** she was late on 11/3/26. She also left the register unlocked · **Store:**");
  });

  it("reads only an addition to the account", () => {
    expect(addedAccount("she also left the register unlocked")).toBe("she also left the register unlocked");
    expect(addedAccount("Also, she was on her phone.")).toBe("Also, she was on her phone");
    expect(addedAccount("verbal warning")).toBeNull();
    expect(addedAccount("no")).toBeNull();
    expect(addedAccount("can she also sign it?")).toBeNull();
    expect(addedAccount("she was late again")).toBeNull();
  });

  it("on: a turn the card does not cite, the card's first turn, or words already there change nothing", () => {
    process.env.ADDED_ACCOUNT_ON_CARD_ENABLED = "true";
    const uncited = { content: CONTENT, formProposal: { ...CARD, sourceMessageIds: ["m1"] } };
    expect(withAddedAccountOnCard(uncited, TURNS)).toBe(uncited);
    const there = { content: CONTENT, formProposal: { ...CARD, issue: "she was late on 11/3/26. She also left the register unlocked" } };
    expect(withAddedAccountOnCard(there, TURNS)).toBe(there);
  });

  it("on: another person named in the addition is left off this card", () => {
    process.env.ADDED_ACCOUNT_ON_CARD_ENABLED = "true";
    const turns = [TURNS[0]!, { id: "m2", role: "user", content: "Rowan Kestrel also left the register unlocked" }];
    const answer = { content: CONTENT, formProposal: CARD };
    expect(withAddedAccountOnCard(answer, turns)).toBe(answer);
  });
});
