import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { failureToOpenPeople } from "./nov10-failure-to-open-cases";
import { REFUSAL_ROSTER } from "./nov7-step-b-refusals-scenarios";

/**
 * ============================================================================
 * QA'S LIVE BUBBLES ROUND 17b (10 Nov 2026, main 145fef8f): THREE GAPS
 * ============================================================================
 *
 * 1. P16 (FAILURE_TO_OPEN_IS_LATE_OPENING, live 22:32Z): "Can you make a CA for <name> for failure to open on time?"
 *    cites Late Opening p.15 with the right plan, but the card's "Issue:" is empty. The edit rules read the whole
 *    question as an instruction to the app and emptied the account. REQUEST_ISSUE_KEPT_ENABLED.
 * 2. Item 4 (22:32:58Z): "did not show up for a scheduled opening shift" became Late Opening, and the card quoted
 *    "opening late", which the manager never said. The quote is the manager's own words. LATE_OPENING_OWN_WORDS_ENABLED.
 *    (Whether a no-show to an opening shift is a Late Opening is the P16 ruling's to say; it is not changed here.)
 * 3. DRAFT_WRITE_NEVER_SILENT: "The draft left out <surname> in Details of Coaching" while Details used the first
 *    name. FIRST_NAME_ENOUGH_ENABLED.
 *
 * The people are invented (Corisande Pell, Ottoline Ormsworth).
 */
const REPORT = "QA's live Bubbles round 17b (10 Nov 2026)";

function asManager(t: ReplayContext, roster: readonly Parameters<ReplayContext["directory"]>[0][number][]) {
  vi.setSystemTime(new Date("2026-11-10T22:30:00Z"));
  t.directory([...roster]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

/** The words inside the card's 'from what you described ("…")', or null. */
const quoted = (content: string) => /from what you described \("([^"]+)"\)/.exec(content)?.[1] ?? null;
const issueLine = (content: string) => /\*\*Issue:\*\*([^·\n]*)/.exec(content)?.[1]?.trim() ?? null;

const P16 = "Can you make a CA for Corisande Pell for failure to open on time?";
const OPENING_SHIFT = "Can you make a CA for Corisande Pell, she did not show up for a scheduled opening shift";
/** QA's Gate-Bubbles-2 (10 Nov 2026), nov6-reopen-write-up-still-creates turn 2: the "not" was dropped from the quote. */
const NOT_ON_TIME = "write up Corisande Pell for not opening the store on time on Tuesday";

export const NOV10_ROUND17B_GAPS_CASES: ReplayCase[] = [
  ...([
    ["as-typed", P16],
    ["lower", P16.toLowerCase()],
  ] as const).map(([casing, said]) => ({
    id: `nov10-r17b-p16-issue-${casing}`,
    title: `"${said}": the card's Issue carries the account`,
    report: `${REPORT}, gap 1 (P16)`,
    status: { open: "the card's Issue is empty" },
    fixFlags: ["REQUEST_ISSUE_KEPT_ENABLED"],
    async run(t: ReplayContext) {
      const thread = asManager(t, [...STAFF, ...failureToOpenPeople()]);
      const reply = await thread.say(said);
      expect(reply.content, "the card does not cite Late Opening").toMatch(/Late Opening/);
      expect(issueLine(reply.content), `the Issue is empty:\n${reply.content}`).toMatch(/failure to open on time/i);
    },
  })),
  ...([
    ["p16", P16],
    ["opening-shift", OPENING_SHIFT],
    ["not-on-time", NOT_ON_TIME],
  ] as const).map(([key, said]) => ({
    id: `nov10-r17b-late-opening-quote-${key}`,
    title: `"${said}": the Late Opening quote is the manager's own words`,
    report: `${REPORT}, gap 2 (item 4, 22:32:58Z)`,
    status: { open: "the card quotes \"opening late\", which the manager never said" },
    fixFlags: ["LATE_OPENING_OWN_WORDS_ENABLED"],
    async run(t: ReplayContext) {
      const thread = asManager(t, [...STAFF, ...failureToOpenPeople()]);
      const reply = await thread.say(said);
      const words = quoted(reply.content);
      expect(words, `no quote:\n${reply.content}`).not.toBeNull();
      expect(said.toLowerCase(), `the card quotes words the manager never said:\n${reply.content}`).toContain(words!.toLowerCase());
      // Gate-Bubbles-2: a negation the manager typed is never dropped from the quote ("not opening the store on time").
      if (/\bnot\s+open/i.test(said)) expect(words, `the negation was dropped:\n${reply.content}`).toMatch(/^not\b/i);
    },
  })),
  {
    id: "nov10-r17b-first-name-enough",
    title: "Details names the employee by first name: the draft's note does not say the surname was left out",
    report: `${REPORT}, gap 3 (DRAFT_WRITE_NEVER_SILENT)`,
    status: { open: "\"The draft left out Ormsworth in Details of Coaching\"" },
    fixFlags: ["FIRST_NAME_ENOUGH_ENABLED"],
    async run(t: ReplayContext) {
      const thread = asManager(t, REFUSAL_ROSTER);
      const said = "create a coaching form for Ottoline Ormsworth, she missed the monthly meeting on 11/9/26";
      await thread.say(said);
      t.draftWrites({ coaching_details: "Observed:\nOttoline missed the monthly meeting on 11/9/26.\n\nExpectation:\nOttoline is expected to attend every scheduled meeting." });
      const id = await thread.create();
      t.draftWrites({ coaching_details: "Observed:\nOttoline missed the monthly meeting on 11/9/26.\n\nExpectation:\nOttoline is expected to attend every scheduled meeting." });
      const response = JSON.stringify(await t.redraft(id, said));
      expect(response, "the note says the surname was left out though Details names her").not.toMatch(/left out[^"]*Ormsworth/);
    },
  },
];
