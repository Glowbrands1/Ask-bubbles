import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TURNS } from "@/app/api/chat/replay-pack/nov9-exit-lines-keep-method-cases";

import { isQuestion } from "./employment-change";

/**
 * EXIT_LINE_ANSWERS_ADD_UP_ENABLED. QA, the Bubbles round-7 live test (9 Nov 2026, conv_mw96du1226ye0it), the tester's
 * turns: "how employee resigned - told management" was read as a question once it was an earlier turn.
 */
const FLAG = "EXIT_LINE_ANSWERS_ADD_UP_ENABLED";
/** As the turn sits in the chat's history, with the app's state lines after it. */
const IN_HISTORY = `${TURNS[2]}\nPayroll deduction of $25 applies.`;

beforeEach(() => {
  vi.stubEnv("FIELD_LABEL_NOT_A_QUESTION_ENABLED", "true");
  vi.stubEnv(FLAG, "true");
});
afterEach(() => vi.unstubAllEnvs());

describe("a field answered by its label is no question", () => {
  it("off: \"how employee resigned - told management\" is a question (the bug)", () => {
    vi.stubEnv(FLAG, "");
    expect(isQuestion(TURNS[2])).toBe(true);
    expect(isQuestion(IN_HISTORY)).toBe(true);
  });

  it("on: the tester's label turns are statements, in history too", () => {
    expect(isQuestion(TURNS[2])).toBe(false);
    expect(isQuestion(IN_HISTORY)).toBe(false);
    expect(isQuestion(TURNS[3])).toBe(false);
  });

  it("on: real questions stay questions", () => {
    expect(isQuestion("how employee resigned?")).toBe(true);
    expect(isQuestion("how do I fill in how the employee resigned")).toBe(true);
    expect(isQuestion("what is the exit form for")).toBe(true);
  });
});
