import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AskRequest } from "./types";
import { withFirstNameAnswer } from "./first-name-suggest";

/**
 * FIRST_NAME_YES_KEEPS_REQUEST_ENABLED (replay set b2, 3 Nov 2026; the name is
 * invented): "Yes" to "Is this for <name>?" keeps the form request made in a
 * later turn than the one that gave the first name.
 */
const FLAGS = ["FIRST_NAME_SUGGEST_ENABLED", "FIRST_NAME_YES_KEEPS_REQUEST_ENABLED"] as const;
const ACCOUNT =
  "I have an employee Odessa at our Grand Island location who has been out of dress code three shifts. I verbally coached her on the second offense and she still is out of dress code";
const REQUEST = "Create a Coaching Form from this conversation.";

function request(history: [string, string][], question: string): AskRequest {
  return {
    question,
    mode: "standard",
    history: history.map(([role, content], index) => ({ id: `m${index}`, role, content, createdAt: "2026-11-03T00:00:00Z" })),
  } as unknown as AskRequest;
}

const B2 = request(
  [
    ["user", ACCOUNT],
    ["assistant", "A grounded answer."],
    ["user", REQUEST],
    ["assistant", "Is this for **Odessa Ferncliff**? Tell me if that should change."],
  ],
  "Yes",
);

beforeEach(() => {
  process.env.FIRST_NAME_SUGGEST_ENABLED = "true";
});
afterEach(() => {
  for (const flag of FLAGS) delete process.env[flag];
});

describe("\"Yes\" keeps the form request", () => {
  it("off: the answer is the account alone, as before", () => {
    const answered = withFirstNameAnswer(B2).question;
    expect(answered).toContain("Odessa Ferncliff at our Grand Island location");
    expect(answered).not.toContain(REQUEST);
  });

  it("on: the account with the full name, then the request it answered", () => {
    process.env.FIRST_NAME_YES_KEEPS_REQUEST_ENABLED = "true";
    expect(withFirstNameAnswer(B2).question).toBe(`${ACCOUNT.replace("Odessa", "Odessa Ferncliff")}\n${REQUEST}`);
  });

  it("on: when the name and the request were one turn, unchanged", () => {
    process.env.FIRST_NAME_YES_KEEPS_REQUEST_ENABLED = "true";
    const one = request(
      [
        ["user", "create a coaching form for odessa, out of dress code"],
        ["assistant", "Is this for **Odessa Ferncliff**? Tell me if that should change."],
      ],
      "Yes",
    );
    expect(withFirstNameAnswer(one).question).toBe("create a coaching form for Odessa Ferncliff, out of dress code");
  });
});
