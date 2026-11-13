import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * AN OFFER THE APP MAKES CAN BE TAKEN (port from the sibling app, QA top priority, 12 Nov 2026; OFFERED_NAME_ACCEPTED_ENABLED)
 * ============================================================================
 *
 * Ported from the sibling app (found on its 37b live bug replay, 12 Nov 2026): an all-location admin typed "CA for <C>, do not terminate yet, she was late";
 * the reply offered "reply use <C>"; "use <C>" was refused — "\"<C>\" isn't a person on your team" — and the card had
 * no employee. The request's slot reader takes "<C>," before the account as a capitalised list item, so the person
 * guard ruled the name out on the turn that takes the offer too. QA: "an offer the bot makes must be acceptable". <C>
 * is invented (Brisa Talmadge, not on the directory).
 */
const C = "Brisa Talmadge";
const REQUEST = `CA for ${C}, do not terminate yet, she was late`;
const ADMIN = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };

const SCOPES = [
  { key: "admin", role: "admin", scope: ADMIN },
  { key: "store-manager", role: "location_manager", scope: WEST_DODGE },
] as const;

export const NOV12_OFFERED_NAME_ACCEPTED_CASES: ReplayCase[] = SCOPES.map(({ key, role, scope }) => ({
  id: `nov12-offered-name-accepted-${key}`,
  title: `${key}: "${REQUEST}" → "reply use ${C}" → "use ${C}": the card is for ${C}, with the account`,
  report: `QA, 12 Nov 2026 (top priority; ported from the sibling app); ${key}`,
  status: { open: `"use ${C}" is refused: "\\"${C}\\" isn't a person on your team"` },
  fixFlags: ["OFFERED_NAME_ACCEPTED_ENABLED"],
  async run(t: ReplayContext) {
    vi.setSystemTime(new Date("2026-11-12T15:00:00Z"));
    t.directory([...STAFF]);
    t.as(role, scope as never);
    const thread = t.thread();
    const first = await thread.say(REQUEST);
    expect(first.content, `no offer for ${C}:\n${first.content}`).toContain(`reply **use ${C}**`);
    const used = await thread.say(`use ${C}`);
    expect(used.content, `the offer was refused:\n${used.content}`).not.toMatch(/isn't a person on your team/);
    expect((thread.proposal as { employeeName?: string | null } | null)?.employeeName, `"use ${C}" did not take the name:\n${used.content}`).toBe(C);
    // The Issue's wording ("do not terminate yet") is #829 TERMINATION_CARD_TIDY's, so only the policy read from it is asserted.
    expect(used.content, `the policy was lost:\n${used.content}`).toMatch(/\*\*Policy:\*\* Attendance\b/);
  },
}));

/**
 * QA's 17r-b live retest (13 Nov 2026, on e5fd5b1c): an all-location admin, "CA for <B>, do not terminate yet, she was
 * late" → the "use <B>" ask → a store only ("Omaha, NE (West Dodge Rd)"; OFF_ROSTER_PLACE_ANSWER, live, asks again) →
 * "use <B>" was refused: "Who is this Corrective Action Form for? \"<B>\" isn't a person on your team…". With
 * OFFERED_NAME_ACCEPTED on, the third turn takes the name.
 */
export const NOV13_OFFERED_NAME_AFTER_STORE_CASES: ReplayCase[] = [
  {
    id: "nov13-offered-name-accepted-after-store-answer-admin",
    title: `admin: "${REQUEST}" → "Omaha, NE (West Dodge Rd)" → "use ${C}": the card is for ${C}, with its store`,
    report: "QA, 17r-b live retest (13 Nov 2026, e5fd5b1c): \"use <B>\" after a store answer was refused",
    status: { open: `"use ${C}" after the store answer is refused: "\\"${C}\\" isn't a person on your team"` },
    fixFlags: ["OFFERED_NAME_ACCEPTED_ENABLED"],
    async run(t: ReplayContext) {
      vi.setSystemTime(new Date("2026-11-12T15:00:00Z"));
      t.directory([...STAFF]);
      t.as("admin", ADMIN as never);
      const thread = t.thread();
      const first = await thread.say(REQUEST);
      expect(first.content, `no offer for ${C}:\n${first.content}`).toContain(`reply **use ${C}**`);
      const store = await thread.say("Omaha, NE (West Dodge Rd)");
      expect(store.content, `the offer is not asked again after the store answer:\n${store.content}`).toContain(`reply **use ${C}**`);
      const used = await thread.say(`use ${C}`);
      expect(used.content, `the offer was refused:\n${used.content}`).not.toMatch(/isn't a person on your team/);
      const card = thread.proposal as { employeeName?: string | null; locationId?: string | null } | null;
      expect(card?.employeeName, `"use ${C}" did not take the name:\n${used.content}`).toBe(C);
      expect(card?.locationId, `the store was lost:\n${used.content}`).toBe("loc-264");
    },
  },
];
