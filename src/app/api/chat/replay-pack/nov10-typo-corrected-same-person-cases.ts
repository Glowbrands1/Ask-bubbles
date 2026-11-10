import { expect } from "vitest";

import { STAFF, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * QA, 10 Nov 2026 (Bubbles s14 path 2): "ok, create a follow-up coaching form for rozline quellmar …", then "Oops,
 * it's Rozlyn quellmar", then "create a follow-up coaching form for rozlyn quellmar": the card for that request has no
 * date, though "October 1st" was given. The misspelled turn reads as another person on every later turn, so the card's
 * turns start after it (`turnsAboutThisForm`, ai/form-proposal.ts — protected). TYPO_CORRECTED_SAME_PERSON_ENABLED is
 * the fix; its lines wait on Pau (docs/patches/typo-corrected-same-person.patch). Invented person.
 */
const GLOBAL = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const ROZLYN: DirectoryRow = {
  id: "e-rozlyn-quellmar",
  firstName: "Rozlyn",
  lastName: "Quellmar",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};

export const NOV10_TYPO_CORRECTED_SAME_PERSON_CASES: ReplayCase[] = [
  {
    id: "nov10-typo-corrected-same-person-keeps-date",
    title: "after \"Oops, it's Rozlyn quellmar\", the next follow-up coaching request for her keeps the date given earlier",
    report: "QA, 10 Nov 2026: Bubbles s14 path 2",
    status: { open: "with production's flags the card for the later request has no date" },
    fixFlags: ["TYPO_CORRECTED_SAME_PERSON_ENABLED"],
    // Open with the flag too until Pau's ai/form-proposal.ts lines land (docs/patches/typo-corrected-same-person.patch).
    fixStatus: { open: "the protected lines are not applied yet" },
    async run(t) {
      t.directory([...STAFF, ROZLYN]);
      t.as("location_manager", GLOBAL);
      const thread = t.thread();
      for (const said of [
        "help me create a coaching form",
        "October 1st",
        "ok, create a follow-up coaching form for rozline quellmar. i trained her on the new promo and we roleplayed a couple objections",
        "Oops, it's Rozlyn quellmar",
        "create a follow-up coaching form for rozlyn quellmar",
      ]) await thread.say(said);
      expect(thread.proposal?.employeeName ?? null).toBe("Rozlyn Quellmar");
      expect(thread.proposal?.formDate ?? null, "the date given on turn 2 is kept").toMatch(/-10-01$/);
    },
  },
];
