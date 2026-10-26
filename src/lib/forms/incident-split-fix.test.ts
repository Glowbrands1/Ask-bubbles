import { afterEach, describe, expect, it } from "vitest";

import { correctiveActionIssue } from "./incident-issue";

/**
 * QA, 25 Oct 2026, Bubbles production on the plain path (conv_mvoftzhs29se8nb,
 * conv_mvofuak12ovvib7, batches B2-B5). The managers' turns exactly, names
 * invented. TYPED_NAME_ENABLED is on in production.
 */
const FLAGS = ["INCIDENT_SPLIT_FIX_ENABLED", "TYPED_NAME_ENABLED", "DECIMAL_KEEP_ENABLED"] as const;
const saved = Object.fromEntries(FLAGS.map((name) => [name, process.env[name]]));
afterEach(() => {
  for (const name of FLAGS) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

const J = "\n\n";
const OPENED_LATE = "create a ca for avery stone. on 10-21-26 avery opened the store 20 minutes late.";

const CASES: readonly [string, string, string, string | null][] = [
  [
    "second sentence kept",
    "create verbal CA for lena marsh for violating visitors at work policy on 10-10-26. lena spent 40 minutes talking with friend and ignoring guests. previous coaching was jba policy manual 1-1-26",
    "lena marsh",
    "violating visitors at work policy on 10-10-26. lena spent 40 minutes talking with friend and ignoring guests",
  ],
  [
    "'Dodge, NE' and where she works are not the incident",
    "Hi, I need a verbal corrective action for Tess Varga, she is a team member at our Dodge, NE store. On 10-1-26 she opened the store late. She did not call ahead.",
    "Tess Varga",
    "On 10-1-26 she opened the store late. She did not call ahead",
  ],
  [
    "the incident after 'as a team member and'",
    "Please create a corrective action form for Devon Hale, she works at our Dodge, NE store as a team member and was late today.",
    "Devon Hale",
    "was late today",
  ],
  [
    "a title at a store is not the incident",
    "I need a CA form for Rhea Dunmore, she is the store Director at our Kearney. She was out of dress code on October 11",
    "Rhea Dunmore",
    "She was out of dress code on October 11",
  ],
  ["a later 'Policy violated:' line", `${OPENED_LATE}${J}Policy violated: Standards of Conduct`, "avery stone", "on 10-21-26 avery opened the store 20 minutes late"],
  ["a later one-line correction", `${OPENED_LATE}${J}not attendance, late opening`, "avery stone", "on 10-21-26 avery opened the store 20 minutes late"],
  [
    "a later pasted policy paragraph",
    `${OPENED_LATE}${J}When an employee assigned to open a location is unable to open the location at the proper time, the employee must notify the manager. The employee who failed to open will then be required to reimburse The Company $25`,
    "avery stone",
    "on 10-21-26 avery opened the store 20 minutes late",
  ],
  [
    "'change observation of offense to:' replaces it",
    `${OPENED_LATE}${J}change observation of offense to: avery opened 25 minutes late and did not call`,
    "avery stone",
    "avery opened 25 minutes late and did not call",
  ],
];

describe("INCIDENT_SPLIT_FIX_ENABLED off: the Issue is read as on main", () => {
  it("cuts at 'Dodge,' and keeps only the first sentence", () => {
    process.env.TYPED_NAME_ENABLED = "on";
    delete process.env.INCIDENT_SPLIT_FIX_ENABLED;
    expect(correctiveActionIssue(CASES[1]![1], "Tess Varga")).toBe("she is a team member at our Dodge");
    expect(correctiveActionIssue(CASES[2]![1], "Devon Hale")).toBe("she works at our Dodge");
    expect(correctiveActionIssue(CASES[0]![1], "lena marsh")).toBe("violating visitors at work policy on 10-10-26");
  });
});

describe("INCIDENT_SPLIT_FIX_ENABLED on", () => {
  it.each(CASES)("%s", (_, text, name, issue) => {
    process.env.TYPED_NAME_ENABLED = "on";
    process.env.INCIDENT_SPLIT_FIX_ENABLED = "on";
    expect(correctiveActionIssue(text, name)).toBe(issue);
  });

  it.each(CASES)("%s, in capitals and in lowercase", (_, text, name, issue) => {
    process.env.TYPED_NAME_ENABLED = "on";
    process.env.INCIDENT_SPLIT_FIX_ENABLED = "on";
    expect(correctiveActionIssue(text.toUpperCase(), name)?.toLowerCase()).toBe(issue?.toLowerCase());
    expect(correctiveActionIssue(text.toLowerCase(), name)?.toLowerCase()).toBe(issue?.toLowerCase());
  });

  it("keeps what already works: the for-clause, '$3.25' and a request with no account", () => {
    process.env.TYPED_NAME_ENABLED = "on";
    process.env.INCIDENT_SPLIT_FIX_ENABLED = "on";
    expect(correctiveActionIssue("jordan testperson needs a written warning for cash handling", "jordan testperson")).toBe("cash handling");
    expect(correctiveActionIssue("create ca form for wren calloway. wren had a register shortage of $3.25 on 10-20-26.", "wren calloway")).toBe(
      "wren had a register shortage of $3.25 on 10-20-26",
    );
    expect(correctiveActionIssue("create a ca for avery stone", "avery stone")).toBeNull();
  });
});

/**
 * QA-2, 26 Oct 2026, with INCIDENT_SPLIT_FIX_ENABLED on: suites whose Issue
 * picked up another field's answer, or lost part of the account. The suites'
 * own turns, names invented. With the flag on, an Issue that main left empty
 * or read as the for-clause is now the account (intended); these pin what it
 * must never contain.
 */
describe("INCIDENT_SPLIT_FIX_ENABLED on: the Issue never carries another field's answer", () => {
  const on = () => {
    process.env.INCIDENT_SPLIT_FIX_ENABLED = "on";
    process.env.TYPED_NAME_ENABLED = "1";
  };

  it.each([
    [
      "the duration stays (b12)",
      "do verbal for team member sadie hoffart at empire, sd. payroll deduct does not apply. previous coaching jba manual 11-1-26. on 10-22-26 sadie was not scheduled to work and came into the store to show her team her new puppy. Sadie was in the store 45 min",
      "Sadie Hoffart",
      /puppy.*45 min/i,
      /payroll|coaching|manual/i,
    ],
    [
      "a prior verbal CA is not the account (Q13)",
      "create a CA for tess varga for not attending the monthly meeting on 10-20-26. previous coaching: jba policy manual 1-1-26, verbal ca 9-1-26",
      "Tess Varga",
      /^not attending the monthly meeting on 10-20-26$/,
      /verbal|9-1-26/i,
    ],
    [
      "a payroll answer is not the account",
      "create a ca for dana moss, she was 30 minutes late today, first time. No payroll deduction",
      "Dana Moss",
      /30 minutes late today/,
      /payroll/i,
    ],
    [
      "an earlier verbal warning and its date are not the account (Verbal, never Written)",
      "create a ca form for rosalyn test, she was late again for 30 mins today. given verbal warning on 9/21",
      "Rosalyn Test",
      /^she was late again for 30 mins today$/,
      /verbal|9\/21|written/i,
    ],
    [
      "the level and the name are not the account",
      "jordan testperson cash handling written warning",
      "Jordan Testperson",
      /^cash handling$/,
      /jordan|written/i,
    ],
    [
      "'please' is not the account",
      "CA for jordan about her register being short $20, please",
      "Jordan Testperson",
      /^her register being short \$20$/,
      /please/i,
    ],
    [
      "'This is a verbal warning', 'She is at Dodge' and 'I verbally coached her' are not the account",
      "My employee pat rivera was 10 minutes late on 10/5 and 10/15. I verbally coached her on the first one. She is at Dodge. This is a verbal warning. Create a CA",
      "Pat Rivera",
      /10 minutes late on 10\/5 and 10\/15$/,
      /coached|dodge|this is|verbal/i,
    ],
  ])("%s", (_name, text, employee, has, never) => {
    on();
    for (const variant of [text, text.toLowerCase()]) {
      const issue = correctiveActionIssue(variant, employee) ?? "";
      expect(issue).toMatch(new RegExp(has.source, "i"));
      expect(issue).not.toMatch(never);
    }
  });
});

/**
 * Coordinator ruling, 26 Oct 2026: INCIDENT_SPLIT_FIX_ENABLED reads the Issue
 * before the TYPED_NAME path (on in production), so for the typed-name turns
 * it must give the Issue TYPED_NAME gives alone.
 */
describe("INCIDENT_SPLIT_FIX_ENABLED + TYPED_NAME_ENABLED: typed-name turns read as TYPED_NAME alone", () => {
  it.each([
    [
      "create a verbal CA for team member Testy Testerson at Dodge, NE. location. On 10-16-26 Testy was not properly measuring and weighing product. payroll deduct is not applicable",
      "Testy Testerson",
    ],
    [
      "create a written corrective action for Team Member, Test Employee. Test was assigned to complete policy acknowledgements in woven by 10-15-26 and failed to meet the deadline. Previous coaching was a Verbal CA 10-1-26. Payroll deduct is not applicable.",
      "Test Employee",
    ],
    [
      "do verbal for team member sadie hoffart at empire, sd. payroll deduct does not apply. previous coaching jba manual 11-1-26. on 10-22-26 sadie was not scheduled to work and came into the store to show her team her new puppy. Sadie was in the store 45 min",
      "Sadie Hoffart",
    ],
    ["CA for team member Testy Testerson at Dodge. On 10-16-26 Testy was not properly measuring and weighing product.", "Testy Testerson"],
  ])("%s", (text, employee) => {
    process.env.TYPED_NAME_ENABLED = "1";
    delete process.env.INCIDENT_SPLIT_FIX_ENABLED;
    const typed = correctiveActionIssue(text, employee);
    process.env.INCIDENT_SPLIT_FIX_ENABLED = "on";
    expect(correctiveActionIssue(text, employee)).toBe(typed);
  });
});

/** QA-6 negation probes, 26 Oct 2026: another person's clause and what she is not are never the Issue. */
describe("INCIDENT_SPLIT_FIX_ENABLED on: another person and what she is not", () => {
  it.each([
    ["create a ca for Devon Harlan but not for Rory Vance, who spent 40 minutes on the phone", null],
    ["create a ca for Devon Harlan. She is not rude. She was late.", "She was late"],
    ["create a ca for Devon Harlan. She was never late. She did not clean the counters.", "She did not clean the counters"],
  ])("%s", (text, issue) => {
    process.env.INCIDENT_SPLIT_FIX_ENABLED = "on";
    process.env.TYPED_NAME_ENABLED = "1";
    for (const variant of [text, text.toLowerCase()]) {
      const out = correctiveActionIssue(variant, "Devon Harlan");
      if (issue === null) expect(out ?? "").not.toMatch(/rory|40 minutes/i);
      else expect(out?.toLowerCase()).toBe(issue.toLowerCase());
    }
  });
});

/** QA-2 probes, 26 Oct 2026: a negated comma clause, another person's clause, and a payroll tail are never the Issue. */
describe("INCIDENT_SPLIT_FIX_ENABLED on: negated and other people's clauses", () => {
  it.each([
    ["create ca for dana smith, she is not at fault, the register was short $12.50", "the register was short $12.50"],
    ["Create CA for Dana Smith, she is not a manager, she left the register open on 10-5", "she left the register open on 10-5"],
    ["Create CA for Dana Smith, she is not at the Dodge store, she was late on 10-5", "she was late on 10-5"],
    ["Create CA for Dana Smith, she is not a team member, she is a shift lead, and left the store unlocked 10-5", "left the store unlocked 10-5"],
    ["create ca for dana smith, she opened late on 10-5 and tom lee was late on 10-6", "she opened late on 10-5"],
    ["create ca for dana smith, tom lee was late on 10-6 and she left early on 10-5", "she left early on 10-5"],
    ["create ca for dana smith, she was late on 10-5, but not tom lee", "she was late on 10-5"],
    ["create a ca for dana smith, he didn't clock in on 10-1 and no payroll deduct", "he didn't clock in on 10-1"],
  ])("%s", (text, issue) => {
    process.env.INCIDENT_SPLIT_FIX_ENABLED = "on";
    process.env.TYPED_NAME_ENABLED = "1";
    for (const variant of [text, text.toLowerCase()]) expect(correctiveActionIssue(variant, "Dana Smith")?.toLowerCase()).toBe(issue.toLowerCase());
  });

  it("another person's sentence is left out: 'Rory Vance was late.'", () => {
    process.env.INCIDENT_SPLIT_FIX_ENABLED = "on";
    process.env.TYPED_NAME_ENABLED = "1";
    expect(correctiveActionIssue("create a ca for Devon Harlan. Rory Vance was late. Devon left early.", "Devon Harlan")).toBe("Devon left early");
  });
});
