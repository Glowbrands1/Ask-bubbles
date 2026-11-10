import { expect, vi } from "vitest";

import { WEST_DODGE, STAFF, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * OCTOBER TRIAGE #15 — "BC" IS NOT PART OF THE EMPLOYEE'S NAME (the sibling app #250; same reader here)
 * ============================================================================
 *
 * "crete a ca for <first> <last> bc she didnt do the deep clean i assignd by 9-15" → "I'll draft a **Corrective
 * Action Form** for **<First> <Last> Bc**". "bc" (because) was read as a third name word, since "she" after it ends a
 * name. The reporter's wording is kept; the employee is invented (Tamsin Oakridge), both on and off the roster.
 *
 * "crete" is spelled "create" here: this app does not yet read "crete a ca" as a request at all (no card), which
 * is a separate triage item; with it the name is never read, so the case could not show this bug.
 */

const TURN = "create a ca for tamsin oakridge bc she didnt do the deep clean i assignd by 9-15";
const TAMSIN: DirectoryRow = {
  id: "e-nov10-bc-tamsin",
  firstName: "Tamsin",
  lastName: "Oakridge",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};

export const BECAUSE_NOT_A_NAME_FIX = "BECAUSE_NOT_A_NAME_ENABLED";

export const NOV10_BECAUSE_NOT_A_NAME_CASES: ReplayCase[] = [true, false].map((onRoster) => ({
  id: `nov10-because-not-a-name-${onRoster ? "on-roster" : "off-roster"}`,
  title: `#15: "${TURN}" (${onRoster ? "on" : "off"} the roster) → the employee is "Tamsin Oakridge", never "Tamsin Oakridge Bc"`,
  report: `October triage #15 (the sibling app #250; same reader here): "${TURN}" → "I'll draft a **Corrective Action Form** for **Tamsin Oakridge Bc**"`,
  status: { open: 'the employee is "Tamsin Oakridge Bc"' },
  fixFlags: [BECAUSE_NOT_A_NAME_FIX],
  async run(t) {
    vi.setSystemTime(new Date("2026-10-26T15:00:00Z"));
    t.directory(onRoster ? [...STAFF, TAMSIN] : [...STAFF]);
    t.as("location_manager", WEST_DODGE);
    const thread = t.thread();
    const reply = await thread.say(TURN);
    expect(thread.proposal?.templateKey, `no Corrective Action card:\n${reply.content}`).toBe("dpoa");
    // Case-insensitive: off the roster this app keeps the typed lower case, a separate triage item (#1).
    expect((thread.proposal?.employeeName ?? "").toLowerCase(), reply.content).toBe("tamsin oakridge");
    expect(reply.content).not.toMatch(/\*\*Tamsin Oakridge Bc\*\*/i);
  },
}));
