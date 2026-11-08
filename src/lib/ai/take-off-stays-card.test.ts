import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { cardTurnQuestion, takeOffStaysCard } from "./take-off-stays-card";

/** TAKE_OFF_STAYS_CARD_ENABLED (QA, 8 Nov 2026, relayed by coding 5). */
afterEach(() => {
  vi.unstubAllEnvs();
});

const ON_CARD = { continueProposalTemplateKey: "coaching" };

describe("takeOffStaysCard", () => {
  it("off: false", () => {
    expect(takeOffStaysCard({ ...ON_CARD, question: "take the attendance policy off the form" })).toBe(false);
  });

  describe("on", () => {
    it.each(["take the attendance policy off the form", "take the policy off", "Take the policy off."])("%s → a card turn", (question) => {
      vi.stubEnv("TAKE_OFF_STAYS_CARD_ENABLED", "true");
      expect(takeOffStaysCard({ ...ON_CARD, question })).toBe(true);
    });

    it.each([
      ["a question", "can you take the policy off?"],
      ["a policy question", "what policy does being late fall under?"],
      ["a take-off beside an account", "take the policy off. she was also late on 11/2"],
      ["no policy at all", "take that off"],
    ])("%s: false", (_why, question) => {
      vi.stubEnv("TAKE_OFF_STAYS_CARD_ENABLED", "true");
      expect(takeOffStaysCard({ ...ON_CARD, question })).toBe(false);
    });

    it("no card open: false", () => {
      vi.stubEnv("TAKE_OFF_STAYS_CARD_ENABLED", "true");
      expect(takeOffStaysCard({ question: "take the policy off" })).toBe(false);
    });
  });
});

describe("cardTurnQuestion", () => {
  it("the manager's last turn before this one", () => {
    const history = [
      { role: "user", content: "create a coaching form for marnie holloway" },
      { role: "assistant", content: "Here is what I would put on a **Coaching Form**." },
    ];
    expect(cardTurnQuestion({ question: "take the policy off", history: history as never })).toBe("create a coaching form for marnie holloway");
  });

  it("no earlier turn: this one", () => {
    expect(cardTurnQuestion({ question: "take the policy off", history: [] })).toBe("take the policy off");
  });
});
