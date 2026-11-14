import { expect, vi } from "vitest";

import { STAFF, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * FUZZY_STORE_ASKS — A STORE READ BY A LOOSE CLOSE SPELLING IS ASKED, NOT TAKEN (QA's ruling, 14 Nov 2026)
 * ============================================================================
 *
 * Gate-Bubbles-3's #869 control: "ca for tessaly varn at sioux falls west, she was late on 11/1/26" gave **Store:**
 * Sioux Falls, SD (W 41st St), as you said. "sioux falls west" is two letters off "sioux falls 41st"; production's
 * GLOBAL_STORE_ASK takes a single misspelt store silently. QA's ruling: that stays for a one-letter typo or an
 * initialism; a close spelling further off is asked. With FUZZY_STORE_ASKS_ENABLED it is. Invented people.
 */
const FLAG = "FUZZY_STORE_ASKS_ENABLED";
const REPORT = "Gate-Bubbles-3's #869 probes (13 Nov 2026), QA's ruling 14 Nov 2026; invented people";
const TESSALY = { id: "e-tessaly", firstName: "Tessaly", lastName: "Varn", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-66", "loc-264"], positionName: "Team Member Part Time" };

async function cardFor(t: ReplayContext, turn: string) {
  vi.setSystemTime(new Date("2026-11-13T15:00:00Z"));
  t.directory([...STAFF, TESSALY as never]);
  t.as("admin", { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] } as never);
  const thread = t.thread();
  const reply = (await thread.say(turn)).content;
  return { reply, locationId: (thread.proposal as { locationId?: string | null } | null)?.locationId ?? null };
}

export const NOV14_FUZZY_STORE_ASKS_CASES: ReplayCase[] = [
  {
    id: "nov14-fuzzy-store-asks-sioux-falls-west",
    title: `"ca for tessaly varn at sioux falls west, she was late on 11/1/26" — asked about Sioux Falls (W 41st St), never "as you said"`,
    report: REPORT,
    status: { open: "a store two letters off is taken silently, as you said" },
    fixFlags: [FLAG],
    async run(t: ReplayContext) {
      const { reply, locationId } = await cardFor(t, "ca for tessaly varn at sioux falls west, she was late on 11/1/26");
      expect(locationId, `the store was taken without asking:\n${reply}`).toBeNull();
      expect(reply, `the store is not asked about:\n${reply}`).toMatch(/I read \*\*sioux falls west\*\* as \*\*Sioux Falls, SD \(W 41st St\)[^*]*\*\* — is that the store\?/);
      expect(reply, `written "as you said":\n${reply}`).not.toMatch(/\*\*Store:\*\*[^\n]*as you said/);
    },
  },
];

/** Guards, flag off and on: a one-letter typo is still taken, as GLOBAL_STORE_ASK designed. */
const ONE_LETTER: readonly { key: string; turn: string; store: string }[] = [
  { key: "kearny", turn: "ca for tessaly varn at kearny, she was late on 11/1/26", store: "loc-66" },
  { key: "west-dodg", turn: "ca for tessaly varn at west dodg, she was late on 11/1/26", store: "loc-264" },
  { key: "grand-islnd", turn: "ca for tessaly varn at grand islnd, she was late on 11/1/26", store: "loc-236" },
];

export const NOV14_FUZZY_STORE_ASKS_GUARDS: ReplayCase[] = ONE_LETTER.map((wording) => ({
  id: `nov14-fuzzy-store-asks-guard-${wording.key}`,
  title: `"${wording.turn}" — one letter off: taken, as GLOBAL_STORE_ASK designed`,
  report: REPORT,
  status: "fixed",
  fixFlags: [FLAG],
  async run(t: ReplayContext) {
    const { reply, locationId } = await cardFor(t, wording.turn);
    expect(locationId, `the one-letter typo is no longer taken:\n${reply}`).toBe(wording.store);
  },
}));
