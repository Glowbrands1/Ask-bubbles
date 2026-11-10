import { expect, vi } from "vitest";

import { WEST_DODGE, STAFF, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * OCTOBER TRIAGE #5 — PRIOR ACTIONS TYPED WITH NO COMMA (#187, ported from the sibling app)
 * ============================================================================
 *
 * The triage table's wording (the employee invented): "prior coaching verbal 6/25 written 7/28 no deduct" listed
 * "Written warning — verbal 6/25 — 07/28/2026", and "perf ca <employee> 270 units below goal upt atv verbal prior
 * coachings 9/8 9/15 9/25 no deduct" listed "Coaching — 9/8 — 09/15/2026" and "Coaching — 9/8 9/15 — 09/25/2026".
 * PRIOR_ACTIONS_NO_COMMA_ENABLED (`forms/prior-actions.ts`).
 *
 * The request lead is "create a corrective action for <employee>, …": this app gives no card yet for "ca for …" or
 * "perf ca …" (a separate triage item), so with those leads no Prior actions line is ever shown. The prior-action
 * words are the table's, unchanged.
 */

const TAMSIN: DirectoryRow = {
  id: "e-nov10-no-comma-tamsin",
  firstName: "Tamsin",
  lastName: "Oakridge",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};

const TURNS: { id: string; said: string; rows: string[] }[] = [
  {
    id: "verbal-then-written",
    said: "create a corrective action for tamsin oakridge, late today. prior coaching verbal 6/25 written 7/28 no deduct",
    rows: ["Verbal warning — 06/25/2026", "Written warning — 07/28/2026"],
  },
  {
    id: "coaching-date-run",
    said: "create a corrective action for tamsin oakridge, 270 units below goal upt atv. prior coachings 9/8 9/15 9/25 no deduct",
    rows: ["Coaching — 09/08/2026", "Coaching — 09/15/2026", "Coaching — 09/25/2026"],
  },
];

export const PRIOR_ACTIONS_NO_COMMA_FIX = "PRIOR_ACTIONS_NO_COMMA_ENABLED";

export const NOV10_PRIOR_ACTIONS_NO_COMMA_CASES: ReplayCase[] = TURNS.map(({ id, said, rows }) => ({
  id: `nov10-prior-actions-no-comma-${id}`,
  title: `#5: "${said}" → Prior actions ${rows.map((row) => `"${row}"`).join(", ")}, nothing garbled`,
  report: `October triage #5 (#187, ported from the sibling app): "${said}" → a date read into the next step's description`,
  status: { open: "a date is read into the next step's description" },
  fixFlags: [PRIOR_ACTIONS_NO_COMMA_FIX],
  async run(t) {
    vi.setSystemTime(new Date("2026-10-26T15:00:00Z"));
    t.directory([...STAFF, TAMSIN]);
    t.as("location_manager", WEST_DODGE);
    const thread = t.thread();
    const reply = await thread.say(said);
    const prior = /\*\*Prior actions:\*\*[^\n]*/.exec(reply.content)?.[0] ?? "";
    for (const row of rows) expect(prior, `"${row}" is not in Prior actions:\n${reply.content}`).toContain(row);
    expect(prior, `a date is read into a step's description:\n${reply.content}`).not.toMatch(/— (?:verbal |written )?\d{1,2}\/\d{1,2}(?: \d{1,2}\/\d{1,2})* —/i);
  },
}));
