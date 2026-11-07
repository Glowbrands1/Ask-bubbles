import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * QA, flip-3 tester, 6 Nov 2026 (D): "…<name variant>, verbal, she was late on 10-20-26" printed What
 * happened = "verbal" (the lateness dropped), and with a nickname, the typed name. ISSUE_IS_THE_ACCOUNT_ENABLED
 * passes over a bare level clause and a short clause naming the person. The person is invented and not
 * on either directory.
 */
const TAMSIN: DirectoryRow = { id: "e-tamsin-wexley-issue", firstName: "Tamsin", lastName: "Wexley", preferredFirstName: "Tammy", employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };

/** The invented person of this file (a function: the registry reads exported arrays as cases). */
export function issueIsTheAccountPeople(): readonly DirectoryRow[] {
  return [TAMSIN];
}

const SHAPES = [
  { key: "lowercase", text: "create a CA for tamsin wexley, verbal, she was late on 10-20-26" },
  { key: "nickname", text: "create a CA for Tammy Wexley, verbal, she was late on 10-20-26" },
];

export const NOV6_ISSUE_IS_THE_ACCOUNT_CASES: ReplayCase[] = SHAPES.map(({ key, text }) => ({
  id: `nov6-issue-is-the-account-${key}`,
  title: `"${text}": the card's Issue is the lateness, never the level or the name`,
  report: "QA, 6 Nov 2026 (flip-3 tester, D): What happened = \"verbal\", or the typed name",
  status: { open: "with production's flags the card's Issue is \"verbal\" (lowercase) or the typed name (nickname)" },
  fixFlags: ["ISSUE_IS_THE_ACCOUNT_ENABLED"],
  async run(t) {
    vi.setSystemTime(new Date("2026-11-06T15:00:00Z"));
    t.directory([...STAFF, TAMSIN]);
    t.as("location_manager", WEST_DODGE);
    const reply = await t.thread().say(text);
    expect(reply.content, "the Issue is not the account").toMatch(/\*\*Issue:\*\* she was late on 10-20-26/);
  },
}));
