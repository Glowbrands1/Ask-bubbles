import { describe, expect, it } from "vitest";

import { buildGroundingBlock } from "./prompts";
import { isSlotOnlyTurn, slotOnlyRetrievalTopic } from "./slot-only-turn";
import { RETRIEVED_NOT_SHARED_RULE, managerPastedSomething, withoutSharedSourceClaims } from "./sources-not-shared";

/**
 * The pieces behind conv_mvnljjl32xlit48 ("the sources you just shared"), unit
 * by unit. The live path is in `sources-not-shared-runtime.test.ts`.
 */

const COACHING = [
  { role: "user", content: "I need to coach an employee" },
  { role: "assistant", content: "Happy to help structure that." },
  { role: "user", content: "Her name is Test Employee" },
  { role: "assistant", content: "Got it, Test Employee it is." },
];

describe("a turn that only supplies a detail", () => {
  it.each([
    "She works at Grand Island",
    "It happened on 10-21",
    "Her name is Test Employee",
    "He works out of the Kearney store",
    "At Grand Island",
    "The store is Grand Island",
    "It was yesterday",
    "It happened on Tuesday at 3pm",
    "10/21",
    "On October 21",
    "The date was 10-21-2026",
  ])("%s is slot-only", (turn) => {
    expect(isSlotOnlyTurn(turn)).toBe(true);
  });

  it.each([
    "She was on her cell phone for 30+ minutes at the front desk",
    "It happened on 10-21 when she yelled at a guest",
    "She works at Grand Island and keeps skipping the opening checklist",
    "At least twice this week",
    "I need to coach an employee",
    "What is the cell phone policy?",
    "Create a Coaching Form",
  ])("%s carries its own topic", (turn) => {
    expect(isSlotOnlyTurn(turn)).toBe(false);
  });

  it("T3 and T4 are searched with the coaching ask, skipping the name turn between", () => {
    expect(slotOnlyRetrievalTopic("She works at Grand Island", COACHING)).toBe("I need to coach an employee");
    expect(
      slotOnlyRetrievalTopic("It happened on 10-21", [
        ...COACHING,
        { role: "user", content: "She works at Grand Island" },
        { role: "assistant", content: "Noted." },
      ]),
    ).toBe("I need to coach an employee");
  });

  it("is searched as typed with no earlier topic, or when it is not slot-only", () => {
    expect(slotOnlyRetrievalTopic("She works at Grand Island", [])).toBeNull();
    expect(slotOnlyRetrievalTopic("What is the cell phone policy?", COACHING)).toBeNull();
  });

  it("never anchors on an assistant turn", () => {
    expect(
      slotOnlyRetrievalTopic("She works at Grand Island", [
        { role: "assistant", content: "Who is the coaching for?" },
        { role: "user", content: "Her name is Test Employee" },
      ]),
    ).toBeNull();
  });
});

describe("the prompt", () => {
  it("frames the grounding block as the app's retrieval and carries the rule", () => {
    const block = buildGroundingBlock([
      { marker: 1, documentTitle: "Soap Training Recipe Book", locator: "Page 12", content: "Island Nectar." } as never,
    ]);
    expect(block).toMatch(/retrieved by this app from the company knowledge base/);
    expect(block).toMatch(/never call them "the sources you shared"/);
    expect(RETRIEVED_NOT_SHARED_RULE).toMatch(/never something the manager shared, sent, pasted or provided/);
  });
});

describe("the backstop", () => {
  const T3_SENTENCE =
    "That said, the sources you just shared are all soap and auxiliary recipe directions (Island Nectar, Sunkissed Getaway, surface cleaner, etc.) — none of them touch coaching, performance, or conduct topics, so I can't build a coaching plan from them.";

  it("rewrites the recorded T3 sentence and keeps the rest", () => {
    const { content, changed } = withoutSharedSourceClaims(T3_SENTENCE, {
      question: "She works at Grand Island",
      history: COACHING,
    });
    expect(changed).toBe(true);
    expect(content).not.toMatch(/you just shared/);
    expect(content).toBe(
      "That said, the sources I found are all soap and auxiliary recipe directions (Island Nectar, Sunkissed Getaway, surface cleaner, etc.) — none of them touch coaching, performance, or conduct topics, so I can't build a coaching plan from them.",
    );
  });

  it.each([
    ["The documents you sent me cover parties.", "The documents I found cover parties."],
    ["These excerpts that you provided are about recipes.", "These excerpts I found are about recipes."],
    ["Your sources do not cover this.", "The sources I found do not cover this."],
  ])("%s", (reply, expected) => {
    expect(withoutSharedSourceClaims(reply, { question: "It happened on 10-21", history: COACHING }).content).toBe(expected);
  });

  it("leaves what the manager told you alone", () => {
    const reply = "Thanks for the details you shared. I'll just use what you've told me.";
    expect(withoutSharedSourceClaims(reply, { question: "She works at Grand Island", history: COACHING }).changed).toBe(false);
  });

  it("leaves the reply alone when the manager pasted text", () => {
    const pasted = "Here is the email she sent:\n\nI can't make it.\nSorry.\nSee you Monday.";
    expect(managerPastedSomething({ question: pasted, history: [] })).toBe(true);
    const reply = "The email you shared is a call-out.";
    expect(withoutSharedSourceClaims("The documents you sent are clear.", { question: pasted, history: [] }).changed).toBe(false);
    expect(withoutSharedSourceClaims(reply, { question: pasted, history: [] }).content).toBe(reply);
  });
});
