import { describe, expect, it } from "vitest";

import { findManualSection, manualSectionHeadings, type ManualChunk } from "./official-policy-manual";
import {
  citedCompanyPolicy,
  headingsNamedIn,
  nextPolicySections,
  policyPhrasesIn,
  readPolicyChange,
  sectionsNamedIn,
  similarHeadings,
  unresolvedPolicyName,
} from "./policy-change";
import { extractEmployeeNames } from "./proposal";

/**
 * "Add the attendance policy to this form" — a policy named for the form that
 * is open, read against the manual's own headings. Ported from the reference
 * platform. See `policy-change.ts`.
 */

const sheet = (chunkIndex: number, heading: string, page: number, text = "Text of the section."): ManualChunk => ({
  chunkIndex,
  page: page + 1,
  printedPage: page,
  sections: [{ heading, page }],
  section: heading,
  content: `${heading}\n${text}`,
});

/* The manual as the knowledge base holds it: each section on its own sheet. */
const CHUNKS: ManualChunk[] = [
  {
    chunkIndex: 2,
    page: 3,
    printedPage: 2,
    sections: [],
    section: null,
    content:
      "Table of Contents\nStandards of Conduct ........ 12\nAttendance ........ 14\nLate Opening ........ 15\nVisitors in the Workplace ........ 30",
  },
  sheet(30, "Standards of Conduct", 12),
  sheet(33, "Attendance", 14, "It is the responsibility of each employee to know his or her work schedule and to always be on\ntime."),
  sheet(34, "Late Opening", 15, "When an employee assigned to open a location is unable to open the location at the proper\ntime, the employee must notify the manager as soon as possible."),
  sheet(35, "Dress Code for The Company", 15),
  sheet(64, "Visitors in the Workplace", 30),
  sheet(65, "Animals in the Workplace", 30),
  sheet(70, "Cell Phone Usage", 32),
];

describe("which kind of change a turn asks for", () => {
  it.each([
    ["can you add attendance policy to the direct policy section of this form", "add"],
    ["add the visitors policy too", "add"],
    ["please include the dress code policy as well", "add"],
    ["Actually use the dress code policy instead", "replace"],
    ["change the policy to Attendance", "replace"],
    ["swap the attendance policy for the cell phone one", "replace"],
    ["use the cell phone policy", "replace"],
    ["take the attendance policy off the form", "remove"],
    ["remove the attendance policy", "remove"],
  ] as const)("%s → %s", (question, mode) => {
    expect(readPolicyChange(question)).toBe(mode);
  });

  it.each([
    "what is the attendance policy?",
    "Does the cell phone policy apply here?",
    "I have independently verified and the policy is correct you may issue",
    "change it to a written warning",
    "",
  ])("%s → not a policy change", (question) => {
    expect(readPolicyChange(question)).toBeNull();
  });
});

describe("the manual's sections a turn names", () => {
  const named = (text: string) =>
    sectionsNamedIn({ text, chunks: CHUNKS, manualTitle: "2025 JBA Policy Manual - Edited 5-2025" }).map(
      (section) => `${section.heading} p${section.page}`,
    );

  it("finds a heading the manual prints, in the manager's own words", () => {
    expect(named("can you add late opening policy to the direct policy section of this form")).toEqual(["Late Opening p15"]);
    expect(named("ADD THE CELL PHONE USAGE POLICY")).toEqual(["Cell Phone Usage p32"]);
  });

  it("finds the section an offense box points at, by the policy's everyday name", () => {
    expect(named("use the dress code policy instead")).toEqual(["Dress Code for The Company p15"]);
    expect(named("add the standards of conduct policy")).toEqual(["Standards of Conduct p12"]);
  });

  it("reads a policy named the way managers name them, as a first draft does", () => {
    expect(named("add the visitors at work policy")).toEqual(["Visitors in the Workplace p30"]);
    expect(named("use the cell phone policy instead")).toEqual(["Cell Phone Usage p32"]);
  });

  it("cites nothing where the manager's words fit two sections, or none", () => {
    expect(named("add the workplace policy")).toEqual([]);
    expect(named("add the moon landing policy")).toEqual([]);
    expect(unresolvedPolicyName("add the moon landing policy")).toBe("moon landing");
    expect(unresolvedPolicyName("the policy is correct")).toBeNull();
  });

  it("never reads the manual's own title as a section", () => {
    expect(policyPhrasesIn("add the jba policy", "2025 JBA Policy Manual - Edited 5-2025")).toEqual([]);
    expect(named("add the JBA policy manual to the form")).toEqual([]);
  });

  it("never reads 'policy', or the contents page, as a section", () => {
    const headings = manualSectionHeadings(CHUNKS);
    expect(headings).toContain("Late Opening");
    expect(headings).not.toContain("Table of Contents");
    expect(headingsNamedIn("add the policy to the policy section", headings)).toEqual([]);
  });

  it("offers the manual's own near names, never chooses one", () => {
    expect(similarHeadings("visitors hours", CHUNKS)).toEqual(["Visitors in the Workplace"]);
    expect(similarHeadings("moon landing", CHUNKS)).toEqual([]);
  });
});

describe("what the line cites after the change", () => {
  const section = (heading: string) => findManualSection(CHUNKS, [heading])!;
  const attendance = section("Attendance");
  const visitors = section("Visitors in the Workplace");
  const dress = section("Dress Code for The Company");

  it("adds after what is there, once", () => {
    expect(
      nextPolicySections({ mode: "add", current: [attendance], named: [visitors, attendance] }).map((s) => s.heading),
    ).toEqual(["Attendance", "Visitors in the Workplace"]);
  });

  it("replaces with only what was named", () => {
    expect(
      nextPolicySections({ mode: "replace", current: [attendance, visitors], named: [dress] }).map((s) => s.heading),
    ).toEqual(["Dress Code for The Company"]);
  });

  it("removes only what was named", () => {
    expect(
      nextPolicySections({ mode: "remove", current: [attendance, visitors], named: [visitors] }).map((s) => s.heading),
    ).toEqual(["Attendance"]);
  });
});

describe("the section Policy Violated names beside Violation of Company Policies", () => {
  it("is the cited section no other box covers, from verified manual provenance only", () => {
    const provenance = {
      verified: true,
      source: "official_policy_manual",
      sections: [{ locator: "Attendance" }, { locator: "Visitors in the Workplace" }],
    };
    expect(citedCompanyPolicy(provenance)).toBe("Visitors in the Workplace");
    expect(citedCompanyPolicy({ ...provenance, sections: [{ locator: "Attendance" }] })).toBeNull();
    expect(citedCompanyPolicy({ ...provenance, verified: false })).toBeNull();
    expect(citedCompanyPolicy(undefined)).toBeNull();
  });
});

describe("a policy title in capitals is not a person", () => {
  it("reads the employee, and not the policy's first word, as the person", () => {
    expect(
      extractEmployeeNames(
        "create corrective action for for Ellie Sendgraff for Late Opening from the policy manual. It is a verbal warning",
      ),
    ).toEqual(["Ellie Sendgraff"]);
    expect(extractEmployeeNames("CA for Dana Moss about Dress Code")).toEqual(["Dana Moss"]);
  });

  it("still reads a name with one ordinary word in it", () => {
    expect(extractEmployeeNames("coaching form for Grace Early")).toEqual(["Grace Early"]);
  });
});
