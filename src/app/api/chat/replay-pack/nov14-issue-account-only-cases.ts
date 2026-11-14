import { expect, vi } from "vitest";

import { STAFF, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * ISSUE_ACCOUNT_ONLY — THE CARD'S ISSUE IS THE ACCOUNT, NOT THE REQUEST OR THE TITLE (QA's Bubbles 17x, 14 Nov 2026)
 * ============================================================================
 *
 * QA's 17x live test: "write up <A>, Assistant General Manager, for leaving the safe open" gave the Issue as the whole
 * command, title included; "ca for <A> at west dodge, Team Member Part Time, she was late on 11/3/26" gave "team
 * member part time, she was late on 11/3/26". With ISSUE_ACCOUNT_ONLY_ENABLED the Issue is the account only. The
 * tester's wording; the person is invented.
 */
const FLAG = "ISSUE_ACCOUNT_ONLY_ENABLED";
const REPORT = "QA's Bubbles 17x live test (14 Nov 2026), tester's wording; invented person";
const ILSA = { id: "e-ilsa", firstName: "Ilsa", lastName: "Varnholt", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: null };

async function issueOf(t: ReplayContext, turn: string) {
  vi.setSystemTime(new Date("2026-11-13T15:00:00Z"));
  t.directory([...STAFF, ILSA as never]);
  t.as("location_manager", { level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: [] });
  const thread = t.thread();
  const reply = (await thread.say(turn)).content;
  return { reply, issue: (thread.proposal as { issue?: string | null } | null)?.issue ?? null };
}

const OPEN: readonly { key: string; turn: string; issue: string }[] = [
  { key: "write-up-title-for", turn: "write up Ilsa Varnholt, Assistant General Manager, for leaving the safe open", issue: "leaving the safe open" },
  { key: "ca-store-title-account", turn: "ca for Ilsa Varnholt at west dodge, Team Member Part Time, she was late on 11/3/26", issue: "she was late on 11/3/26" },
];

export const NOV14_ISSUE_ACCOUNT_ONLY_CASES: ReplayCase[] = OPEN.map((wording) => ({
  id: `nov14-issue-account-only-${wording.key}`,
  title: `"${wording.turn}" — the Issue is "${wording.issue}"`,
  report: REPORT,
  status: { open: "the Issue carries the request or the job title" },
  fixFlags: [FLAG],
  async run(t: ReplayContext) {
    const { reply, issue } = await issueOf(t, wording.turn);
    expect(issue, `the Issue:\n${reply}`).toBe(wording.issue);
  },
}));

/** Guards, flag off and on: an Issue that is already the account is unchanged. */
const KEPT: readonly { key: string; turn: string; issue: RegExp }[] = [
  { key: "for-being-late", turn: "ca for Ilsa Varnholt for being late on 11/3/26", issue: /^being late on 11\/3\/26$/ },
  { key: "account-with-comma", turn: "ca for Ilsa Varnholt, she was late on 11/3/26, and she did not call", issue: /^she was late on 11\/3\/26/ },
];

export const NOV14_ISSUE_ACCOUNT_ONLY_GUARDS: ReplayCase[] = KEPT.map((wording) => ({
  id: `nov14-issue-account-only-guard-${wording.key}`,
  title: `"${wording.turn}" — the Issue is the account, as before`,
  report: REPORT,
  status: "fixed",
  fixFlags: [FLAG],
  async run(t: ReplayContext) {
    const { reply, issue } = await issueOf(t, wording.turn);
    expect(issue ?? "", `the Issue:\n${reply}`).toMatch(wording.issue);
  },
}));
