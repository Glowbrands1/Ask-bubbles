import { describe, expect, it } from "vitest";

import { adviceNotForm, onlyAsksWho } from "./advice-not-form";

/*
 * QA, live on the agent loop (Standard mode), 24 Nov 2026, twice: "Coach a leader on running better follow-up
 * conversations" was answered only "Who is this Coaching Form for?". Their exact words first; then the requests that
 * must still start a card (the home shortcut "Create a coaching form." among them).
 */
describe("adviceNotForm: advice is answered, a form request is not advice", () => {
  it.each([
    "Coach a leader on running better follow-up conversations",
    "how do I coach a leader on follow-ups?",
    "should i do a coaching or corrective action",
    "give me tips for running a follow-up",
    "Help me coach a new manager on accountability",
    "walk me through a corrective action conversation",
  ])("advice: %s", (said) => {
    expect(adviceNotForm(said)).toBe(true);
  });

  it.each([
    "Create a coaching form.",
    "create a coaching form for Fenna Prewitt, she was late",
    "coaching form for Fenna Prewitt",
    "write up Fenna Prewitt",
    "write her up, Fenna Prewitt was late to her shift on 11/20/26",
    "coach Fenna Prewitt on this, she was late to her shift on 11/20/26",
    "do a CA for Fenna Prewitt, she was late to her shift on 11/20/26",
    "verbal for Fenna Prewitt, she was late to her shift on 11/20/26",
    "Fenna Prewitt quit, do the paperwork, her last day was 11/20/26",
    "exit for Fenna Prewitt, she resigned and her last day was 11/20/26",
    "is it okay if you make a coaching form for Fenna?",
    "can you coach Fenna on being late?",
    "make me a CA for Fenna for being late on 11/5",
    "can i review the card",
    "what's on the form?",
    "Fenna Prewitt",
    "yes",
  ])("a form request or an answer: %s", (said) => {
    expect(adviceNotForm(said)).toBe(false);
  });
});

describe("onlyAsksWho", () => {
  it("reads QA's reply", () => {
    expect(onlyAsksWho("Who is this Coaching Form for?")).toBe(true);
    expect(onlyAsksWho("Running strong follow-up is where most coaching actually succeeds or fails. 1. Open with what you agreed.")).toBe(false);
  });
});

describe("adviceNotForm: an account with a form for someone is no question", () => {
  it("the sibling app's nov22 replay case words (invented person)", () => {
    expect(adviceNotForm("ca for Dalia Varn, This is what happened: She has recieved coaching on 9/22 for cleaning tasks not being completed. What was observed this weekend is that trash liners were not put into the trash cans after collecting trash, laundry was not done")).toBe(false);
  });
});
