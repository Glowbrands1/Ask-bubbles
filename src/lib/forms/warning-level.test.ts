import { describe, expect, it } from "vitest";

import { JOIN } from "./bounded-context";
import { correctiveActionIssue } from "./incident-issue";

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
    ["she's getting a written warning", "written"],
    ["she'll get a verbal warning", "verbal"],
    ["she will receive a verbal warning", "verbal"],
    ["she gets a verbal warning this time", "verbal"],
    ["verbal warning today", "verbal"],
    ["verbal warning issued today", "verbal"],
    ["verbal warning given today", "verbal"],
    ["verbal warning 10/9", "verbal"],
    ["verbal warning (today)", "verbal"],
    // The level as the last word of the turn (owner's retest variants, PR #8).
    ["She was 30 minutes late today, verbal warning.", "verbal"],
    ["she was late last night, verbal warning", "verbal"],
    ["jordan testperson cash handling written warning", "written"],
    ["need a CA for jordan testperson. she mishandled cash at close yesterday. written warning", "written"],
    ["verbal warning this morning", "verbal"],
    ["she's going to get a written warning", "written"],
    ["another written warning", "written"],
    ["documenting a verbal warning for today", "verbal"],
    ["1. Sarah\n2. Kearny\n3. today\n4. late\n5. verbal\n6. first time", "verbal"],
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
    // A level named with nothing saying it is this form's: asked, not assumed.
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

/*
 * THE INDEPENDENT REVIEW'S INPUTS (PR #10). Each of these read as this form's
 * level before the default became "ask"; none may now.
 */
