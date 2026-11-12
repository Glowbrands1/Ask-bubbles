import { expect, vi } from "vitest";

import { STAFF, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * THE SAME REQUEST AGAIN, WHILE "IS THIS FOR <NAME>?" WAITS, KEEPS THE NAME (QA, 12 Nov 2026; RESENT_REQUEST_IS_YES_ENABLED)
 * ============================================================================
 *
 * Found on production's flags (TERMINATION_INTAKE work): "I need an exit form with this information. <letter>" got
 * "Is this for **Marcus Tellefsen**?"; the manager sent it again and the reply was "Who is this **Resignation/Exit Form**
 * for?". The people are invented (Marcus Tellefsen, Dolores Whitcombe).
 */
const MARCUS: DirectoryRow = { id: "e-rr-marcus-tellefsen", firstName: "Marcus", lastName: "Tellefsen", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const LETTER = [
  "Hi Marcus,",
  "",
  "This letter confirms that your employment with Buff City Soap is terminated, effective 11/08/2026, due to repeated no-call no-shows on 11/3, 11/5 and 11/7.",
  "",
  "Sincerely,",
  "Dolores Whitcombe",
  "District Manager",
].join("\n");
const REQUEST = `I need an exit form with this information. ${LETTER}`;

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-08T18:00:00Z"));
  t.directory([...STAFF, MARCUS]);
  t.as("district_manager", { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] });
  return t.thread();
}

export const NOV12_RESENT_REQUEST_IS_YES_CASES: ReplayCase[] = [
  {
    id: "nov12-resent-exit-request-keeps-name",
    title: "the exit request sent again after \"Is this for **Marcus Tellefsen**?\": the exit card for Marcus Tellefsen, never \"Who is this … for?\"",
    report: "QA, 12 Nov 2026 (found on production's flags): resending the request after the name question lost the name",
    status: { open: "\"Who is this **Resignation/Exit Form** for?\"" },
    fixFlags: ["RESENT_REQUEST_IS_YES_ENABLED"],
    async run(t) {
      const thread = start(t);
      const first = await thread.say(REQUEST);
      expect(first.content).toMatch(/Is this for \*\*Marcus Tellefsen\*\*\?/);
      const again = await thread.say(REQUEST);
      expect(again.content, `the name was lost:\n${again.content}`).not.toMatch(/Who is this \*\*Resignation\/Exit Form\*\* for\?/);
      expect(thread.proposal, `no exit card for Marcus Tellefsen:\n${again.content}`).toMatchObject({ templateKey: "resignation-exit", employeeName: "Marcus Tellefsen" });
    },
  },
  {
    id: "nov12-resent-exit-request-no-is-still-no",
    title: "guard: \"no\" after \"Is this for **Marcus Tellefsen**?\" is never read as the request again",
    report: "QA, 12 Nov 2026 (the guard)",
    status: "fixed",
    fixFlags: ["RESENT_REQUEST_IS_YES_ENABLED"],
    async run(t) {
      const thread = start(t);
      await thread.say(REQUEST);
      const no = await thread.say("no");
      expect(thread.proposal?.employeeName ?? null, `"no" kept the name:\n${no.content}`).not.toBe("Marcus Tellefsen");
    },
  },
];
