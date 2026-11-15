import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * A SHARED LAST NAME IS NOT THE SAME PERSON (QA, 15 Nov 2026)
 * ============================================================================
 *
 * QA, from this app: the manager typed "Salem Pool" and the form switched to the roster's "Melanie Pool". A shared
 * last name with a different first name is never a strong or close match: the chat asks, or offers the name as typed.
 * Ask Sunny's fix guards its agent loop (find_staff and the card setter, FIRST_NAME_MUST_FIT_ENABLED); this app has
 * no agent loop, and its classic chat already declines her (the matcher needs the first name close). These cases pin
 * that, so a change that seats her fails CI. Every person is invented.
 */

const MELANIE: DirectoryRow = { id: "e-melanie-pool-fn", firstName: "Melanie", lastName: "Pool", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const REPORT = "QA, 15 Nov 2026: the manager typed \"Salem Pool\" and the form switched to the roster's \"Melanie Pool\"";

export const NOV15_FIRST_NAME_FITS_CASES: ReplayCase[] = [
  {
    id: "nov15-first-name-fits-salem-is-not-melanie",
    title: "\"Create a CA for Salem Pool, she was late on 11/12\" (roster has Melanie Pool): never Melanie Pool; offered as typed",
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-14T16:00:00Z"));
      t.directory([...STAFF, MELANIE]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("Create a CA for Salem Pool, she was late on 11/12", { employeeName: "Salem Pool" });
      expect(thread.proposal?.employeeName ?? null, reply.content).not.toBe("Melanie Pool");
      expect(reply.content).not.toContain("Melanie Pool");
      const answered = await thread.say("Salem Pool", { employeeName: "Salem Pool" });
      expect(thread.proposal?.employeeName, answered.content).toBe("Salem Pool");
    },
  },
  {
    id: "nov15-first-name-fits-melany-is-melanie",
    title: "\"Create a CA for Melany Pool, she was late on 11/12\": a close spelling of the first name is asked as Melanie Pool",
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-14T16:00:00Z"));
      t.directory([...STAFF, MELANIE]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("Create a CA for Melany Pool, she was late on 11/12", { employeeName: "Melany Pool" });
      expect(`${thread.proposal?.employeeName ?? ""} ${reply.content}`).toContain("Melanie Pool");
    },
  },
];
