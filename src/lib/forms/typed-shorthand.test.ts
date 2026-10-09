import { describe, expect, it } from "vitest";

import { readExitFacts } from "./exit-facts";
import { singleSpokenDate, spokenDates } from "./relative-date";
import { repairContractions } from "./typed-contractions";

const TODAY = "2026-09-30"; // a Wednesday

describe("contractions typed without the apostrophe", () => {
  it.each([
    ["wouldnt rehire", "wouldn't rehire"],
    ["she didnt give notice", "she didn't give notice"],
    ["Dont rehire", "Don't rehire"],
    ["isnt eligible", "isn't eligible"],
    ["we cant rehire", "we can't rehire"],
    ["he wont be back", "he won't be back"],
  ])("%s → %s", (typed, repaired) => {
    expect(repairContractions(typed)).toBe(repaired);
  });

  it("leaves words that only look similar alone", () => {
    expect(repairContractions("the student was pleasant and constant")).toBe("the student was pleasant and constant");
  });
});

describe("relative dates as they are typed on a phone", () => {
  it.each([
    ["yest", "2026-09-29"],
    ["yday", "2026-09-29"],
    ["yesterday", "2026-09-29"],
    ["tmrw", "2026-10-01"],
    ["tomorow", "2026-10-01"],
    ["2 days ago", "2026-09-28"],
    ["three days ago", "2026-09-27"],
    ["a week ago", "2026-09-23"],
    ["2 wks ago", "2026-09-16"],
  ])("%s → %s", (phrase, iso) => {
    expect(singleSpokenDate(`it happened ${phrase}`, TODAY)).toBe(iso);
  });

  it("more than a month back is not resolved", () => {
    expect(singleSpokenDate("it happened 90 days ago", TODAY)).toBeNull();
  });

  it("two different days is a question, never a choice", () => {
    expect(singleSpokenDate("yest or 2 days ago", TODAY)).toBeNull();
    expect(spokenDates("yest or 2 days ago", TODAY).map((date) => date.iso)).toEqual(["2026-09-29", "2026-09-28"]);
  });

  it("the exit reader agrees with the shared reader about 'yest'", () => {
    expect(readExitFacts("her last day was yest", TODAY).lastDayWorked).toBe("2026-09-29");
  });
});
