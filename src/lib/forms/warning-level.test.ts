import { describe, expect, it } from "vitest";

import {
  mentionsEarlierWarning,
  statedWarningLevel,
  warningLevelChecked,
  warningLevelCorrection,
  warningLevelFromTurns,
  warningMentions,
  withoutModelWarningLevel,
} from "./warning-level";

/**
 * The warning being issued NOW, read apart from the warnings already on file.
 *
 * Production, 9 Oct 2026: "create a ca form for paulyne test, she was late
 * again for 30 mins today. given verbal warning on 9/21" came back with
 * Written Warning ticked. The level is the manager's to state; history and
 * "again" never state it.
 */
const TODAY = "2026-10-09";

describe("the production report", () => {
  const REPORT =
    "create a ca form for paulyne test, she was late again for 30 mins today. given verbal warning on 9/21";

  it("reads the 9/21 verbal warning as history, and no level for this form", () => {
    expect(warningMentions(REPORT, TODAY)).toEqual([
      expect.objectContaining({ level: "verbal", kind: "historical" }),
    ]);
    expect(statedWarningLevel(REPORT, TODAY)).toBeNull();
    expect(mentionsEarlierWarning(REPORT, TODAY)).toBe(true);
  });

  it("never escalates: nothing in it reads as a written warning", () => {
    expect(warningMentions(REPORT, TODAY).some((mention) => mention.level === "written")).toBe(false);
  });
});

describe("history is never this form's level", () => {
  it.each([
    "she was late again today. given verbal warning on 9/21",
    "late today, got verbal warning on september 21",
    "she got a verbal warning on 9/21 and was late again today",
    "previous verbal warning on 09/21/2026, late again today",
    "she already has a verbal warning, late again",
    "her last verbal warning was in august",
    "she had a written warning last month and was late again",
    "verbal warning on 9/21. late again for 30 mins today",
    "she received a verbal warning last week",
    "after her verbal warning she was late again today",
    "despite a verbal warning she keeps coming in late",
    "she has had a verbal warning before",
    "it's her third time late, verbal warning on 9/1",
  ])("%s", (text) => {
    expect(statedWarningLevel(text, TODAY)).toBeNull();
    expect(mentionsEarlierWarning(text, TODAY)).toBe(true);
  });
});

describe("a past-tense warning dated after today is still history", () => {
  // A month and day with no year takes the current one; beside "got" it is last year's.
  it("got verbal warning on september 21, read on september 9", () => {
    const text = "create ca for marlowe co she was late today, got verbal warning on september 21";
    expect(statedWarningLevel(text, "2026-09-09")).toBeNull();
    expect(mentionsEarlierWarning(text, "2026-09-09")).toBe(true);
  });
});

describe("\"again\" and repetition say nothing about the level", () => {
  it.each([
    "Sarah was 20 minutes late again today. Create a corrective action.",
    "she keeps coming in late, this is the third time",
    "late again for the 4th time this month",
  ])("%s", (text) => {
    expect(statedWarningLevel(text, TODAY)).toBeNull();
  });
});

