import { describe, expect, it } from "vitest";

import { bareStoreReply, continuesStore, storeAnswerTurns, storeCorrection, storeQuestionOpen, storeReplyText } from "./store-confirmation";

/**
 * QA F-12, 22 Oct 2026 — the store-reply readers, one turn at a time, over Ask
 * Bubbles' own roster. The conversation-level behaviour (intake kept, store set
 * only within the actor's scope, employee kept) is in
 * `src/app/api/forms/qa-f12-store-reply-e2e.test.ts`.
 */

const ASKED = [
  { role: "user", content: "create a coaching form for Jo Test, late 3 times this week" },
  { role: "assistant", content: "Here is what I would put on a **Coaching Form**.", formProposal: { status: "needs_location" } },
];
const READY = [
  { role: "user", content: "create a coaching form for Jo Test at kearney, late 3 times" },
  { role: "assistant", content: "Here is what I would put on a **Coaching Form**.", formProposal: { status: "ready" } },
];

describe("the store question", () => {
  it("is open after a card still waiting for its store, whatever wording asked", () => {
    expect(storeQuestionOpen(ASKED)).toBe(true);
    expect(storeQuestionOpen([{ role: "assistant", content: "More than one store matches what you said — **A** or **B**? Tell me which one and I won't guess.", formProposal: { status: "needs_location" } }])).toBe(true);
    expect(storeQuestionOpen([{ role: "assistant", content: "I won't choose which store this belongs to. Which store is this about?" }])).toBe(true);
    expect(storeQuestionOpen(READY)).toBe(false);
  });
});

describe("positive: a short reply that is a store", () => {
  it.each([
    ["66", "loc-66"],
    ["#66", "loc-66"],
    ["store 66", "loc-66"],
    ["66.", "loc-66"],
    ["264", "loc-264"],
    ["kearney", "loc-66"],
    ["it's kearney", "loc-66"],
    ["at kearney", "loc-66"],
    ["west dodge", "loc-264"],
  ])("%j", (reply, id) => {
    const resolution = bareStoreReply(reply);
    expect(resolution?.kind).toBe("resolved");
    expect(resolution && resolution.kind === "resolved" ? resolution.store.id : null).toBe(id);
  });
  it("a city with two stores is ambiguous, never one of them", () => {
    expect(bareStoreReply("sioux falls")?.kind).toBe("ambiguous");
  });
});

describe("negative: times, prices, dates, quantities, questions and people are not stores", () => {
  it.each(["6:06", "at 6:06", "66pm", "$66", "66 dollars", "for 66 minutes", "6/6", "264 soaps", "66?", "she got here at 66 today", "pat rivera", "late again today"])(
    "%j",
    (reply) => {
      expect(bareStoreReply(reply)).toBeNull();
    },
  );
  it("a bare number continues the intake only when the store question is open", () => {
    expect(continuesStore("66", READY)).toBe(false);
    expect(continuesStore("66", ASKED)).toBe(true);
  });
});

describe("corrections", () => {
  it.each([
    ["sorry, it's omaha", "loc-264"],
    ["no wait, it's the west dodge store", "loc-264"],
    ["actually, store 264", "loc-264"],
    ["actually it's #264", "loc-264"],
    ["sorry, it's grand island", "loc-236"],
  ])("%j", (turn, id) => {
    const correction = storeCorrection(turn);
    expect(correction?.resolution.kind).toBe("resolved");
    expect(correction && correction.resolution.kind === "resolved" ? correction.resolution.store.id : null).toBe(id);
    expect(continuesStore(turn, READY)).toBe(true);
  });
  it.each(["actually 264", "sorry, she was late again", "no", "actually it's for sam jones"])("%j is not a store correction", (turn) => {
    expect(storeCorrection(turn)).toBeNull();
  });
});

describe("the reply in the sentence reader's shape", () => {
  it.each([
    ["66", "store 66"],
    ["#66", "#66"],
    ["store 66", "store 66"],
    ["it's kearney", "at kearney store"],
    ["kearney.", "at kearney store"],
  ])("%j → %j", (reply, text) => {
    expect(storeReplyText(reply)).toBe(text);
  });
});

describe("multi-turn: an answer still counts on later turns", () => {
  it("records the turns that answered a store question", () => {
    const history = [...ASKED, { role: "user", content: "66" }, { role: "assistant", content: "ok", formProposal: { status: "ready" } }, { role: "user", content: "she was late again today" }];
    expect([...storeAnswerTurns(history)]).toEqual(["66"]);
  });
  it("a reply to a card that already had its store is not an answer", () => {
    expect([...storeAnswerTurns([...READY, { role: "user", content: "264" }])]).toEqual([]);
  });
});
