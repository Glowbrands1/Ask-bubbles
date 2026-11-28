import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * THE CARD'S ISSUE KEEPS THE MANAGER'S WORDS, OBVIOUS SLIPS MENDED (port from the sibling app; QA, 11 Nov 2026)
 * ============================================================================
 *
 * The sibling app's sanitation report (10 Nov 2026 18:49Z, 1 star): "please make a ca for <name> for not doing th e10 minute
 * sanitaion" put the account on the card word for word. Here the same wording gives "**Issue:** not doing th e10 minute
 * sanitaion". ACCOUNT_TYPOS_FIXED_ENABLED mends it on the card; the record keeps what was typed. The person is invented.
 */
const BRISA: DirectoryRow = {
  id: "e-brisa-talmadge",
  firstName: "Brisa",
  lastName: "Talmadge",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};
const SAID = "please make a ca for Brisa Talmadge for not doing th e10 minute sanitaion";

export const NOV11_ACCOUNT_TYPOS_CASES: ReplayCase[] = [
  {
    id: "nov11-account-typos-issue-mended",
    title: `"${SAID}": the card's Issue reads "not doing the 10-minute sanitation" (the manager's words, slips mended)`,
    report: "Sibling-app production (10 Nov 2026 18:49Z, 1 star), via QA (C: typos on the card); same wording checked here",
    status: { open: "the card's Issue is \"not doing th e10 minute sanitaion\"" },
    fixFlags: ["ACCOUNT_TYPOS_FIXED_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-10T18:49:00Z"));
      t.directory([...STAFF, BRISA]);
      t.as("location_manager", WEST_DODGE);
      const card = (await t.thread().say(SAID)).content;
      expect(card, card).toMatch(/^\*\*Issue:\*\* not doing the 10-minute sanitation · /m);
    },
  },
];

/*
 * QA's bar for #772 (Gate-Bubbles-2's x772 probe, 14 Nov 2026): the card's Issue never edits a coworker on the roster,
 * a store name, a capitalised word or a quoted span. Guards with the flag (they hold flag off: nothing is edited).
 * The people are invented: Manuel Quellby is a coworker one letter from "manual".
 */
const MANUEL: DirectoryRow = {
  id: "e-manuel-quellby",
  firstName: "Manuel",
  lastName: "Quellby",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};
const KEPT: readonly { key: string; said: string; issue: string }[] = [
  { key: "coworker", said: "please make a ca for Brisa Talmadge, manuel saw her leave the drawer open", issue: "manuel saw her leave the drawer open" },
  { key: "store", said: "please make a ca for Brisa Talmadge, she was sent to Kearny and never showed", issue: "she was sent to Kearny and never showed" },
  // The Issue reader drops a closing quote mark (as on main, flag off too); what matters is "registr" is not edited.
  { key: "quoted", said: "please make a ca for Brisa Talmadge, she told a guest 'that is not my registr'", issue: "she told a guest 'that is not my registr" },
  // QA (14 Nov 2026), ported from the sibling gate's #983 wordings: a real word is never mended ("complained" is not
  // "complaint"). "she complained to a guest" alone is no incident; its unit test is word for word.
  { key: "complained-to-a-guest", said: "please make a ca for Brisa Talmadge, she was rude and complained to a guest", issue: "she was rude and complained to a guest" },
  { key: "the-guest-complained", said: "please make a ca for Brisa Talmadge, she was rude to a guest who complained", issue: "she was rude to a guest who complained" },
];

export const NOV14_ACCOUNT_TYPOS_BAR_GUARDS: ReplayCase[] = KEPT.map((wording) => ({
  id: `nov14-account-typos-bar-${wording.key}`,
  title: `"${wording.said}": the card's Issue keeps it as typed`,
  report: "QA's #772 bar, Gate-Bubbles-2's x772 probe (14 Nov 2026); invented people",
  status: "fixed",
  fixFlags: ["ACCOUNT_TYPOS_FIXED_ENABLED"],
  async run(t) {
    vi.setSystemTime(new Date("2026-11-14T15:00:00Z"));
    t.directory([...STAFF, BRISA, MANUEL]);
    t.as("location_manager", WEST_DODGE);
    const card = (await t.thread().say(wording.said)).content;
    const issue = /^\*\*Issue:\*\* ([^\n]*?)(?: · |$)/m.exec(card)?.[1] ?? "";
    expect(issue, card).toBe(wording.issue);
  },
}));
