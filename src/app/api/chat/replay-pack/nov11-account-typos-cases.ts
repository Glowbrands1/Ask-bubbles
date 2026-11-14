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
