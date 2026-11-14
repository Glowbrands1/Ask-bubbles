import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayAnswer, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * A CORRECTIVE ACTION CARD WITH NO ACCOUNT ASKS WHAT HAPPENED, AND OFFERS NO CREATE WHILE IT ASKS
 * (CA_ASKS_WHAT_HAPPENED_ENABLED + WHAT_HAPPENED_NO_CREATE_ENABLED; ported from the sibling app at Pau's direction,
 * 13 Nov 2026)
 * ============================================================================
 *
 * The sibling app's #331 (QA P1 there: a request with only the person and a job title gave a card that asked nothing)
 * and its round-23 no-Create rule, both on in its production. The shapes are the sibling cases' (its
 * nov5-reason-given, nov6-bare-not-*, nov5-pau-sf-s26-s28, nov10-asks-what-happened-no-create), with this app's roster:
 *   - who and where only ("…for <name>, Team Member Part Time", "…, Assistant General Manager"): here the card took the
 *     title as its Issue and asked nothing; on, the title is no Issue and the card asks;
 *   - a name alone, a denial ("not late", "didn't do anything wrong"), a name after "Create a corrective action.":
 *     production already asks, but beside an active **Create draft** and "Create the draft here when you're ready";
 *     on, no Create while it asks;
 *   - an account (lateness, a duty not done, a sales shortfall, the account in an earlier turn, the answer to the ask):
 *     never asked, Create offered, flags on or off.
 * The employee is the pack's invented Rowan Kestrel.
 */
const ASKS = "CA_ASKS_WHAT_HAPPENED_ENABLED";
const NO_CREATE = "WHAT_HAPPENED_NO_CREATE_ENABLED";
const MARKER = /You haven't told me what happened yet/;
const CREATE_LINE = /Create the draft here when you're ready/;
const REPORT = "Pau's direction via QA, 13 Nov 2026: port the sibling app's \"what happened\" check (its #331 and round 23)";

type Card = { templateKey?: string; employeeName?: string | null; supportsInlineDraft?: boolean; issue?: string | null } | null;

async function chat(t: ReplayContext, turns: readonly string[]): Promise<{ last: ReplayAnswer; card: Card }> {
  vi.setSystemTime(new Date("2026-11-12T15:00:00Z"));
  t.directory([...STAFF]);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  let last: ReplayAnswer | undefined;
  for (const turn of turns) last = await thread.say(turn);
  return { last: last!, card: thread.proposal as Card };
}

function asksWithoutCreate(last: ReplayAnswer, card: Card) {
  expect(card?.templateKey, `no Corrective Action card:\n${last.content}`).toBe("dpoa");
  expect(card?.employeeName, `not for Rowan Kestrel:\n${last.content}`).toBe("Rowan Kestrel");
  expect(last.content, `the card does not ask what happened:\n${last.content}`).toMatch(MARKER);
  expect(card?.supportsInlineDraft, `the card offers Create while it asks:\n${last.content}`).toBe(false);
  expect(last.content, `"Create the draft here" beside the ask:\n${last.content}`).not.toMatch(CREATE_LINE);
  // Gate-Bubbles on #857: with no Create button, the note never offers to "create it now".
  expect(last.content, `the note offers a Create there is no button for:\n${last.content}`).not.toMatch(/create it now/i);
}

const WHO_AND_WHERE = [
  { key: "title-team-member", turns: ["create corrective action form for Rowan Kestrel, Team Member Part Time"] },
  { key: "title-agm", turns: ["create corrective action form for Rowan Kestrel, Assistant General Manager"] },
] as const;

const ALREADY_ASKS = [
  { key: "name-only", turns: ["create a corrective action for Rowan Kestrel"] },
  { key: "not-late", turns: ["ca for Rowan Kestrel not late"] },
  { key: "nothing-wrong", turns: ["create a corrective action for Rowan Kestrel, she didn't do anything wrong"] },
  { key: "name-after-request", turns: ["Create a corrective action.", "Rowan Kestrel, Team Member Part Time"] },
] as const;

