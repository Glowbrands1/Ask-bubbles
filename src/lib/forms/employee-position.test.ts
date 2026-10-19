import { describe, expect, it } from "vitest";

import {
  POSITION_QUESTION_TAG,
  answersPositionQuestion,
  askedForPosition,
  positionAlreadyAsked,
  positionAnsweredIn,
  positionQuestion,
  readPositionAnswer,
  samePosition,
} from "./employee-position";

describe("the position question", () => {
  it("names the employee, says why it is asking, and promises not to guess", () => {
    const question = positionQuestion("Pat Rivera");
    expect(question).toContain("**Pat Rivera**");
    expect(question).toContain(POSITION_QUESTION_TAG);
    expect(question).toMatch(/won't guess/);
    expect(askedForPosition(question)).toBe(true);
    expect(askedForPosition("Which store is this about?")).toBe(false);
  });
});

describe("reading the answer", () => {
  it.each([
    ["makery associate", "Makery Associate"],
    ["She is a makery associate", "Makery Associate"],
    ["she's a shift lead.", "Shift Lead"],
    ["Her position is Operator", "Operator"],
    ["title: Store Manager", "Store Manager"],
    ["the position is ASM", "ASM"],
    ["a barista", "Barista"],
  ])("%j", (reply, expected) => {
    expect(readPositionAnswer(reply)).toBe(expected);
  });

  it.each([
    "yes",
    "no",
    "I don't know",
    "skip",
    "what do you mean?",
    "she was late again on Friday and Saturday because of the weather",
    "",
    "   ",
    "12345",
  ])("is not a position: %j", (reply) => {
    expect(readPositionAnswer(reply)).toBeNull();
  });
});

describe("over a conversation", () => {
  const ask = { role: "assistant", content: positionQuestion("Pat Rivera") };

  it("finds the answer the manager gave to an earlier question", () => {
    expect(positionAnsweredIn([ask, { role: "user", content: "makery associate" }])).toBe("Makery Associate");
  });

  it("ignores a reply that did not follow the question", () => {
    expect(positionAnsweredIn([{ role: "user", content: "makery associate" }, { role: "assistant", content: "Which store?" }])).toBeNull();
  });

  it("knows a bare answer is an answer, and a question is not", () => {
    expect(answersPositionQuestion([ask], "she is a shift lead")).toBe(true);
    expect(answersPositionQuestion([ask], "what is a position?")).toBe(false);
    expect(answersPositionQuestion([{ role: "assistant", content: "Which store?" }], "shift lead")).toBe(false);
  });

  it("remembers that it already asked, so it asks once", () => {
    expect(positionAlreadyAsked([ask])).toBe(true);
    expect(positionAlreadyAsked([{ role: "assistant", content: "Which store?" }])).toBe(false);
  });

  it("compares titles the way a person does", () => {
    expect(samePosition("Shift Lead", "shift  lead")).toBe(true);
    expect(samePosition("Shift Lead", "Store Manager")).toBe(false);
  });
});
