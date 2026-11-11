import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";
import { OTTOLINE } from "./nov7-step-b-refusals-scenarios";

/**
 * ============================================================================
 * A DRAFT WRITE IS NEVER LOST IN SILENCE (QA's live finding on the sibling app's round 17, 10 Nov 2026; port)
 * ============================================================================
 *
 * "create a coaching form for <invented First Last>, she missed the monthly meeting on 10/10/26" → Create: one in five
 * saved only the Name and Date, with Details, Other and the topic empty and a 200 from the draft route. The drafting
 * model had run. The one writer is all or nothing: a single refused field drops every value. Here the draft's write
 * carries one stray field (`t.draftWriteCarries`) that the REAL writer refuses; QA's wording is verbatim and the person
 * is invented (Ottoline Ormsworth).
 */

const SAID = "create a coaching form for Ottoline Ormsworth, she missed the monthly meeting on 10/10/26";
const FIX = "DRAFT_WRITE_NEVER_SILENT_ENABLED";

export const NOV10_DRAFT_WRITE_NEVER_SILENT_CASES: ReplayCase[] = [
  {
    id: "nov10-draft-write-refused-field-never-drops-the-draft",
    title: `"${SAID}" → Create, one field of the draft refused: the rest of the draft is SAVED (Details non-empty)`,
    report: `QA, 10 Nov 2026 (the sibling app's round 17, live, intermittent; port): "${SAID.replace("Ottoline Ormsworth", "<invented First Last>")}" → Create saved only employee_name and form_date`,
    status: { open: "one refused field drops the whole draft: only the Name and Date are saved" },
    fixFlags: [FIX],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-10T06:30:00Z"));
      t.directory([...STAFF, OTTOLINE]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say(SAID);
      t.draftWrites({ coaching_details: "Observed:\nOttoline missed the monthly meeting on 10/10/26." });
      t.draftWriteCarries!("stray_field");
      const id = await thread.create();
      const saved = t.values(id);
      expect(saved.coaching_details ?? "", `the saved Details are empty:\n${JSON.stringify(saved)}`).toMatch(/monthly meeting/i);
      expect(Object.keys(saved).filter((key) => saved[key]).length, `only the Name and Date were saved:\n${JSON.stringify(saved)}`).toBeGreaterThan(2);
    },
  },
];
