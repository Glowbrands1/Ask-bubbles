import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { slotClause } from "./form-full-remap";
import { incidentClauses, incidentOnlyText, incidentSentences } from "./incident-clauses";
import { requestIncident } from "./remap-incident";

/**
 * INCIDENT_CLAUSE_SPLIT_ENABLED (QA, 26 Oct 2026; production chats in both
 * apps). The card's Issue was a fragment of the turn: cut at the comma of
 * "dodge, ne", an employee fact or a policy instruction typed last, or a
 * pasted policy paragraph. The managers' wording is kept; the names are
 * invented. This app's Issue comes from the remap reader (FORM_FULL_REMAP).
 *
 * Every wording runs all lowercase and in sentence case (first letter
 * capitalised, names lowercase or Capitalised): the app must read both the
 * same.
 */

const remap = (text: string, employeeName: string) => requestIncident({ text, employeeName, slotClause });

function cased(text: string, names: readonly string[]): string[] {
  const sentence = text.charAt(0).toUpperCase() + text.slice(1);
  let named = sentence;
  for (const name of names) {
    const capital = name.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
    named = named.split(name).join(capital);
  }
  return [...new Set([text.toLowerCase(), sentence, named])];
}

const DEVON =
  "please create a corrective action form for devon harlan, she works at our dodge, ne store as a team member and was late today.";
const MARLO =
  "create a ca for marlo fenwick. she is the store director at our kearney, ne. she did not do the 10 minute disinfect on 9/25/26";
const TESSA = "ca for tessa quill, primary store is dodge. tessa skipped the 10 minute disinfect today";
const TENURE = "create a written ca for jory pell for late opening on 10-21-26. employee for 7 months";
const CITE = "create a written ca for jory pell for late opening on 10-21-26. and cite the standards of conduct as the policy violated";
const NOT_ATTENDANCE =
  "create a written ca for jory pell, opened the store 20 minutes late on 10-21-26. the policy violated is late opening, not attendance";
const PASTED = [
  "create a ca for jory pell, she opened 30 minutes late today",
  "Issue: The employee who failed to open will then be required to reimburse The Company $25",
];
const TWO_PEOPLE =
  "create a ca for nell ostrow. the store director went over the policy acknowledgements with nell on 10-02-26. nell did not acknowledge the policies in woven by 10-09-26";

describe("INCIDENT_CLAUSE_SPLIT_ENABLED on", () => {
  beforeEach(() => vi.stubEnv("INCIDENT_CLAUSE_SPLIT_ENABLED", "true"));
  afterEach(() => vi.unstubAllEnvs());

  it("keeps \"dodge, ne\" in one clause and drops the employee facts before the incident", () => {
    for (const text of cased(DEVON, ["devon harlan"])) expect(remap(text, "devon harlan")).toBe("late today");
  });

  it("a title at a store is not the incident; the missed disinfect is", () => {
    for (const text of cased(MARLO, ["marlo fenwick"])) {
      expect(remap(text, "marlo fenwick")).toBe("did not do the 10 minute disinfect");
    }
  });

  it("\"primary store is dodge\" is the store, never the Issue", () => {
    for (const text of cased(TESSA, ["tessa quill", "tessa"])) {
      expect(remap(text, "tessa quill")).toBe("skipped the 10 minute disinfect today");
    }
  });

  it("tenure typed last does not overwrite the incident", () => {
    for (const text of cased(TENURE, ["jory pell"])) expect(remap(text, "jory pell")).toBe("late opening");
  });

  it("a policy instruction typed last does not overwrite the incident", () => {
    for (const text of [...cased(CITE, ["jory pell"]), ...cased(NOT_ATTENDANCE, ["jory pell"])]) {
      expect(remap(text, "jory pell")).toMatch(/^(?:late opening|opened the store 20 minutes late)$/i);
    }
  });

  it("a pasted policy paragraph never replaces the incident", () => {
    for (const first of cased(PASTED[0]!, ["jory pell"])) {
      expect(remap([first, PASTED[1]!].join("\n"), "jory pell")).toBe("opened 30 minutes late today");
    }
  });

  it("a fragment follow-up turn (an employee fact) keeps the incident already given", () => {
    const turns = [cased(TENURE, ["jory pell"])[0]!, "employee for 7 months", "the location is dodge"];
    expect(remap(turns.join("\n"), "jory pell")).toBe("late opening");
  });

  it("a story that names two people keeps the incident whole", () => {
    for (const text of cased(TWO_PEOPLE, ["nell ostrow", "nell"])) {
      const read = (remap(text, "nell ostrow") ?? "").toLowerCase();
      expect(read).toContain("went over the policy acknowledgements");
      expect(read).toContain("did not acknowledge the policies in woven");
    }
  });
});

describe("the clause splitter", () => {
  it("keeps a place and its state, a date, an amount and an abbreviation in one clause", () => {
    expect(incidentClauses("she works at our dodge, ne store, and was late")).toEqual([
      "she works at our dodge ne store",
      "and was late",
    ]);
    expect(incidentClauses("empire, sd")).toEqual(["empire sd"]);
    expect(incidentSentences("she was short $3.25 on 9/25/26. she left at 3 p.m. on friday")).toEqual([
      "she was short $3.25 on 9/25/26",
      "she left at 3 p.m. on friday",
    ]);
    expect(incidentSentences("she was late to the st. joe store")).toEqual(["she was late to the st. joe store"]);
  });

  it("a state code that is also a word splits as before", () => {
    expect(incidentClauses("she was late, in the back room, on her phone")).toEqual([
      "she was late",
      "in the back room",
      "on her phone",
    ]);
  });

  it("an account that says \"the employee who\" without a rule word stays", () => {
    expect(incidentOnlyText("the employee who was scheduled did not show", null)).toBe(
      "the employee who was scheduled did not show",
    );
  });
});

describe("INCIDENT_CLAUSE_SPLIT_ENABLED off", () => {
  beforeEach(() => vi.stubEnv("INCIDENT_CLAUSE_SPLIT_ENABLED", ""));
  afterEach(() => vi.unstubAllEnvs());

  it("the reader sees the turn as typed (the reported fragments)", () => {
    expect(remap(DEVON, "devon harlan")).toBe("ne store as a team member and was late today");
    expect(remap(TENURE, "jory pell")).toBe("employee for 7 months");
    expect(remap(PASTED.join("\n"), "jory pell")).toBe(PASTED[1]);
  });
});
