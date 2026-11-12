import { afterEach, describe, expect, it, vi } from "vitest";

import { withAnswerTurnLevel } from "./answer-turn-level";

/* ANSWER_TURN_LEVEL_ENABLED (QA's ruling (a), 12 Nov 2026). The manager's answer; invented people. */
const NEAR_MISS = "Is this for **Corvina Vellacott**? Tell me if that should change.";
const history = (assistant: string) => [
  { role: "user", content: "i have an employee, Corvina Ashdown Vellacot that needs a corrective action form with a customer complaint" },
  { role: "assistant", content: assistant },
];

afterEach(() => vi.unstubAllEnvs());

describe("ANSWER_TURN_LEVEL_ENABLED", () => {
  it("off: as typed", () => {
    expect(withAnswerTurnLevel({ question: "no call no show on 11/3, verbal warning", history: history(NEAR_MISS) })).toBeNull();
  });

  it.each([
    ["no call no show on 11/3, verbal warning", "no call no show on 11/3\nverbal warning"],
    ["No call no show on 11/3, Verbal Warning.", "No call no show on 11/3\nVerbal Warning"],
    ["late on 11/3 - written", "late on 11/3\nwritten"],
    ["she was late on 11/3; a written warning", "she was late on 11/3\na written warning"],
  ])("on, answering \"Is this for …?\": %s", (said, read) => {
    vi.stubEnv("ANSWER_TURN_LEVEL_ENABLED", "true");
    expect(withAnswerTurnLevel({ question: said, history: history(NEAR_MISS) })?.question).toBe(read);
  });

  it("on: also after \"Who is this … for?\" and the open level question", () => {
    vi.stubEnv("ANSWER_TURN_LEVEL_ENABLED", "true");
    for (const asked of ["Who is this **Corrective Action Form** for?", "… Is this new corrective action a **Verbal Warning** or a **Written Warning**? Tell me here …"]) {
      expect(withAnswerTurnLevel({ question: "Corvina Vellacott, late on 11/3, verbal warning", history: history(asked) })?.question).toBe("Corvina Vellacott, late on 11/3\nverbal warning");
    }
  });

  it.each([
    "no call no show on 11/3, she already had a verbal warning",
    "no call no show on 11/3, previous verbal warning",
    "late again, last time a verbal warning",
    "no call no show on 11/3",
    "verbal warning",
  ])("on, untouched: %s", (said) => {
    vi.stubEnv("ANSWER_TURN_LEVEL_ENABLED", "true");
    expect(withAnswerTurnLevel({ question: said, history: history(NEAR_MISS) })).toBeNull();
  });

  it("on: never outside an answer to the app's own question (the 22 Oct rule)", () => {
    vi.stubEnv("ANSWER_TURN_LEVEL_ENABLED", "true");
    expect(withAnswerTurnLevel({ question: "she was late last night, verbal warning", history: history("Here's what I'll fill in …") })).toBeNull();
    expect(withAnswerTurnLevel({ question: "she was late last night, verbal warning", history: [] })).toBeNull();
  });
});