const ACCOUNTS = [
  { key: "late", turns: ["ca for Rowan Kestrel she was late on 11/2"] },
  { key: "sales-shortfall", turns: ["I need a verbal corrective action made for Rowan Kestrel. Not meeting sales requirements for the month of October"] },
  { key: "account-before-request", turns: ["can i give a ca for not signing off on the cleaning check list", "can you write me a ca for Rowan Kestrel"] },
  { key: "answer-to-the-ask", turns: ["create corrective action form for Rowan Kestrel, Team Member Part Time", "she skipped the closing checklist on her shift last night"] },
] as const;

export const NOV13_CA_ASKS_WHAT_HAPPENED_CASES: ReplayCase[] = [
  ...WHO_AND_WHERE.map(({ key, turns }): ReplayCase => ({
    id: `nov13-ca-asks-what-happened-${key}`,
    title: `"${turns.join('" → "')}" — the job title is no account: the card asks what happened, with no Create`,
    report: `${REPORT}; the sibling's #331 shape`,
    status: { open: "the job title is the card's Issue and nothing is asked" },
    fixFlags: [ASKS, NO_CREATE],
    async run(t) {
      const { last, card } = await chat(t, turns);
      asksWithoutCreate(last, card);
      expect(card?.issue ?? null, `the job title is the Issue:\n${last.content}`).toBeNull();
      expect(last.content, `the job title is the Issue line:\n${last.content}`).not.toMatch(/\*\*Issue:\*\*[^\n]*(?:Team Member|General Manager)/);
    },
  })),
  ...ALREADY_ASKS.map(({ key, turns }): ReplayCase => ({
    id: `nov13-what-happened-no-create-${key}`,
    title: `"${turns.join('" → "')}" — the card asks what happened and offers no Create while it asks`,
    report: `${REPORT}; the sibling's round-23 shape`,
    status: { open: "the card asks what happened beside an active Create draft and \"Create the draft here\"" },
    fixFlags: [ASKS, NO_CREATE],
    async run(t) {
      const { last, card } = await chat(t, turns);
      asksWithoutCreate(last, card);
    },
  })),
  ...ACCOUNTS.map(({ key, turns }): ReplayCase => ({
    id: `nov13-ca-asks-what-happened-negative-${key}`,
    title: `"${turns.join('" → "')}" — an account: never asked what happened, Create offered`,
    report: `${REPORT}; negative`,
    status: "fixed" as const,
    fixFlags: [ASKS, NO_CREATE],
    async run(t) {
      const { last, card } = await chat(t, turns);
      expect(card?.employeeName, `not for Rowan Kestrel:\n${last.content}`).toBe("Rowan Kestrel");
      expect(last.content, `asked what happened after an account:\n${last.content}`).not.toMatch(MARKER);
      // Gate-Bubbles-5 (13 Nov 2026): the card check's own ask is worded "What happened? …"; never after an account either.
      expect(last.content, `the card check asked what happened after an account:\n${last.content}`).not.toMatch(/What happened\?/);
      expect(card?.supportsInlineDraft, `no Create after an account:\n${last.content}`).toBe(true);
    },
  })),
];

/**
 * QA's 17t live finding (13 Nov 2026, main 7d5b7bb2; item 4): turn 1 "create corrective action form for <A>, Team
 * Member Part Time" asks what happened, no Create — right. Turn 2, the answer "she skipped the closing checklist on her
 * shift last night", gave "Issue: team member part time" (the card's What happened); the account only fed the policy
 * pick and the date question. The job title is never the Issue: the answer to "what happened" is. Before 17t (main
 * d5e5ea22) both turns had the title as the Issue, so this is not worse than before — the turn-2 half was never fixed.
 */
export const NOV13_ANSWER_IS_THE_ISSUE_CASES: ReplayCase[] = [
  {
    id: "nov13-ca-asks-what-happened-answer-is-the-issue",
    title: `"create corrective action form for Rowan Kestrel, Team Member Part Time" → "she skipped the closing checklist on her shift last night": the Issue is the account, never the job title`,
    report: "QA, 17t live (13 Nov 2026, main 7d5b7bb2), item 4",
    status: { open: "the turn-2 Issue (What happened) is the turn-1 job title, not the account" },
    fixFlags: [ASKS, NO_CREATE, "ANSWER_IS_THE_ISSUE_ENABLED"],
    async run(t) {
      const { last, card } = await chat(t, ACCOUNTS.find((row) => row.key === "answer-to-the-ask")!.turns);
      expect(card?.issue ?? "", `the Issue is not the account:\n${last.content}`).toMatch(/skipped the closing checklist/i);
      expect(card?.issue ?? "", `the job title is the Issue:\n${last.content}`).not.toMatch(/team member|part time/i);
      expect(last.content, `the Issue line is the job title:\n${last.content}`).not.toMatch(/\*\*Issue:\*\*[^\n]*(?:Team Member|Part Time)/i);
      expect(card?.supportsInlineDraft, `no Create after the account:\n${last.content}`).toBe(true);
    },
  },
];

