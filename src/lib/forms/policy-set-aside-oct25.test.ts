import { afterEach, describe, expect, it, vi } from "vitest";

import rows from "@/test/fixtures/jba-manual-production-151.json";
import { accountManualSections } from "@/lib/ai/account-manual-sections";
import { citedSections } from "@/lib/ai/violation-policy";
import { manualChunkFromRow, type ManualChunkRow } from "@/lib/knowledge/full-manual-load";

import { JOIN } from "./bounded-context";
import { policiesSetAside } from "./ca-policy";
import { findManualSection, type ManualChunk } from "./official-policy-manual";
import { nextPolicySections, readPolicyChange, sectionsNamedIn } from "./policy-change";

/**
 * ============================================================================
 * A POLICY THE MANAGER SET ASIDE LEAVES THE CARD (POLICY_SET_ASIDE_ENABLED)
 * ============================================================================
 *
 * QA F1/M3, 25 Oct 2026, the managers' exact turns (employee name invented):
 *
 *   conv_mvoflsoo26q7iig  "not attendance, late opening", then "no no late
 *                         opening policy only" — the card still printed
 *                         "Attendance Policy, JBA Policy Manual p.14" beside
 *                         Late Opening p.15 on every turn.
 *   conv_mvog7n9i2y26f1i  "the policy violated is late opening, not attendance"
 *   conv_mvoes60b2e1ae1b  "can you reference the late opening policy INSTEAD
 *                         of the attendance policy"
 *
 * Never a third policy; a pasted policy paragraph adds no Guidelines p.22.
 * Each case fails with the flag off and passes with it on.
 */

const CHUNKS: readonly ManualChunk[] = (rows.chunks as ManualChunkRow[]).map((row) => {
  const chunk = manualChunkFromRow(row);
  return { ...chunk, page: chunk.page ?? null, locator: chunk.locator ?? undefined };
});
const FIRST = "ca for Tobin Arle at the store opened the store late 9-28-26 verbal ca was given 9-1-26 make it written";

const CORRECTIONS: readonly (readonly string[])[] = [
  ["not attendance, late opening"],
  ["not attendance, late opening", "no no late opening policy only"],
  ["no no late opening policy only"],
  ["Tobin is a store associate not a district manager. the policy violated is late opening, not attendance"],
  ["can you reference the late opening policy INSTEAD of the attendance policy"],
];

afterEach(() => vi.unstubAllEnvs());
const on = () => vi.stubEnv("POLICY_SET_ASIDE_ENABLED", "true");
const notesOf = (turns: readonly string[]) => [FIRST, ...turns].join(JOIN);
const card = (notes: string) => citedSections(notes.split(JOIN), CHUNKS).map((entry) => `${entry.section} p.${entry.page}`);
const headings = (sections: readonly { heading: string; page: number }[]) => sections.map((s) => `${s.heading} p.${s.page}`);

describe("flag off: the set-aside Attendance stays on the card (the bug)", () => {
  // A bare "late opening policy only" already cites Late Opening alone here.
  it.each(CORRECTIONS.filter((turns) => turns.some((turn) => /attendance/.test(turn))))("%s", (...turns) => {
    expect(headings(accountManualSections(notesOf(turns), CHUNKS))).toContain("Attendance p.14");
  });
});

describe("flag on: only Late Opening is cited", () => {
  it.each(CORRECTIONS)("%s", (...turns) => {
    on();
    const notes = notesOf(turns);
    const sections = headings(accountManualSections(notes, CHUNKS));
    expect(sections).toContain("Late Opening p.15");
    expect(sections).not.toContain("Attendance p.14");
    // The card: Late Opening alone, no third policy.
    expect(card(notes)).toEqual(["Late Opening p.15"]);
  });

  it("each correction, typed with the form open, replaces with Late Opening alone", () => {
    on();
    const current = [findManualSection(CHUNKS, ["Late Opening"])!, findManualSection(CHUNKS, ["Attendance"])!];
    for (const [turn] of CORRECTIONS as readonly [string][]) {
      const mode = readPolicyChange(turn);
      expect(mode, turn).not.toBeNull();
      const next = nextPolicySections({ mode: mode!, current, named: sectionsNamedIn({ text: turn, chunks: CHUNKS }) });
      expect(headings(next), turn).toEqual(["Late Opening p.15"]);
    }
  });

  it("a policy set aside and then named again is back", () => {
    on();
    expect(policiesSetAside(["not attendance, late opening", "add the attendance policy too"].join(JOIN)).setAside).toEqual([]);
  });
});

describe("a pasted policy paragraph adds no policy the manager did not name", () => {
  const PASTED =
    "use this policy: Late Opening When an employee assigned to open a location is unable to open the location at the proper time, the employee must notify the manager as soon as possible. The employee who failed to open will then be required to reimburse The Company $25.00 via payroll deduction (when applicable and following all state and local guidelines), for all expenses incurred.";

  it("flag off: Guidelines p.22 was added (the bug)", () => {
    expect(headings(sectionsNamedIn({ text: PASTED, chunks: CHUNKS }))).toContain("Guidelines p.22");
  });

  it("flag on: Late Opening alone", () => {
    on();
    expect(headings(sectionsNamedIn({ text: PASTED, chunks: CHUNKS }))).toEqual(["Late Opening p.15"]);
  });
});

describe("flag on: what is not a correction", () => {
  it("a late opening with no correction keeps today's sections", () => {
    on();
    expect(headings(accountManualSections(FIRST, CHUNKS))).toEqual(
      (vi.unstubAllEnvs(), headings(accountManualSections(FIRST, CHUNKS))),
    );
  });

  it('"add dress code" with a draft open still keeps both', () => {
    on();
    const current = [findManualSection(CHUNKS, ["Late Opening"])!];
    const next = nextPolicySections({ mode: "add", current, named: sectionsNamedIn({ text: "add the dress code policy", chunks: CHUNKS }) });
    expect(headings(next)).toEqual(["Late Opening p.15", "Dress Code for The Company p.15"]);
  });
});

/* HOW MANAGERS TYPE (Pau, 26 Oct 2026): the same reading in all lowercase and in sentence case. */
const lower = (text: string) => text.toLowerCase();
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

describe("flag on: every register reads the same", () => {
  it.each(CORRECTIONS.flatMap((turns) => [turns.map(lower), turns.map(sentence)]))("%s", (...turns) => {
    on();
    const sections = headings(accountManualSections(notesOf(turns), CHUNKS));
    expect(sections).toContain("Late Opening p.15");
    expect(sections).not.toContain("Attendance p.14");
  });

  it.each(["late opening not attendance", "Late opening not attendance", "not standards of conduct, its attendance"])("terse: %s", (turn) => {
    on();
    const aside = policiesSetAside(turn);
    expect(aside.setAside.length).toBeGreaterThan(0);
  });
});

/*
 * QA batch 11, 25 Oct 2026 (reported in the sibling app, name invented): "not
 * standards of conduct, its attendance" after a missed Woven deadline must cite
 * Attendance alone, never Standards of Conduct beside it.
 */
describe("batch 11: \"not standards of conduct, its attendance\" replaces", () => {
  const TURNS = [
    "write ca for nell tarrant at the store missed the woven deadline 10-15-26",
    "verbal",
    "no payroll",
    "not standards of conduct, its attendance",
  ];

  it.each([TURNS, TURNS.map(sentence)])("flag on: Attendance p.14 only (%s)", (...turns) => {
    on();
    expect(card(turns.join(JOIN))).toEqual(["Attendance p.14"]);
  });
});
