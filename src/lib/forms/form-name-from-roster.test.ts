import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyGroundedProposal, prepareGroundedQuestion, type GroundedPerson } from "@/lib/ai/grounded-entities";
import type { AskResponse } from "@/lib/ai/types";
import { formNameFromRosterEnabled } from "@/lib/config/chat-quality-flags";

import { namesSomebody } from "./answer-not-a-name";
import { installPersonRoster } from "./person-guard";
import { readEmployeeMentions } from "./proposal";
import { couldBeOnRoster, installRosterAnchor, rosterShaped } from "./roster-shape";

/**
 * ============================================================================
 * FORM_NAME_FROM_ROSTER_ENABLED (step 5, first piece) — sf-s19, "metrics read
 * as people". Pau, 4 Nov 2026
 * ============================================================================
 *
 * "I need a corrective action verbal for <name>. This is for Under Performance
 * on PPTA, LPSVA, Club Average, Club Close %, and Spa %."
 *
 * Production: the reply said "I couldn't find **Club Close** or **Under** in
 * the Woven roster", and both were stripped from the question, so the policy
 * reader never saw "Under Performance" and the card cited no policy. Every
 * person here is invented (the repository is public).
 */

const say = (name: string) =>
  `I need a corrective action verbal for ${name}. This is for Under Performance on PPTA, LPSVA, Club Average, Club Close %, and Spa %.`;

const person = (id: string, firstName: string, lastName: string, preferredFirstName: string | null = null): GroundedPerson => ({
  id,
  firstName,
  lastName,
  preferredFirstName,
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
  title: "Team Member Part Time",
  primaryLocationName: null,
});

const PEOPLE: readonly GroundedPerson[] = [
  person("e-perpetua", "Perpetua", "Thornquist"),
  person("e-leocadia", "Leocadia", "Wexcombe"),
  person("e-ismay", "Ismay", "Cradock", "Izzy"),
];
const NAMES = PEOPLE.map((row) => `${row.preferredFirstName ?? row.firstName} ${row.lastName}`);

const FLAGS = ["FORM_NAME_FROM_ROSTER_ENABLED", "CA_SALES_POLICY_ENABLED", "PERSON_GUARD_ENABLED", "ANTI_LOOP_ENABLED", "TYPED_NAME_ENABLED"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const flag of FLAGS) saved[flag] = process.env[flag];
  // Production's path: GROUNDED_ENTITIES on, ANTI_LOOP off.
  delete process.env.ANTI_LOOP_ENABLED;
  delete process.env.TYPED_NAME_ENABLED;
  delete process.env.FORM_NAME_FROM_ROSTER_ENABLED;
  delete process.env.CA_SALES_POLICY_ENABLED;
});
afterEach(() => {
  for (const flag of FLAGS) {
    if (saved[flag] === undefined) delete process.env[flag];
    else process.env[flag] = saved[flag];
  }
  installPersonRoster(() => undefined);
  installRosterAnchor(() => undefined);
});

const on = () => {
  process.env.FORM_NAME_FROM_ROSTER_ENABLED = "true";
  process.env.CA_SALES_POLICY_ENABLED = "true";
};

function prep(question: string) {
  return prepareGroundedQuestion({ question, history: [], people: PEOPLE, saved: null });
}

function reply(question: string, employeeName: string | null) {
  const prepared = prep(question);
  const response = {
    content: "I'll draft a **Corrective Action Form**.",
    formProposal: { templateKey: "dpoa", employeeName, status: "ready", locationId: "loc-264", locationResolution: "resolved" },
  } as unknown as AskResponse;
  return applyGroundedProposal(response, { people: PEOPLE, prep: prepared, rosterEmpty: false });
}

