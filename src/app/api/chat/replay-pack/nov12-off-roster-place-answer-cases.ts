import { expect, vi } from "vitest";

import { STAFF, type ReplayAnswer, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * A PLACE IS NEVER THE PERSON WHILE THE OFF-ROSTER OFFER IS OPEN (port from the sibling app's 37b live bug, 12 Nov
 * 2026; OFF_ROSTER_PLACE_ANSWER_ENABLED)
 * ============================================================================
 *
 * The sibling app's tester, as an all-location admin: "CA for <C>, do not terminate yet, she was late" → the off-roster
 * offer ("reply use <C>") → a place only. The place became the employee; the location was not set, the account and the
 * date were lost, and "use <C>" was not asked again. #834's case covers a store manager's "dodge, ne" only. This roster
 * writes stores city-first ("Omaha, NE (West Dodge Rd)"); the cases answer in that form, with a city alone, in the
 * state-first form, and with a city the roster does not list. <C> is invented (Brisa Talmadge, not on the directory).
 */
const C = "Brisa Talmadge";
const REQUEST = `CA for ${C}, do not terminate yet, she was late`;
const FLAG = "OFF_ROSTER_PLACE_ANSWER_ENABLED";
const REPORT = "QA, the sibling app's 37b live test (12 Nov 2026), ported: an all-location admin";
const ADMIN = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };

const lineOf = (reply: ReplayAnswer, label: string) => new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n·]*)`).exec(reply.content)?.[1]?.trim() ?? "";

async function offered(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-12T15:00:00Z"));
  t.directory([...STAFF]);
  t.as("admin", ADMIN);
  const thread = t.thread();
  const first = await thread.say(REQUEST);
  expect(first.content, `no offer for ${C}:\n${first.content}`).toContain(`reply **use ${C}**`);
  return { thread };
}

const PLACES = [
  { key: "roster-name", place: "Omaha, NE (West Dodge Rd)", store: "loc-264" },
  { key: "city-only", place: "Bellevue", store: "loc-67" },
  { key: "state-first", place: "NE Omaha", store: null },
  { key: "city-state-unlisted", place: "Des Moines, IA", store: null },
] as const;

export const NOV12_OFF_ROSTER_PLACE_ANSWER_CASES: ReplayCase[] = PLACES.map(({ key, place, store }) => ({
  id: `nov12-off-roster-place-answer-${key}`,
  title: `Admin: "${REQUEST}" → offer → "${place}": never a person; the account is kept${store ? ", the store set," : ""} and "use ${C}" asked again`,
  report: `${REPORT}; ${key}`,
  status: { open: "the place is read as a person (or the typed name is taken without \"use\"), and the offer is not asked again" },
  fixFlags: [FLAG],
  async run(t: ReplayContext) {
    const { thread } = await offered(t);
    const reply = await thread.say(place);
    const card = thread.proposal as { employeeName?: string | null; templateKey?: string; locationId?: string | null } | null;
    expect(card?.templateKey, `no Corrective Action card:\n${reply.content}`).toBe("dpoa");
    expect(card?.employeeName ?? null, `"${place}" became the employee:\n${reply.content}`).toBeNull();
    expect(reply.content, `"use ${C}" is not asked again:\n${reply.content}`).toContain(`reply **use ${C}**`);
    // The Issue's wording ("do not terminate yet") is #829 TERMINATION_CARD_TIDY's (QA, 12 Nov 2026), so it is not asserted.
    expect(lineOf(reply, "Policy"), `the policy was lost:\n${reply.content}`).toMatch(/^Attendance\b/);
    if (store) expect(card?.locationId, `the store is not set:\n${reply.content}`).toBe(store);
  },
}));

/**
 * QA's 17r live finding (12 Nov 2026, on 6d862bbe; the Bubbles tester's exact wording, as an all-location admin):
 * T1 "CA for <B>, do not terminate yet, she was late" → the "use <B>" ask; T2, only "Omaha, NE (West Dodge Rd)" → no
 * re-ask, <B> on the card, the store set, and the Issue / What happened became "Omaha, NE (West Dodge Rd)" — the store
 * string replaced the account. With OFF_ROSTER_PLACE_ANSWER on: "use <B>" is asked again, the store is set, and the
 * Issue is the account as T1 read it, never the store. (T1's Issue itself is read as "do not terminate yet" on these
 * flags; that reading is reported to QA separately and is not this case's.)
 */
export const NOV12_OFF_ROSTER_PLACE_ANSWER_LIVE_CASES: ReplayCase[] = [
  {
    id: "nov12-off-roster-place-answer-17r-live-west-dodge",
    title: `Admin: "${REQUEST}" → offer → "Omaha, NE (West Dodge Rd)": "use ${C}" asked again, the store set, and the store is never the Issue`,
    report: "QA, 17r live (12 Nov 2026, 6d862bbe): the store string replaced the account and <B> went on the card without \"use <B>\"",
    status: { open: "<B> goes on the card without \"use <B>\", and the store string becomes the Issue" },
    fixFlags: [FLAG],
    async run(t: ReplayContext) {
      vi.setSystemTime(new Date("2026-11-12T15:00:00Z"));
      t.directory([...STAFF]);
      t.as("admin", ADMIN);
      const thread = t.thread();
      const first = await thread.say(REQUEST);
      const issueBefore = (thread.proposal as { issue?: string | null } | null)?.issue ?? null;
      expect(first.content, `no offer for ${C}:\n${first.content}`).toContain(`reply **use ${C}**`);
      const reply = await thread.say("Omaha, NE (West Dodge Rd)");
      const card = thread.proposal as { employeeName?: string | null; locationId?: string | null; issue?: string | null } | null;
      expect(reply.content, `"use ${C}" is not asked again:\n${reply.content}`).toContain(`reply **use ${C}**`);
      expect(card?.employeeName ?? null, `${C} went on the card without "use ${C}":\n${reply.content}`).toBeNull();
      expect(card?.locationId, `the store is not set:\n${reply.content}`).toBe("loc-264");
      expect(card?.issue ?? "", `the store string is the Issue:\n${reply.content}`).not.toMatch(/West Dodge|Omaha, NE/i);
      expect(lineOf(reply, "Issue"), `the store string is the Issue line:\n${reply.content}`).not.toMatch(/West Dodge|Omaha, NE/i);
      expect(card?.issue ?? null, `the account changed:\n${reply.content}`).toBe(issueBefore);
    },
  },
];