/**
 * Gate-Bubbles B866 (13 Nov 2026): with ANSWER_IS_THE_ISSUE on, a request turn that carries both the job title and the
 * account made the WHOLE request sentence the Issue. The Issue is the account clause alone: never the request's lead,
 * the employee's name or the title.
 */
export const NOV13_ANSWER_IS_THE_ISSUE_REQUEST_TURN_CASES: ReplayCase[] = [
  {
    key: "title-and-account",
    said: "ca for Rowan Kestrel, Team Member Part Time, she was late on 11/2",
    expected: /^she was late on 11\/2$/,
  },
  {
    key: "title-before-name",
    said: "create a CA for general manager, rowan kestrel for violating the standards of conduct",
    expected: /^violating the standards of conduct$/,
  },
].map(({ key, said, expected }): ReplayCase => ({
  id: `nov13-answer-is-the-issue-request-turn-${key}`,
  title: `"${said}": the Issue is the account clause alone, never the request sentence, the name or the title`,
  report: "Gate-Bubbles B866 (13 Nov 2026)",
  status: { open: "the job title is the card's Issue" },
  fixFlags: [ASKS, NO_CREATE, "ANSWER_IS_THE_ISSUE_ENABLED"],
  async run(t) {
    const { last, card } = await chat(t, [said]);
    const issue = card?.issue ?? "";
    expect(issue, `the Issue is not the account clause:\n${last.content}`).toMatch(expected);
    expect(issue, `the Issue carries the request or the name:\n${last.content}`).not.toMatch(/\b(?:ca|create)\b|rowan|kestrel/i);
  },
}));

/**
 * With Coding-6's CARD_CHECKED_AGAINST_WORDS too (QA, 13 Nov 2026; Ask-bubbles#861): that flag blanks a title-only Issue
 * on the same turn. With both flags on, the Issue is the account — never blank, never the title. Checked on a merge of
 * this PR, main 6081b825 and #861 (e47fcff8): both on gives the account on all three turns below.
 */
export const NOV13_ANSWER_IS_THE_ISSUE_WITH_CARD_CHECK_CASES: ReplayCase[] = [
  { key: "answer", turns: ["create corrective action form for Rowan Kestrel, Team Member Part Time", "she skipped the closing checklist on her shift last night"], expected: /^she skipped the closing checklist on her shift last night$/ },
  { key: "title-and-account", turns: ["ca for Rowan Kestrel, Team Member Part Time, she was late on 11/2"], expected: /^she was late on 11\/2$/ },
  { key: "title-before-name", turns: ["create a CA for general manager, rowan kestrel for violating the standards of conduct"], expected: /^violating the standards of conduct$/ },
].map(({ key, turns, expected }): ReplayCase => ({
  id: `nov13-answer-is-the-issue-with-card-check-${key}`,
  title: `"${turns.join('" → "')}" with CARD_CHECKED_AGAINST_WORDS too: the Issue is the account, never blank or the title`,
  report: "QA, 13 Nov 2026: ANSWER_IS_THE_ISSUE with CARD_CHECKED_AGAINST_WORDS (#861)",
  status: { open: "the Issue is the job title (or blank), not the account" },
  fixFlags: [ASKS, NO_CREATE, "ANSWER_IS_THE_ISSUE_ENABLED", "CARD_CHECKED_AGAINST_WORDS_ENABLED"],
  async run(t) {
    const { last, card } = await chat(t, turns);
    expect(card?.issue ?? "", `the Issue is not the account:\n${last.content}`).toMatch(expected);
  },
}));