describe("a level stated for THIS form", () => {
  it.each([
    ["give her a verbal warning", "verbal"],
    ["create a written warning for Sarah, late today", "written"],
    ["Verbal warning for Sarah Test — late today", "verbal"],
    ["She was 30 minutes late today, verbal warning.", "verbal"],
    ["this is a written warning", "written"],
    ["it should be a verbal warning", "verbal"],
    ["make it verbal", "verbal"],
    ["just verbal", "verbal"],
    ["verbal", "verbal"],
    ["Written.", "written"],
    ["5. verbal", "verbal"],
    ["warning level: written", "written"],
    ["type of warning - verbal", "verbal"],
    ["I gave her a verbal warning today", "verbal"],
    ["give her a written warning on 10/2", "written"],
    ["issue a formal written warning", "written"],
    ["she was late last night, verbal warning", "verbal"],
  ] as const)("%s -> %s", (text, level) => {
    expect(statedWarningLevel(text, TODAY)).toBe(level);
  });

  it("separates the current request from the history in the same message", () => {
    const text =
      "create a ca form for paulyne test, she was late again for 30 mins today. given verbal warning on 9/21. give her a verbal warning for today";
    expect(statedWarningLevel(text, TODAY)).toBe("verbal");

    const written =
      "create a ca form for paulyne test, she was late again for 30 mins today. given verbal warning on 9/21. this one is a written warning";
    expect(statedWarningLevel(written, TODAY)).toBe("written");
  });

  it("keeps the multi-step history out of the current level", () => {
    const text =
      "Late again today. She was coached on 8/12, got a verbal warning on 9/2 and a written warning on 9/21. Give her a written warning.";
    const mentions = warningMentions(text, TODAY);
    expect(mentions.filter((mention) => mention.kind === "historical").map((mention) => mention.level)).toEqual([
      "verbal",
      "written",
    ]);
    expect(statedWarningLevel(text, TODAY)).toBe("written");
  });
});

describe("ambiguous history is asked about, not guessed", () => {
  it.each([
    "I gave her a verbal warning",
    "she got a verbal warning",
    "should this be a verbal or written warning?",
    "should I give her a written warning?",
    "not sure if it's verbal or written",
    "verbal or written warning, not sure",
  ])("%s", (text) => {
    expect(statedWarningLevel(text, TODAY)).toBeNull();
  });

  it("does not count a negated level", () => {
    expect(statedWarningLevel("not a written warning", TODAY)).toBeNull();
    expect(statedWarningLevel("not a written warning, just verbal", TODAY)).toBe("verbal");
    expect(statedWarningLevel("verbal warning, not written", TODAY)).toBe("verbal");
  });

  it("reads an account rather than a decision as nothing", () => {
    expect(statedWarningLevel("she gave a verbal heads-up to the team", TODAY)).toBeNull();
    expect(statedWarningLevel("she wrote a written statement", TODAY)).toBeNull();
  });
});

describe("corrections", () => {
  it.each([
    ["change written warning to verbal warning", "verbal"],
    ["Change the Written Warning to a Verbal Warning.", "verbal"],
    ["change it to verbal", "verbal"],
    ["make it a verbal warning", "verbal"],
    ["it should be verbal, not written", "verbal"],
    ["switch it to written", "written"],
    ["actually, written warning", "written"],
    ["uncheck written warning and check verbal", "verbal"],
  ] as const)("%s -> %s", (text, level) => {
    expect(warningLevelCorrection(text, TODAY)).toBe(level);
  });

  it.each([
    "should it be verbal?",
    "she had a verbal warning in August too",
    "what's the difference between a verbal and written warning?",
  ])("%s is not a correction", (text) => {
    expect(warningLevelCorrection(text, TODAY)).toBeNull();
  });

  it("the latest turn wins across a conversation", () => {
    expect(
      warningLevelFromTurns(
        ["create a ca for sarah, late again today. given verbal warning on 9/21", "written", "actually make it verbal"],
        TODAY,
      ),
    ).toBe("verbal");
    expect(warningLevelFromTurns(["late today. given verbal warning on 9/21", "no payroll deduct"], TODAY)).toBeNull();
  });
});

describe("the stored box", () => {
  it("drops the model's warning level and keeps any other tick for the other guards", () => {
    expect(withoutModelWarningLevel({ warning_type: ["written"], offense_type: ["tardiness"] })).toEqual({
      checked: { offense_type: ["tardiness"] },
      dropped: ["written"],
    });
    expect(withoutModelWarningLevel({ warning_type: ["verbal", "termination"] }).checked).toEqual({
      warning_type: ["termination"],
    });
  });

  it("ticks exactly one offered level, never a default", () => {
    expect(warningLevelChecked("verbal", ["verbal", "written"])).toEqual({ warning_type: ["verbal"] });
    expect(warningLevelChecked("final_warning", ["verbal", "written"])).toEqual({});
    expect(warningLevelChecked(null, ["verbal", "written"])).toEqual({});
  });
});
