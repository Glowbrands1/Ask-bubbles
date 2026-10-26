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