describe("history phrasings found in review never become this form's level", () => {
  it.each([
    "Prior actions:\n- verbal warning\n- written warning",
    "prior actions:\nverbal\nwritten",
    "late again today.\n1. verbal warning\n2. written warning",
    "history - verbal warning, written warning",
    "Steps so far: coaching, verbal warning, written warning.",
    "she has a written warning from august",
    "she has a written warning",
    "she is on a written warning",
    "late again. was on written warning",
    "written warning wasn't enough",
    "verbal warning didn't help",
    "late again even with a written warning",
    "late today, written warning in aug",
    "written warning on the 21st",
    "written warning back on the 21st",
    "verbal warning on 21 September",
    "verbal warning given in Sept",
    "verbal warning recently",
    "verbal warning earlier this month",
    "verbal warning in the past",
    "this is her second offense, first was a verbal warning",
    "she's on final warning",
    "she's been getting verbal warnings",
    "she's been getting a written warning every month",
    "she gets warnings all the time",
    "she received a verbal warning on 9/21",
    "she has been given a written warning",
    // Re-verification (PR #10): the get/receive cues with a date, a past or habitual frame.
    "she did get a written warning in august",
    "she did get a written warning on 9/21",
    "she gets a written warning 10/1",
    "10/1 she gets a written warning",
    "first verbal warning 9/21 second written warning 10/1",
    "she's on her second written warning",
    "she'd get a written warning back then",
    "she always gets a written warning",
    "she receives a written warning on 9/21",
    "get a verbal warning on 9/21",
    "she did receive a written warning",
    "didn't she get a verbal warning last month",
    "this is her second written warning",
    "another written warning would be her third",
    "every time she gets a verbal warning she improves for a week",
    "when she gets a written warning she cries",
    "she receives a verbal warning every month",
    "she keeps getting verbal warnings",
    "she used to get a verbal warning every month",
    // A trailing level after a list of earlier steps is one more item of history.
    "late again today, coached before, verbal warning",
    "she was coached on attendance and warned, written warning",
    // Merge review (PR #10 at ec83da4): a trailing level after a past time or record is history.
    "late again today. last month written warning",
    "late again today. 2 weeks ago, written warning",
    "late again today. last CA: written warning",
    "late again today. in august: written warning",
    "late again today. the first time was a verbal warning",
    "late again today. she had one on 10/1. written warning",
    "last month written warning",
    "last CA was a written warning",
    "last time it was a written warning",
    "same thing last month, written warning",
    "august - written warning",
    "september written warning",
    "last week written warning",
    "a week ago written warning",
    "first offense was a written warning",
    "file shows written warning",
    "HR record: written warning",
    "remember the written warning",
    "same as the written warning",
    "she had one. written warning",
    "late again after receiving a written warning",
    "update it, last month written warning",
    // Final re-check (PR #10): history opening a reply, then "now/today" in the next clause.
    "written warning on the 21st, now late again",
    "written warning 2 weeks back, now late again",
    "written warning at her review, now late again today",
    "written warning issued, she's late again today",
    "verbal warning done, now late again",
    "verbal warning complete, now need next",
    "verbal warning given 21st, late again today",
    "I gave her a verbal warning, now she's late again",
    "written warning for the same thing, now late today",
    "verbal warning for that, late again today",
    "create a ca form for paulyne test, she was late again for 30 mins today.\nPrevious actions:\n- verbal warning\n- written warning",
  ])("%s", (text) => {
    expect(statedWarningLevel(text, TODAY)).toBeNull();
  });

  it.each(["late again today. verbal warning on 12/20", "written warning on Dec 20", "verbal warning issued 12/20"])(
    "across the year boundary: %s, read on January 5",
    (text) => {
      expect(statedWarningLevel(text, "2027-01-05")).toBeNull();
      expect(mentionsEarlierWarning(text, "2027-01-05")).toBe(true);
    },
  );

  it("reads a long adversarial turn in linear time", () => {
    for (const text of [`change${" ".repeat(80_000)}x`, `warning${" ".repeat(80_000)}x`, `verbal${" ".repeat(80_000)}x`]) {
      const started = performance.now();
      warningMentions(text, TODAY);
      warningLevelCorrection(text, TODAY);
      expect(performance.now() - started).toBeLessThan(250);
    }
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
    ["change written warning to verbal", "verbal"],
    ["change the written warning to verbal", "verbal"],
    ["change written warning to verbal for paulyne", "verbal"],
    ["set the warning type to verbal", "verbal"],
    ["verbal not written", "verbal"],
    ["no, verbal", "verbal"],
    ["actually verbal", "verbal"],
    ["oops i meant verbal", "verbal"],
    ["it should have been verbal", "verbal"],
    ["change paulyne's warning to verbal", "verbal"],
    ["verbal", "verbal"],
    ["Written warning.", "written"],
  ] as const)("%s -> %s", (text, level) => {
    expect(warningLevelCorrection(text, TODAY)).toBe(level);
  });

  it.each([
    "should it be verbal?",
    "she had a verbal warning in August too",
    "what's the difference between a verbal and written warning?",
    "she also has a written warning from august",
    "fyi she is on a written warning",
    "Previous actions:\n- verbal warning\n- written warning",
    // Another person's incident is a new request, not a change to this form.
    "jordan was late today, give him a verbal warning",
    "also marcus no call no show, give him a written warning",
    "for the other girl it's a verbal warning",
    "kim was late too - verbal warning",
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

/*
 * ============================================================================
 * FROM PR #8 — the owner's signed-in QA (8–9 Oct 2026), kept as written
 * ============================================================================
 *
 * The level the manager SAID, never inferred. "jordan testperson needs a
 * written warning for cash handling" lost both the level and the issue. All
 * people are synthetic. PR #10's reader answers every one of these the way
 * PR #8's did.
 */
describe("statedWarningLevel — the level the manager SAID, never inferred (PR #8)", () => {
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
    expect(statedWarningLevel(text, TODAY)).toBe(level);
  });

  it("the latest turn that states one wins, so a correction is honoured", () => {
    expect(statedWarningLevel(["written warning for jordan", "actually make it a verbal"].join(JOIN), TODAY)).toBe("verbal");
  });
});

describe("correctiveActionIssue — what the form is for, never the person (PR #8)", () => {
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
