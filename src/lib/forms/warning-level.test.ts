import { describe, expect, it } from "vitest";

import { JOIN } from "./bounded-context";
import { correctiveActionIssue } from "./incident-issue";
import { statedWarningLevel } from "./warning-level";

/**
 * The Corrective Action's stated level and issue, as the manager typed them.
 * Owner's signed-in QA, 8 Oct 2026: "jordan testperson needs a written warning
 * for cash handling" lost both. All people are synthetic.
 */
describe("statedWarningLevel — the level the manager SAID, never inferred", () => {
  it.each([
    ["jordan testperson needs a written warning for cash handling", "written"],
    ["final written for jordan testperson", "written"],
    ["this is her first written warning", "written"],
    ["give jordan a verbal for being late", "verbal"],
    ["not a written warning, just a verbal", "verbal"],
    ["she got a verbal warning last month, now she needs a written warning", "written"],
    ["she was written up last week", null],
    ["written statement from jordan", null],
    ["CA for jordan testperson for cash handling", null],
    ["does she need a written warning?", null],
    // Owner's retest variants, 9 Oct 2026: a history word earlier in the sentence is not this level's history.
    ["jordan was $40 short on her drawer last night, needs a written warning", "written"],
    ["she got a verbal last month, give her a written warning", "written"],
    ["give her a verbal for being late", "verbal"],
    ["needs a writen warning for cash handling", "written"],
    ["verbel warnig for jordan", "verbal"],
    ["she is writing warnings on the board", null],
  ])("%s → %s", (text, level) => {
    expect(statedWarningLevel(text)).toBe(level);
  });

  it("the latest turn that states one wins, so a correction is honoured", () => {
    expect(statedWarningLevel(["written warning for jordan", "actually make it a verbal"].join(JOIN))).toBe("verbal");
  });
});

describe("correctiveActionIssue — what the form is for, never the person", () => {
  it.each([
    ["jordan testperson needs a written warning for cash handling", "jordan testperson", "cash handling"],
    ["a CA for Jordan Testperson for cash handling", "Jordan Testperson", "cash handling"],
    ["CA for jordan about her register being short $20, please", "jordan testperson", "her register being short $20"],
    ["a CA for Jordan Testperson", "Jordan Testperson", null],
    ["written warning for her", "Jordan Testperson", null],
  ])("%s → %s", (text, person, issue) => {
    expect(correctiveActionIssue(text, person)).toBe(issue);
  });
});
