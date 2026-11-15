import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * A SHARED LAST NAME IS NOT THE SAME PERSON (QA, 15 Nov 2026)
 * ============================================================================
 *
 * QA, 15 Nov 2026, from this app: the manager typed a first name and a surname, and the card showed another first name.
 * QA found the typed first name was that employee's preferred first name in Woven: the matcher was right, and the card
 * showed only the legal name (the display is the readable-names work). Ask Sunny also guards its agent loop against a
 * shared last name with a first name that fits nobody (FIRST_NAME_MUST_FIT_ENABLED); this app has no agent loop, and its
 * classic chat already declines that. These cases pin both. Every person is invented.
 */

const MARISOL: DirectoryRow = { id: "e-marisol-fairweather-fn", firstName: "Marisol", lastName: "Fairweather", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const LORRAINE: DirectoryRow = { id: "e-lorraine-fairweather-fn", firstName: "Lorraine", lastName: "Fairweather", preferredFirstName: "Rae", employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const REPORT = "QA, 15 Nov 2026: a typed first name and surname; the card showed another first name (it was the preferred first name)";

export const NOV15_FIRST_NAME_FITS_CASES: ReplayCase[] = [
  {
    id: "nov15-first-name-fits-soren-is-not-marisol",
    title: "\"Create a CA for Soren Fairweather, she was late on 11/12\" (roster has Marisol Fairweather): never Marisol Fairweather; offered as typed",
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-14T16:00:00Z"));
      t.directory([...STAFF, MARISOL]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("Create a CA for Soren Fairweather, she was late on 11/12", { employeeName: "Soren Fairweather" });
      expect(thread.proposal?.employeeName ?? null, reply.content).not.toBe("Marisol Fairweather");
      expect(reply.content).not.toContain("Marisol Fairweather");
      const answered = await thread.say("Soren Fairweather", { employeeName: "Soren Fairweather" });
      expect(thread.proposal?.employeeName, answered.content).toBe("Soren Fairweather");
    },
  },
  {
    id: "nov15-first-name-fits-marisal-is-marisol",
    title: "\"Create a CA for Marisal Fairweather, she was late on 11/12\": a close spelling of the first name is asked as Marisol Fairweather",
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-14T16:00:00Z"));
      t.directory([...STAFF, MARISOL]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("Create a CA for Marisal Fairweather, she was late on 11/12", { employeeName: "Marisal Fairweather" });
      expect(`${thread.proposal?.employeeName ?? ""} ${reply.content}`).toContain("Marisol Fairweather");
    },
  },
  {
    id: "nov15-first-name-fits-preferred-first-name",
    title: "\"Create a CA for Rae Fairweather, she was late on 11/12\" (roster has Lorraine Fairweather, preferred Rae): the card is hers",
    report: "QA, 15 Nov 2026: the typed first name was the employee's preferred first name in Woven; the matcher was right",
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-14T16:00:00Z"));
      t.directory([...STAFF, LORRAINE]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("Create a CA for Rae Fairweather, she was late on 11/12", { employeeName: "Rae Fairweather" });
      expect(thread.proposal?.employeeName, reply.content).toBe("Lorraine Fairweather");
    },
  },
];
