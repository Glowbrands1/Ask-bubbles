import { expect, vi } from "vitest";

import { WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * A SENTENCE ABOUT HER IS NEVER HER POSITION (QA's live Bubbles 17w test, 13 Nov 2026; POSITION_ANSWER_NOT_A_SENTENCE)
 * ============================================================================
 *
 * "create a CA for <A>, she was late on 11/3/26" for someone with no Woven position: the card asked for the position.
 * The manager's next turn, "she gets a verbal warning", became Position "She Gets A Verbal Warning" (the position
 * answer reader title-cased any short letters-only reply). Not CARD_CHECKED_AGAINST_WORDS: the same with it off.
 * The person is invented.
 */

const REPORT = "QA's live Bubbles 17w test (13 Nov 2026, main b9720947): \"she gets a verbal warning\" became the card's Position";
const FLAG = "POSITION_ANSWER_NOT_A_SENTENCE_ENABLED";
const NO_POSITION: DirectoryRow[] = [
  { id: "pn-1", firstName: "Marnie", lastName: "Holloway", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: null },
];

async function afterCard(t: ReplayContext, second: string) {
  vi.setSystemTime(new Date("2026-11-13T16:00:00Z"));
  t.directory(NO_POSITION);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  await thread.say("create a CA for Marnie Holloway, she was late on 11/3/26");
  const reply = await thread.say(second);
  return { reply, card: thread.proposal as Record<string, unknown> | null };
}

/*
 * QA's list. "she gets a verbal warning" is the live miss (open in production). The other two already stay out in
 * production (their digits and "$" are never read as a title); they guard the flag's own rule.
 */
const SENTENCES = [
  { said: "she gets a verbal warning", open: true },
  { said: "she had a verbal warning on 10/1", open: false },
  { said: "she owes $25", open: false },
] as const;

/* v2-Gate-Bubbles-3's probes on #889 (14 Nov 2026): still read with the flag on, and announced. */
const GATE_MISSES = [
  { said: "it's her second time", open: true },
  { said: "she's a team lead i think", open: true },
  { said: "she's in training", open: true },
  { said: "she's new", open: true },
] as const;

export const NOV13_POSITION_ANSWER_NOT_A_SENTENCE_CASES: ReplayCase[] = [
  ...SENTENCES.map(({ said, open }): ReplayCase => ({
    id: `nov13-position-answer-not-a-sentence-${said.replace(/[^a-z0-9]+/gi, "-").replace(/-+$/, "")}`,
    title: `"create a CA for Marnie Holloway, she was late on 11/3/26" (no Woven position) → "${said}": the card's Position is never that sentence`,
    report: REPORT,
    status: open ? { open: `the card's Position is the sentence ("${said}", title-cased)` } : "fixed",
    fixFlags: [FLAG],
    async run(t) {
      const { reply, card } = await afterCard(t, said);
      const role = String(card?.employeeRole ?? "");
      expect(role.toLowerCase(), `the Position is the manager's sentence:\n${reply.content}`).not.toBe(said.toLowerCase());
      expect(role, `the Position names a level, step or payment:\n${reply.content}`).not.toMatch(/warning|owes|\$/i);
    },
  })),
  {
    id: "nov13-position-answer-not-a-sentence-title-still-read",
    title: "the same card, then \"Team Member Part Time\": a real title answer is still the card's Position",
    report: REPORT,
    status: "fixed",
    fixFlags: [FLAG],
    async run(t) {
      const { reply, card } = await afterCard(t, "Team Member Part Time");
      // The roster's own title reader keeps "Team Member" from "Team Member Part Time", as on main.
      expect(String(card?.employeeRole ?? ""), reply.content).toMatch(/^Team Member/);
    },
  },
  {
    id: "nov14-position-answer-she-is-a-barista",
    title: "v2-Gate-Bubbles-3's R889: the same card, then \"she is a barista\": a title the role words do not know is still the Position",
    report: `${REPORT} (v2-Gate-Bubbles-3, R889, 14 Nov 2026: "she is a barista" no longer set the Position with the flag on)`,
    status: "fixed",
    fixFlags: [FLAG],
    async run(t) {
      const { reply, card } = await afterCard(t, "she is a barista");
      expect(String(card?.employeeRole ?? ""), reply.content).toBe("Barista");
    },
  },
  {
    id: "nov13-position-answer-key-holder-said",
    title: "QA's 17w report: the same card, then \"she's a key holder\": the Position is Key Holder, and the reply says so",
    report: `${REPORT} (follow-up: the Position changed and the reply said only "got it, here's the card")`,
    status: { open: "the Position is Key Holder and the reply does not say so" },
    fixFlags: [FLAG],
    async run(t) {
      const { reply, card } = await afterCard(t, "she's a key holder");
      expect(String(card?.employeeRole ?? ""), reply.content).toBe("Key Holder");
      expect(reply.content, `the reply never says the Position changed:\n${reply.content}`).toMatch(/Job title set to \*\*Key Holder\*\*/);
    },
  },
  /*
   * QA's 17x "create corrective action form for <A>, Team Member Part Time" (the title on the request dropped as another
   * person's name) moved to Coding-4's #884, REQUEST_LINE_TITLE_KEPT, which owns title-of-another-person.ts and carries
   * that case (QA's ruling on #889, 14 Nov 2026). This flag no longer touches it.
   */
  ...GATE_MISSES.map(({ said, open }): ReplayCase => ({
    id: `nov14-position-answer-gate-miss-${said.replace(/[^a-z0-9]+/gi, "-").replace(/-+$/, "")}`,
    title: `v2-Gate-Bubbles-3's probe: the same card → "${said}": the Position is never set from it, and nothing is announced`,
    report: "v2-Gate-Bubbles-3's probes on #889 (14 Nov 2026): read OFF and ON, and announced ON (\"Job title set to …\")",
    status: open ? { open: `the card's Position is "${said}", title-cased` } : "fixed",
    fixFlags: [FLAG],
    async run(t) {
      const { reply, card } = await afterCard(t, said);
      const role = String(card?.employeeRole ?? "");
      expect(role.toLowerCase(), `the Position is the manager's words:\n${reply.content}`).not.toBe(said.toLowerCase().replace(/^(?:she['’]s|she is)\s+(?:a\s+)?/, ""));
      expect(role, `a non-title on the card:\n${reply.content}`).not.toMatch(/second|think|training|new/i);
      expect(reply.content, "a non-title announced").not.toMatch(/Job title set to/);
    },
  })),

];