describe("the flag", () => {
  it("needs CA_SALES_POLICY_ENABLED: alone, the grounding step is as on main", () => {
    process.env.FORM_NAME_FROM_ROSTER_ENABLED = "true";
    expect(formNameFromRosterEnabled()).toBe(false);
    expect(prep(say("Perpetua Thornquist")).unmatched).toEqual(expect.arrayContaining(["Club Close", "Under"]));
    on();
    expect(formNameFromRosterEnabled()).toBe(true);
  });
});

describe("rosterShaped: roster data only", () => {
  it("2+ words: the first word is somebody's first or preferred name", () => {
    expect(rosterShaped("Perpetua Thornqist", PEOPLE)).toBe(true);
    expect(rosterShaped("Izzy Cradock", PEOPLE)).toBe(true);
    expect(rosterShaped("Ismay Cradok", PEOPLE)).toBe(true);
    expect(rosterShaped("Club Close", PEOPLE)).toBe(false);
    expect(rosterShaped("Zuleika Brightwell", PEOPLE)).toBe(false);
  });

  it("one word: somebody's first, preferred or last name", () => {
    expect(rosterShaped("Perpetua", PEOPLE)).toBe(true);
    expect(rosterShaped("Thornquist", PEOPLE)).toBe(true);
    expect(rosterShaped("Izzy", PEOPLE)).toBe(true);
    expect(rosterShaped("Under", PEOPLE)).toBe(false);
  });

  it("couldBeOnRoster also takes a close match of a whole name", () => {
    expect(couldBeOnRoster("Leocadja Wexcombe", NAMES)).toBe(true);
    expect(couldBeOnRoster("Club Close", NAMES)).toBe(false);
    expect(couldBeOnRoster("Under", NAMES)).toBe(false);
    expect(couldBeOnRoster("Club Close", [])).toBe(true);
  });
});

