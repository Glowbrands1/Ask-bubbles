import { afterEach, describe, expect, it, vi } from "vitest";

import { QUICK_QUESTIONS } from "./quick-questions";
import { COACHING_STARTER, CONVERSATION_STARTER, INGREDIENT_STARTER, STARTER_TEXTS, starterExampleText, withStarterFollowUp } from "./starter-follow-up";
import type { AskRequest, AskResponse } from "./types";

/**
 * Port from Ask Sunny #1127 and #1150 (QA item 24 and its live re-test): a home starter's who / which follow-up carries
 * one example answer, keyed to this app's own starters. Invented names only.
 */
const answer = (content: string, extra: Partial<AskResponse> = {}) => ({ content, citations: [], coverage: "not_applicable", ...extra }) as unknown as AskResponse;
const ask = (question: string, history: AskRequest["history"] = []) => ({ question, history }) as unknown as AskRequest;
const first = { firstMessage: true, namesPerson: false, showedSomething: false };
const COACHING_EXAMPLE = 'For example: "coaching for <name> on being late to open the store".';

describe("starter follow-up example (item 24)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keys only to this app's own starter texts", () => {
    const texts = QUICK_QUESTIONS.map((question) => question.text);
    for (const starter of STARTER_TEXTS) expect(texts).toContain(starter);
  });

  it("off: the reply is as it was", () => {
    const reply = answer("Who is this **Coaching Form** for? Give me their name and I'll draft it from what you've told me.");
    expect(withStarterFollowUp(reply, ask(COACHING_STARTER))).toBe(reply);
  });

  it("on: this app's who-question, and the looser wordings of Sunny's live re-test, get the example", () => {
    vi.stubEnv("STARTER_FOLLOW_UP_EXAMPLE_ENABLED", "true");
    expect(starterExampleText("Who is this **Coaching Form** for? Give me their name and I'll draft it from what you've told me.", COACHING_STARTER, first))
      .toBe(`Who is this **Coaching Form** for? Give me their name and I'll draft it from what you've told me.\n\n${COACHING_EXAMPLE}`);
    expect(starterExampleText("I can set that up. Who is this Coaching Form for, and what's it about?", COACHING_STARTER, first)).toMatch(/\n\nFor example: "coaching for <name>/);
    expect(starterExampleText("Who is this form for? Tell me the employee's full name.", COACHING_STARTER, first)).toMatch(/full name\.\n\nFor example:/);
  });

  it("on: the team-member conversation chip, asked who in any words, gets its own example", () => {
    vi.stubEnv("STARTER_FOLLOW_UP_EXAMPLE_ENABLED", "true");
    expect(starterExampleText("Happy to help. A couple of things first:\n1. Who is the conversation with?\n2. What's it about?", CONVERSATION_STARTER, first))
      .toMatch(/\n\nFor example: "a conversation with <name> about being late to open the store"\.$/);
    expect(starterExampleText("Which team member is it, and what happened?", CONVERSATION_STARTER, first)).toMatch(/For example: "a conversation with <name>/);
  });

  it("on: the ingredient chip's \"which ingredient?\" gets an example only when nothing was shown", () => {
    vi.stubEnv("STARTER_FOLLOW_UP_EXAMPLE_ENABLED", "true");
    expect(starterExampleText("Which ingredient is the guest asking about?", INGREDIENT_STARTER, first)).toMatch(/a bar of soap"\.$/);
    const answered = "Here is what the guide says about our ingredients. Anything else?";
    expect(starterExampleText(answered, INGREDIENT_STARTER, { ...first, showedSomething: true })).toBe(answered);
  });

  it("on: never on a later message, a card that names the person, another starter, or the manager's own words", () => {
    vi.stubEnv("STARTER_FOLLOW_UP_EXAMPLE_ENABLED", "true");
    const who = "Who is this **Coaching Form** for?";
    expect(starterExampleText(who, COACHING_STARTER, { ...first, firstMessage: false })).toBe(who);
    expect(starterExampleText(who, COACHING_STARTER, { ...first, namesPerson: true })).toBe(who);
    expect(starterExampleText(who, "Create a coaching form for Marlo Pennick", first)).toBe(who);
    expect(starterExampleText("Which forms can I create? Here they are.", "Which forms can I create here?", first)).toBe("Which forms can I create? Here they are.");
    const later = withStarterFollowUp(answer(who), ask(COACHING_STARTER, [{ id: "m0", role: "user", content: "hi" } as never]));
    expect(later.content).toBe(who);
  });
});
