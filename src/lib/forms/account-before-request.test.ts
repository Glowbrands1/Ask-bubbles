import { afterEach, describe, expect, it, vi } from "vitest";

import { withAccountBeforeRequest } from "./account-before-request";

// Pau's P14(a) (QA, 10 Nov 2026), in the manager's shape; the person invented.
const turns = [
  { id: "m1", role: "user", content: "can you help me with rowan? she marked an order as shipped but the customer hadn't picked up yet" },
  { id: "a1", role: "assistant", content: "That sounds like a coaching moment." },
  { id: "m2", role: "user", content: "she also didn't tell anyone on the next shift about the order" },
  { id: "m3", role: "user", content: "create a coaching form for rowan" },
  { id: "a3", role: "assistant", content: "Is this for **Rowan Kestrel**?" },
  { id: "m4", role: "user", content: "yes" },
];
const CARD = { content: "card", formProposal: { templateKey: "coaching", employeeName: "Rowan Kestrel", sourceMessageIds: ["m2", "m3", "m4"] } };

describe("ACCOUNT_BEFORE_REQUEST_ENABLED", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("off: the card's turns are as built", () => {
    // Off pins its own flag (QA's off-pins guard, 11 Nov 2026): it must hold once production turns the flag on.
    vi.stubEnv("ACCOUNT_BEFORE_REQUEST_ENABLED", "");
    expect(withAccountBeforeRequest(CARD, turns)).toEqual(CARD);
  });

  it("on: the account turn that opens with a question joins the card's turns", () => {
    vi.stubEnv("ACCOUNT_BEFORE_REQUEST_ENABLED", "true");
    expect(withAccountBeforeRequest(CARD, turns).formProposal.sourceMessageIds).toEqual(["m1", "m2", "m3", "m4"]);
  });

  it("on: a turn about somebody else, or a plain question, stops the walk", () => {
    vi.stubEnv("ACCOUNT_BEFORE_REQUEST_ENABLED", "true");
    const other = turns.map((turn) => (turn.id === "m1" ? { ...turn, content: "Marnie Holloway marked an order as shipped too early yesterday" } : turn));
    expect(withAccountBeforeRequest(CARD, other)).toEqual(CARD);
    const question = turns.map((turn) => (turn.id === "m1" ? { ...turn, content: "what is the policy on shipping orders?" } : turn));
    expect(withAccountBeforeRequest(CARD, question)).toEqual(CARD);
  });

  // Gate-Bubbles' NO-GO (R714, 11 Nov 2026), its exact turns; Remy Calder is a fixture name.
  it("on: the first card's request is never the second card's account", () => {
    vi.stubEnv("ACCOUNT_BEFORE_REQUEST_ENABLED", "true");
    const two = [
      { id: "r1", role: "user", content: "create a corrective action for Remy Calder, he was late opening the store on 11/2" },
      { id: "a1", role: "assistant", content: "I'll draft a **Corrective Action Form** for **Remy Calder** …" },
      { id: "r2", role: "user", content: "now make a separate CA for Remy Calder for his cash drawer being short $20 on 11/3" },
    ];
    const second = { content: "card", formProposal: { templateKey: "dpoa", employeeName: "Remy Calder", sourceMessageIds: ["r2"] } };
    expect(withAccountBeforeRequest(second, two)).toEqual(second);
  });

  it("on: a turn an earlier card already cited stops the walk", () => {
    vi.stubEnv("ACCOUNT_BEFORE_REQUEST_ENABLED", "true");
    const cited = turns.map((turn) => (turn.id === "a1" ? { ...turn, formProposal: { sourceMessageIds: ["m1"] } } : turn));
    expect(withAccountBeforeRequest(CARD, cited).formProposal.sourceMessageIds).toEqual(["m2", "m3", "m4"]);
  });
});
