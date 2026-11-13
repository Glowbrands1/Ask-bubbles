import { expect, vi } from "vitest";

import { STAFF, type ReplayAnswer, type ReplayCase, type ReplayContext } from "./cases";

/**
 * GATE-ONLY (Gate-Bubbles-5, 13 Nov 2026; not part of any PR): QA's 17r-b live retest, as an all-location admin.
 * "CA for <B>, do not terminate yet, she was late" → offer → "Omaha, NE (West Dodge Rd)" → "use <B>": <B> goes on the
 * card, the store set by the place answer is kept, and the Issue is turn 1's, never the store. <B> is invented.
 */
const B = "Brisa Talmadge";
const REQUEST = `CA for ${B}, do not terminate yet, she was late`;
const PLACE = "Omaha, NE (West Dodge Rd)";
const ADMIN = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const lineOf = (reply: ReplayAnswer, label: string) => new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n·]*)`).exec(reply.content)?.[1]?.trim() ?? "";

export const NOV13_GATE5_TESTER_FLOW_CASES: ReplayCase[] = [
  {
    id: "nov13-gate5-offered-name-after-place-answer",
    title: `Admin: "${REQUEST}" → "${PLACE}" → "use ${B}": the card is for ${B}, at loc-264, Issue kept`,
    report: "QA 17r-b live retest (13 Nov 2026), gate-only check",
    status: { open: `"use ${B}" is refused after the place answer` },
    fixFlags: ["OFFERED_NAME_ACCEPTED_ENABLED"],
    async run(t: ReplayContext) {
      vi.setSystemTime(new Date("2026-11-12T15:00:00Z"));
      t.directory([...STAFF]);
      t.as("admin", ADMIN as never);
      const thread = t.thread();
      const first = await thread.say(REQUEST);
      const issue1 = lineOf(first, "Issue");
      expect(first.content, `no offer:\n${first.content}`).toContain(`reply **use ${B}**`);
      const placed = await thread.say(PLACE);
      expect(placed.content, `offer not asked again:\n${placed.content}`).toContain(`reply **use ${B}**`);
      const used = await thread.say(`use ${B}`);
      const card = thread.proposal as { employeeName?: string | null; locationId?: string | null } | null;
      expect(used.content, `the offer was refused:\n${used.content}`).not.toMatch(/isn't a person on your team/);
      expect(card?.employeeName, `"use ${B}" did not take the name:\n${used.content}`).toBe(B);
      expect(card?.locationId, `the store was lost:\n${used.content}`).toBe("loc-264");
      const issue = lineOf(used, "Issue");
      expect(issue, `the Issue is the store:\n${used.content}`).not.toMatch(/West Dodge|Omaha/i);
      // The Issue is the account (turn 1 read "do not terminate yet"; "she was late" is also the account), never the store.
      expect(issue || issue1, `the account was lost:\n${used.content}`).toMatch(/late|terminate/i);
      expect(used.content, `the policy was lost:\n${used.content}`).toMatch(/\*\*Policy:\*\* Attendance\b/);
    },
  },
];
