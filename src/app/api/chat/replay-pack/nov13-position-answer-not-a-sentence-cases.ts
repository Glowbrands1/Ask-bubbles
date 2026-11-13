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
  {
    id: "nov13-position-answer-title-on-the-request-kept",
    title: "QA's 17w report: \"create corrective action form for Marnie Holloway, Team Member Part Time\" then the account: the title from the request stays the card's Position",
    report: `${REPORT} (follow-up: the Position stayed Not set, the title on line 1 lost)`,
    status: { open: "the Position is empty: \"Part Time\" was read as another person's name, so the title was dropped as theirs" },
    fixFlags: [FLAG],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-13T16:00:00Z"));
      t.directory(NO_POSITION);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("create corrective action form for Marnie Holloway, Team Member Part Time");
      const reply = await thread.say("she skipped the closing checklist on her shift last night");
      const card = thread.proposal as Record<string, unknown> | null;
      expect(String(card?.employeeRole ?? ""), `the title on the request is lost:\n${reply.content}`).toMatch(/^Team Member/);
    },
  },
];
