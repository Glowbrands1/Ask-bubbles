import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * OCTOBER TRIAGE #9 — "WRITE CA" AND "… NEEDS CA" ARE REQUESTS FOR THE FORM (#181)
 * ============================================================================
 *
 * #181's wording: "an employee opened the store 15 min late and needs CA" and "write ca" got a process answer and no
 * card. The same gap left "crete a ca for <employee> …" and "writen ca <employee> …" with no card (the sibling app's
 * #250 and #285 wording, the employee invented). CA_SHORTHAND_REQUEST_ENABLED (`forms/template-intent.ts`).
 */

const TAMSIN: DirectoryRow = {
  id: "e-nov10-ca-shorthand-tamsin",
  firstName: "Tamsin",
  lastName: "Oakridge",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};

const REQUESTS: { id: string; said: string; employee: string | null }[] = [
  { id: "needs-ca", said: "an employee opened the store 15 min late and needs CA", employee: null },
  { id: "write-ca", said: "write ca", employee: null },
  { id: "crete-a-ca", said: "crete a ca for tamsin oakridge she didnt do the deep clean i assignd by 9-15", employee: "Tamsin Oakridge" },
  { id: "writen-ca", said: "writen ca tamsin oakridge not atending monthly meeting 10-20-26", employee: "Tamsin Oakridge" },
];

// "she doesn't need a ca" (with the article) already opens a card on production's flags through "need a", a separate gap.
const NOT_REQUESTS = ["she doesn't need ca for this", "do i need a ca for this?"];

export const CA_SHORTHAND_REQUEST_FIX = "CA_SHORTHAND_REQUEST_ENABLED";

export const NOV10_CA_SHORTHAND_REQUEST_CASES: ReplayCase[] = [
  ...REQUESTS.map(({ id, said, employee }): ReplayCase => ({
    id: `nov10-ca-shorthand-request-${id}`,
    title: `#9: "${said}" → a Corrective Action card${employee ? ` for ${employee}` : ""}, not a process answer`,
    report: `October triage #9 (#181): "an employee opened the store 15 min late and needs CA" and "write ca" → a process answer and no card`,
    status: { open: "a process answer and no card" },
    fixFlags: [CA_SHORTHAND_REQUEST_FIX],
    async run(t) {
      vi.setSystemTime(new Date("2026-10-26T15:00:00Z"));
      t.directory([...STAFF, TAMSIN]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say(said);
      expect(thread.proposal?.templateKey ?? null, `no Corrective Action card:\n${reply.content}`).toBe("dpoa");
      if (employee) expect(thread.proposal?.employeeName ?? null, reply.content).toBe(employee);
    },
  })),
  ...NOT_REQUESTS.map((said, i): ReplayCase => ({
    id: `nov10-ca-shorthand-request-guard-${i + 1}`,
    title: `#9 guard: "${said}" → no card`,
    report: "October triage #9 (#181): a negation or a question is not a request",
    status: "fixed",
    fixFlags: [CA_SHORTHAND_REQUEST_FIX],
    async run(t) {
      vi.setSystemTime(new Date("2026-10-26T15:00:00Z"));
      t.directory([...STAFF, TAMSIN]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say(said);
      expect(thread.proposal ?? null, `a card nobody asked for:\n${reply.content}`).toBeNull();
    },
  })),
];
