import { describe, expect, it } from "vitest";

import { positionQuestion } from "./employee-position";
import { dateQuestion } from "./incident-dates";
import { checkProposalIsCurrent } from "./proposal-currency";
import { STORE_QUESTION_TAG, answersToOpenQuestions } from "./question-answers";

const user = (content: string) => ({ role: "user" as const, content });
const assistant = (content: string) => ({ role: "assistant" as const, content });

describe("answers to the position, date and store questions", () => {
  it("are found only where the turn right before them asked", () => {
    const conversation = [
      user("Create a corrective action for Sam Ortega"),
      assistant(positionQuestion("Sam Ortega")),
      user("barista"),
      assistant(dateQuestion(["2026-10-05", "2026-10-15"])),
      user("most recent"),
      assistant(`Tell me ${STORE_QUESTION_TAG}.`),
      user("Kearney"),
      assistant("Anything else?"),
      user("Dodge"),
    ];
    expect([...answersToOpenQuestions(conversation)].sort()).toEqual(["Kearney", "barista", "most recent"]);
  });
});

describe("the create route's currency check does not take an answer for a different employee", () => {
  const conversation = (answer: string, question: string) => [
    user("Create a corrective action for Sam Ortega at Kearney, late on 10/5 and 10/15"),
    assistant(question),
    user(answer),
  ];

  it.each([
    ["barista", positionQuestion("Sam Ortega")],
    ["most recent", dateQuestion(["2026-10-05", "2026-10-15"])],
    ["Kearney", `Tell me ${STORE_QUESTION_TAG}, or leave Location blank.`],
  ])("a bare %j after its question", (answer, question) => {
    expect(checkProposalIsCurrent({ conversation: conversation(answer, question), templateKey: "dpoa", employeeName: "Sam Ortega" })).toEqual({ current: true });
  });

  it("still refuses a card when the manager really named somebody else", () => {
    const result = checkProposalIsCurrent({
      conversation: [
        user("Create a corrective action for Sam Ortega"),
        assistant("Here is what I would put on a **Corrective Action Form**."),
        user("No, it's for Jordan Vance"),
      ],
      templateKey: "dpoa",
      employeeName: "Sam Ortega",
    });
    expect(result.current).toBe(false);
  });
});

describe("a reply that is really a correction or a name is not an answer", () => {
  it.each([
    "actually make it jordan testperson",
    "No, not Sam. Jordan Vance.",
    "jordan vance",
  ])("%j after the position question", (reply) => {
    const answers = answersToOpenQuestions([assistant(positionQuestion("Sam Ortega")), user(reply)]);
    expect(answers.size).toBe(0);
  });

  it.each(["barista", "she's a shift lead", "makery associate"])("%j is", (reply) => {
    expect(answersToOpenQuestions([assistant(positionQuestion("Sam Ortega")), user(reply)]).size).toBe(1);
  });
});