describe("the grounding step, Pau's exact message", () => {
  it("off (main): Club Close and Under are stripped and announced — the production bug", () => {
    const prepared = prep(say("Perpetua Thornquist"));
    expect(prepared.unmatched).toEqual(expect.arrayContaining(["Club Close", "Under"]));
    expect(prepared.question).not.toMatch(/Under Performance/);
    const content = reply(say("Perpetua Thornquist"), "Perpetua Thornquist").content;
    expect(content).toMatch(/couldn't find .*\*\*Club Close\*\*.* in the Woven roster/);
    expect(content).toMatch(/couldn't find .*\*\*Under\*\*.* in the Woven roster/);
  });

  it("on: nothing stripped, nothing announced, the employee kept", () => {
    on();
    const prepared = prep(say("Perpetua Thornquist"));
    expect(prepared.unmatched).toEqual([]);
    expect(prepared.question).toMatch(/for Under Performance on PPTA, LPSVA, Club Average, Club Close %, and Spa %/);
    expect(prepared.employeeId).toBe("e-perpetua");
    const answer = reply(say("Perpetua Thornquist"), "Perpetua Thornquist");
    expect(answer.content).not.toMatch(/couldn't find/);
    expect(answer.formProposal?.employeeName).toBe("Perpetua Thornquist");
  });

  it("on: a card that took \"Under\" or \"Club Close\" is not given a roster note", () => {
    on();
    expect(reply(say("Perpetua Thornquist"), "Perpetua Thornquist").content).not.toMatch(/\*\*(?:Under|Club Close)\*\*/);
  });

  it("on, negative control: a typo of a roster person still goes to the close-match path", () => {
    on();
    process.env.TYPED_NAME_ENABLED = "true";
    const answer = reply(say("Leocadia Wexcomb"), "Leocadia Wexcomb");
    expect(answer.content).not.toMatch(/couldn't find/);
    expect(answer.formProposal?.closeMatchNote).toBe("Woven has Leocadia Wexcombe");
  });

  it("on, negative control: a typo with the first name on the roster and a wrong surname is still announced", () => {
    on();
    expect(prep(say("Leocadia Marlwoe Ostrander")).unmatched).toContain("Leocadia Marlwoe Ostrander");
  });

  it("off, negative control: a full name nobody on the roster shares is announced as before", () => {
    expect(prep(say("Zuleika Brightwell")).unmatched).toContain("Zuleika Brightwell");
  });

  /*
   * THE MIDDLE GROUND (QA, 4 Nov 2026). A nobody-shaped candidate is set aside
   * only beside somebody on the roster. "Zuleika Brightwell" typed alone names
   * nobody on the roster, so the message is read as before: she is said back
   * as not on the roster, and asking again says it again (no silent loop).
   */
  it("on: a full name nobody on the roster shares, typed alone, is announced as before", () => {
    on();
    const prepared = prep(say("Zuleika Brightwell"));
    expect(prepared.unmatched).toContain("Zuleika Brightwell");
    expect(prepared.rosterAnchored).toBeUndefined();
    const answer = reply(say("Zuleika Brightwell"), null);
    expect(answer.content).toMatch(/couldn't find .*\*\*Zuleika Brightwell\*\*/);
  });

  it("on: Pau's message names somebody on the roster, so the metrics are set aside", () => {
    on();
    expect(prep(say("Perpetua Thornquist")).rosterAnchored).toBe(true);
    expect(prep(say("Leocadia Wexcomb")).rosterAnchored).toBe(true);
  });

  /*
   * WHAT IS STILL OPEN, PINNED SO NOBODY IS SURPRISED. Metric words with no
   * roster name beside them: nothing anchors the message, so it is read as
   * before, flag on or off. Here the name reader takes "under" (from "for
   * under performance") for a person and the reply says "I couldn't find
   * **under** in the Woven roster"; "Club Close" is not a candidate in this
   * wording. Put to Pau, 4 Nov 2026.
   */
  it("on: metrics with no roster name are read as before — \"under\" is still announced", () => {
    const question = "CA for under performance on Club Close % and Spa %";
    const off = prep(question);
    const offReply = reply(question, null).content;
    on();
    const prepared = prep(question);
    expect(prepared.rosterAnchored).toBeUndefined();
    expect(prepared).toEqual(off);
    expect(prepared.unmatched).toEqual(["under"]);
    const content = reply(question, null).content;
    expect(content).toBe(offReply);
    expect(content).toMatch(/couldn't find \*\*under\*\* in the Woven roster/);
  });
});

describe("the name reader, with the person guard's roster", () => {
  beforeEach(() => {
    process.env.PERSON_GUARD_ENABLED = "true";
    installPersonRoster(() => NAMES);
  });

  it("off (main): Club Close and Under are read as names", () => {
    expect(namesSomebody("Club Close")).toBe(true);
    expect(namesSomebody("Under")).toBe(true);
    expect(readEmployeeMentions(say("Leocadia Wexcomb")).names).toEqual(expect.arrayContaining(["Club Close", "Under"]));
  });

  it("on, beside a roster name: only the employee is read, so a typo is still the one name", () => {
    on();
    installRosterAnchor(() => true);
    expect(namesSomebody("Club Close")).toBe(false);
    expect(namesSomebody("Under")).toBe(false);
    expect(namesSomebody("Leocadja Wexcombe")).toBe(true);
    expect(readEmployeeMentions(say("Leocadia Wexcomb")).names).toEqual(["Leocadia Wexcomb"]);
    expect(readEmployeeMentions(say("Perpetua Thornquist")).names).toEqual(["Perpetua Thornquist"]);
  });

  it("on, with no roster name in the message: every candidate is kept", () => {
    on();
    installRosterAnchor(() => false);
    expect(namesSomebody("Club Close")).toBe(true);
    expect(readEmployeeMentions(say("Zuleika Brightwell")).names).toEqual(expect.arrayContaining(["Zuleika Brightwell", "Club Close", "Under"]));
  });

  it("on, with no roster: every candidate is kept", () => {
    on();
    installRosterAnchor(() => true);
    installPersonRoster(() => undefined);
    expect(namesSomebody("Club Close")).toBe(true);
  });
});
