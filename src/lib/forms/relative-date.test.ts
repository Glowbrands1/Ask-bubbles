import { describe, expect, it } from "vitest";

import { describesIncident } from "./incident-reading";
import { isQuestion } from "./question";
import { singleSpokenDate, spokenDates } from "./relative-date";

const TODAY = "2026-10-06"; // a Tuesday

describe("dates as managers say them", () => {
  it.each([
    ["yesterday", "2026-10-05"],
    ["today", "2026-10-06"],
    ["todays date", "2026-10-06"],
    ["tomorrow", "2026-10-07"],
    ["last Friday", "2026-10-02"],
    ["last Tuesday", "2026-09-29"],
    ["next Monday", "2026-10-12"],
    ["9/27", "2026-09-27"],
    ["Friday, October 2", "2026-10-02"],
  ])("%s → %s", (text, iso) => expect(singleSpokenDate(text, TODAY)).toBe(iso));

  it("a bare weekday names no week, so it resolves to nothing", () => {
    expect(spokenDates("on Friday", TODAY)).toEqual([expect.objectContaining({ iso: null })]);
    expect(singleSpokenDate("on Friday", TODAY)).toBeNull();
  });

  it("two different days are never chosen between", () => {
    expect(singleSpokenDate("yesterday or 9/27", TODAY)).toBeNull();
  });
});

describe("whether what happened has already been said", () => {
  it.each(["she was late twice this week", "missed the opening checklist today", "I noticed she didn't restock the shelves", "on her phone at the register"])(
    "%s",
    (text) => expect(describesIncident(text)).toBe(true),
  );
  it.each(["I need a coaching note", "Avery Testperson", "create a form"])("not: %s", (text) => expect(describesIncident(text)).toBe(false));
});

describe("questions are never read as statements", () => {
  it.each(["what is the date?", "Did she sign it", "is the form done?"])("%s asks", (text) => expect(isQuestion(text)).toBe(true));
  it.each(["did not show up yesterday", "is not answering her phone", "she was late"])("%s states", (text) => expect(isQuestion(text)).toBe(false));
});
