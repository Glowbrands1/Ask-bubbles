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
