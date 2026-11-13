import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * THE SIBLING APP'S 38b LIVE CHECK, PORTED: THE SAME-NAME PAIR NEVER ASKED, AND "Job title: No" (QA, 13 Nov 2026)
 * ============================================================================
 *
 * Shaped like the live data (counts and ids only were read; the people here are invented and on no directory): two
 * ACTIVE people with one full name. One is at a store Ask Bubbles maps, with Woven's placeholder position "No Position
 * Set"; the other's only location is a Woven location that is not a store ('ignored'), so no roster read holds them
 * (`unmapped: true`). "create a verbal CA for <name>, she was late on 11/3/26" drafted for the first with no word about
 * the second, and the card's Job title read "No".
 *
 * SAME_NAME_UNMAPPED_NOTE_ENABLED: the card says there's another active <name> at a location that isn't one of your
 * stores, and Create stays. PLACEHOLDER_TITLE_IS_NONE_ENABLED: the placeholder is no title.
 */

const SAID = "create a verbal CA for Linnea Starkweather, she was late on 11/3/26";
const AT_SALON = {
  id: "e-linnea-store",
  firstName: "Linnea",
  lastName: "Starkweather",
  preferredFirstName: "Linnea",
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "No Position Set",
};
const AT_NO_SALON = { ...AT_SALON, id: "e-linnea-office", locationIds: [] as string[], positionName: "District Trainer", unmapped: true };
const REPORT = "Ported from the sibling app: QA's 38b live check (13 Nov 2026): the one same-name pair was not asked about, and the card's Job title read \"No\"";

async function play(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-13T15:00:00Z"));
  t.directory([...STAFF, AT_SALON, AT_NO_SALON] as never);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  const reply = await thread.say(SAID);
  return { thread, reply };
}

export const NOV13_SAME_NAME_UNMAPPED_CASES: ReplayCase[] = [
  {
    id: "nov13-same-name-unmapped-note",
    title: `"${SAID}" with a second active Linnea Starkweather at a location that is no store: the card says so, and Create stays`,
    report: REPORT,
    status: { open: "the card is for the one at the store, with no word about the other" },
    fixFlags: ["SAME_NAME_UNMAPPED_NOTE_ENABLED"],
    async run(t) {
      const { thread, reply } = await play(t);
      expect(thread.proposal, `no card:\n${reply.content}`).toMatchObject({ employeeName: "Linnea Starkweather", locationId: "loc-264", status: "ready" });
      expect(reply.content, `no word about the other Linnea Starkweather:\n${reply.content}`).toMatch(
        /There's also an active Linnea Starkweather at a location that isn't one of your stores in Ask Bubbles\. This card is for the one at [^\n.]+\./,
      );
    },
  },
  {
    id: "nov13-placeholder-title-is-none",
    title: `"${SAID}" for a person whose Woven position is "No Position Set": the card never shows the placeholder as a job title`,
    report: REPORT,
    status: { open: "the card's Job title is Woven's placeholder (shown as \"No\")" },
    fixFlags: ["PLACEHOLDER_TITLE_IS_NONE_ENABLED"],
    async run(t) {
      const { thread, reply } = await play(t);
      const role = String((thread.proposal as Record<string, unknown> | null)?.employeeRole ?? "");
      expect(role, `the placeholder is the card's job title:\n${reply.content}`).not.toMatch(/^no\b|position set/i);
      expect(reply.content, `the reply shows the placeholder as the job title:\n${reply.content}`).not.toMatch(/\*\*Job title:\*\*\s*No\b/i);
    },
  },
];
