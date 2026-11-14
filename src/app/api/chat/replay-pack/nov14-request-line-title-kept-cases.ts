import { expect, vi } from "vitest";

import { STAFF, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * REQUEST_LINE_TITLE_KEPT — "<A>, TEAM MEMBER PART TIME" KEEPS THE TITLE (QA's Bubbles 17x live test, 14 Nov 2026)
 * ============================================================================
 *
 * QA's 17x live test: "create corrective action form for <A>, Team Member Part Time" left the card's employeeRole
 * null — the title given in the request line was not kept. The card builder read "Team Member"; then
 * TITLE_OF_THE_EMPLOYEE (on in production) read "Part Time" as another person's name beside the title and took it
 * off. With REQUEST_LINE_TITLE_KEPT_ENABLED words that complete a company position name are the title. The person is
 * invented, with no position in Woven (so the manager's title is the one the card can use).
 */
const FLAG = "REQUEST_LINE_TITLE_KEPT_ENABLED";
const REPORT = "QA's Bubbles 17x live test (14 Nov 2026); invented person";
const ILSA = { id: "e-ilsa", firstName: "Ilsa", lastName: "Varnholt", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: null };

/** QA's case and the company's other multi-word positions (QA, 14 Nov 2026: keep the "Part Time" variants here). */
const POSITIONS: readonly { key: string; said: string; role: RegExp }[] = [
  { key: "team-member-part-time", said: "Team Member Part Time", role: /^Team Member/ },
  { key: "team-member-full-time", said: "Team Member Full Time", role: /^Team Member/ },
  { key: "seasonal-team-member-part-time", said: "Seasonal Team Member Part Time", role: /Team Member/ },
];

export const NOV14_REQUEST_LINE_TITLE_KEPT_CASES: ReplayCase[] = POSITIONS.map((position) => ({
  id: `nov14-request-line-title-kept-${position.key}`,
  title: `"create corrective action form for Ilsa Varnholt, ${position.said}" — the card keeps the title`,
  report: REPORT,
  status: { open: "the title given in the request line is taken off the card (employeeRole null)" },
  fixFlags: [FLAG],
  async run(t: ReplayContext) {
    vi.setSystemTime(new Date("2026-11-13T15:00:00Z"));
    t.directory([...STAFF, ILSA as never]);
    t.as("location_manager", { level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: [] });
    const thread = t.thread();
    const reply = (await thread.say(`create corrective action form for Ilsa Varnholt, ${position.said}`)).content;
    const role = (thread.proposal as { employeeRole?: string | null } | null)?.employeeRole ?? null;
    expect(role, `the title is not kept:\n${reply}`).toMatch(position.role);
  },
}));
