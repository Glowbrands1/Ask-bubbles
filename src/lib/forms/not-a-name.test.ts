import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readEmployeeMentions } from "./proposal";
import { isNotAName, maskNotANameText, saidInReply } from "./not-a-name";
import { keepTypedPerson } from "./typed-name";

/**
 * The readers behind Ask Sunny's QA round 4 (24 Oct 2026), ported, with
 * NOT_A_NAME_GUARD_ENABLED. This app's stores and brand are the data. The
 * conversation replays are `src/lib/ai/not-a-name-oct24.test.ts`.
 */

/** JBA Policy Manual headings this app already cites. */
const HEADINGS = [
  "Core Values",
  "Wet Floor Sign",
  "Workplace Violence Prevention",
  "Background Checks",
  "Visitors in the Workplace",
  "Incident Reporting",
  "Business Ethics",
  "Problem Resolution",
];

describe("NOT_A_NAME_GUARD_ENABLED off", () => {
  it("changes nothing", () => {
    expect(isNotAName("blank")).toBe(false);
    expect(maskNotANameText("Policy reference: Core Values, JBA Policy Manual p.4.")).toBe(
      "Policy reference: Core Values, JBA Policy Manual p.4.",
    );
  });
});

describe("NOT_A_NAME_GUARD_ENABLED on", () => {
  beforeEach(() => {
    vi.stubEnv("NOT_A_NAME_GUARD_ENABLED", "true");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    "blank",
    "Blank",
    "n/a",
    "unknown",
    "If Possible",
    "require practice",
    "soap",
    "soaps",
    "Buff Soaps",
    "bellevue",
    "Kearney",
    "Grand Island",
    "Sioux Falls",
    "West Dodge Rd",
    "Cash Count Sheet",
    "Waiver Agreements",
    "team",
  ])("%s is not a name", (candidate) => {
    expect(isNotAName(candidate)).toBe(true);
  });

  it.each(["Test Testy", "Test Employee", "Jordan Testperson", "Will Turner", "Mark Grant", "Kearney Smith"])(
    "%s is still a name",
    (candidate) => {
      expect(isNotAName(candidate)).toBe(false);
    },
  );

  it("the app's own state lines are not read for a person", () => {
    const strays: string[] = [];
    for (const heading of HEADINGS) {
      for (const lead of ["The employee is Jordan Testperson. ", ""]) {
        const question = `The form is the Coaching Form.\n${lead}Job title: Soap Maker. It happened at Kearney, NE. It happened on 9/29/2026. Policy reference: ${heading}, JBA Policy Manual p.20.\ncreate a coaching form for test testy`;
        const names = readEmployeeMentions(question).names.filter((name) => !/^(?:jordan testperson|test testy)$/i.test(name));
        if (names.length > 0) strays.push(`${heading} → ${names.join(", ")}`);
      }
    }
    expect(strays).toEqual([]);
  });

  it("a priced, bulleted offer list names nobody", () => {
    const offers =
      "Timeline: October 1 – October 31\nOffers: \n• $5 Mini Bars\n• Eight Mini Bars for $35\n• Holiday Gift Box: KIT Winter Bundle for $79.99 ($64.98 Savings + $6 Bonus)\n➢ BOT Winter Body Wash\n➢ BOT Winter Hand Cream\n➢ BOT Winter Face Serum\n➢ Five Makery Passes";
    expect(readEmployeeMentions(offers).names).toEqual([]);
  });

  it("a store number after the name is not a place before it", () => {
    expect(readEmployeeMentions("coaching form for Jane Doe store 66").names).toEqual(["Jane Doe"]);
  });

  it("a name beside a dollar amount is still read", () => {
    expect(readEmployeeMentions("CA for Jordan Testperson, payroll deduct $25").names).toEqual(["Jordan Testperson"]);
  });

  it('"for bellevue location" is the store; the employee in the same sentence stays', () => {
    const turn =
      "create a coaching form for bellevue location soap maker, test testy, who was talking on her cell phone for 25 minutes on 9-29-26 when guests were waiting to check out";
    expect(readEmployeeMentions(turn).names.map((name) => name.toLowerCase())).not.toContain("bellevue");
  });

  it('"for soaps and retail" names nobody', () => {
    expect(readEmployeeMentions("Can you create a coaching form for soaps and retail").names).toEqual([]);
  });

  it('"1. employee name is blank" names nobody', () => {
    expect(readEmployeeMentions("1. employee name is blank\n2. knowledge on october promotions").names).toEqual([]);
  });

  it("a list of only non-names is nobody, not a question", () => {
    expect(keepTypedPerson({ kind: "ambiguous", candidates: ["Buff Soaps", "Bellevue"] })).toEqual({ kind: "missing" });
    expect(keepTypedPerson({ kind: "resolved", employeeName: "Blank" })).toEqual({ kind: "missing" });
    expect(keepTypedPerson({ kind: "ambiguous", candidates: ["Test Testy", "Bellevue"] })).toEqual({
      kind: "resolved",
      employeeName: "Test Testy",
    });
  });
});

describe("saidInReply", () => {
  it("finds a name a reply cites, not one a card names as its subject", () => {
    expect(saidInReply(['Treat every guest with respect ("Core Values", JBA Policy Manual p.4).'], "Core Values")).toBe(true);
    expect(saidInReply(["**Employee:** Avery Testperson\n\nWho is this for? It is for **Avery Testperson**."], "Avery Testperson")).toBe(false);
    expect(saidInReply(["Nothing about anyone here."], "Avery Testperson")).toBe(false);
  });
});
