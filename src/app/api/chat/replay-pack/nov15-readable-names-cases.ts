import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * NAMES READ AS THEY ARE WRITTEN, AND FOUND HOWEVER THEY ARE TYPED (READABLE_NAMES_ENABLED)
 * ============================================================================
 *
 * Pau, 15 Nov 2026 (via QA): "all naming conventions should be readable; some have de la Torre etc." A name typed off
 * the roster was cut at its particle ("jacinta van") and kept as typed, and a roster surname with spaces was not found
 * when typed without them ("maria delatorre"). With the flag: the typed name is whole and readable on the card, and the
 * roster's spelling is found from the squashed one. Port of Ask Sunny's cases (its agent-loop cases have no
 * counterpart here). Every person is invented (on no directory).
 */

const MARIA: DirectoryRow = { id: "e-maria-delatorre-rn", firstName: "Maria", lastName: "de la Torre", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const REPORT = "Pau via QA, 15 Nov 2026: \"all naming conventions should be readable; some have de la Torre etc.\"";
const FLAG = "READABLE_NAMES_ENABLED";

export const NOV15_READABLE_NAMES_CASES: ReplayCase[] = [
  {
    id: "nov15-readable-names-squashed-surname",
    title: "\"create a ca for maria delatorre, she was late on 11/12\": the surname typed without its spaces is the roster's Maria de la Torre",
    report: REPORT,
    // Already so with the flag off: the close-spelling check asks "Is this for **Maria de la Torre**?". With the flag the
    // matcher reads the squashed surname as hers outright (readable-name.test.ts); this app's card still asks once.
    status: "fixed",
    fixFlags: [FLAG],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-14T16:00:00Z"));
      t.directory([...STAFF, MARIA]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("create a ca for maria delatorre, she was late on 11/12", { employeeName: "maria delatorre" });
      expect(`${thread.proposal?.employeeName ?? ""} ${reply.content}`).toContain("Maria de la Torre");
      expect(reply.content).not.toMatch(/maria delatorre/i);
    },
  },
  {
    id: "nov15-readable-names-typed-off-roster",
    title: "\"create a ca for jacinta van der berg, she was late on 11/12\" (not on the roster): the card's name is \"Jacinta van der Berg\"",
    report: REPORT,
    status: { open: "the name is cut at its particle (\"jacinta van\")" },
    fixFlags: [FLAG],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-14T16:00:00Z"));
      t.directory([...STAFF, MARIA]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      let reply = await thread.say("create a ca for jacinta van der berg, she was late on 11/12", { employeeName: "jacinta van der berg" });
      // The card asks who the form is for, or offers the name as typed; the answer is the name alone, then "use <name>".
      if (!thread.proposal?.employeeName) reply = await thread.say("jacinta van der berg", { employeeName: "jacinta van der berg" });
      if (!thread.proposal?.employeeName && /reply \*\*use /.test(reply.content)) reply = await thread.say("use jacinta van der berg", { employeeName: "jacinta van der berg" });
      expect(thread.proposal?.employeeName, reply.content).toBe("Jacinta van der Berg");
    },
  },
];
