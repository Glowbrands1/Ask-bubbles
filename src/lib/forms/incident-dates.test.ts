import { describe, expect, it } from "vitest";

import {
  DATE_QUESTION_TAG,
  answersDateQuestion,
  askedForDate,
  dateAlreadyAsked,
  dateAnsweredIn,
  dateQuestion,
  incidentDates,
  readDateChoice,
} from "./incident-dates";

const TODAY = "2026-10-16";

describe("incident dates are told apart from earlier steps and the future", () => {
  it("lists every incident date once, oldest first", () => {
    expect(incidentDates("She was late on 10/15 and 10/5, and again 10/15", TODAY)).toEqual(["2026-10-05", "2026-10-15"]);
  });

  it("leaves out an earlier coaching or warning date — that is history, not an incident", () => {
    expect(incidentDates("late on 10/15. I verbally coached her on 9/1", TODAY)).toEqual(["2026-10-15"]);
    expect(incidentDates("late 10/15, got a verbal warning on september 21", TODAY)).toEqual(["2026-10-15"]);
  });

  it("leaves out a follow-up date and anything after today", () => {
    expect(incidentDates("late on 10/15, follow up the week of October 30", TODAY)).toEqual(["2026-10-15"]);
    expect(incidentDates("late on 10/15 and the meeting is 10/30", TODAY)).toEqual(["2026-10-15"]);
  });

  it("is empty when no date was typed ('today' is the creation date)", () => {
    expect(incidentDates("she was late today", TODAY)).toEqual([]);
  });
});

describe("the question", () => {
  const question = dateQuestion(["2026-10-05", "2026-10-15"]);

  it("names the dates, offers the likely answers and says what stays", () => {
    expect(question).toContain("**10/5**, **10/15**");
    expect(question).toContain(DATE_QUESTION_TAG);
    expect(question).toMatch(/most recent/);
    expect(question).toMatch(/Every date stays in the description/);
    expect(askedForDate(question)).toBe(true);
    expect(dateAlreadyAsked([{ role: "assistant", content: question }])).toBe(true);
    expect(dateAlreadyAsked([{ role: "assistant", content: "Which store?" }])).toBe(false);
  });
});

describe("reading the answer", () => {
  const dates = ["2026-10-05", "2026-10-15"];
  it.each([
    ["most recent", { kind: "date", iso: "2026-10-15" }],
    ["the latest one", { kind: "date", iso: "2026-10-15" }],
    ["use 10/5", { kind: "date", iso: "2026-10-05" }],
    ["the first", { kind: "date", iso: "2026-10-05" }],
    ["October 15", { kind: "date", iso: "2026-10-15" }],
    ["today", { kind: "today" }],
  ])("%j", (reply, expected) => {
    expect(readDateChoice(reply, dates, TODAY)).toEqual(expected);
  });

  it.each(["why does it matter?", "she was rude too", ""])("%j is not an answer", (reply) => {
    expect(readDateChoice(reply, dates, TODAY)).toBeNull();
  });

  it("is found over a conversation, and a bare reply continues the intake", () => {
    const ask = { role: "assistant", content: question() };
    expect(dateAnsweredIn([ask, { role: "user", content: "most recent" }], dates, TODAY)).toEqual({ kind: "date", iso: "2026-10-15" });
    expect(dateAnsweredIn([{ role: "user", content: "most recent" }, ask], dates, TODAY)).toBeNull();
    expect(answersDateQuestion([ask], "most recent", dates, TODAY)).toBe(true);
    expect(answersDateQuestion([{ role: "assistant", content: "Which store?" }], "most recent", dates, TODAY)).toBe(false);
  });

  function question() {
    return dateQuestion(dates);
  }
});
