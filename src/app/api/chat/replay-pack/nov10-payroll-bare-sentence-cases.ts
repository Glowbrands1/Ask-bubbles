import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * "PAYROLL DEDUCTION." IS THE ANSWER, YES (ported from the sibling app, its P15, 9 Nov 2026)
 * ============================================================================
 *
 * The sibling app's manager's words, verbatim except the person (invented: Delphine Marrow). The card still asked "Is payroll
 * deduct applicable?" and the created form's Payroll Deduct box was blank (there the manager ticked Yes by hand).
 * PAYROLL_BARE_SENTENCE_ENABLED. ("term" — the Termination level — waits on a ruling: chat never ticks Termination.)
 */

const DELPHINE: DirectoryRow = {
  id: "e-pb-delphine-marrow",
  firstName: "Delphine",
  lastName: "Marrow",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};

/** The invented person of this file (a function: the registry reads exported arrays as cases). */
export function payrollBareSentencePeople(): readonly DirectoryRow[] {
  return [DELPHINE];
}

const P15 = "I need a term CA for Delphine Marrow. Didn't show up for her opening shift. Payroll deduction.";

export const NOV10_PAYROLL_BARE_SENTENCE_CASES: ReplayCase[] = [
  {
    id: "nov10-p15-payroll-deduction-sentence-is-yes",
    title: "P15: \"… Payroll deduction.\": the card never asks the payroll question, and Create ticks Payroll Deduct Yes",
    report: 'QA, 10 Nov 2026 (the sibling app\'s P15): "I need a term CA for <name>. Didn\'t show up for her opening shift. Payroll deduction." → "Is payroll deduct applicable?"',
    status: { open: "the card asks \"Is payroll deduct applicable?\" and the created form's Payroll Deduct box is blank" },
    fixFlags: ["PAYROLL_BARE_SENTENCE_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-09T16:35:00Z"));
      t.directory([...STAFF, DELPHINE]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say(P15);
      expect(thread.proposal, `no CA card for Delphine Marrow:\n${reply.content}`).toMatchObject({ employeeName: "Delphine Marrow" });
      expect(reply.content, "the card asks the payroll question the manager answered").not.toMatch(/Is payroll deduct applicable\?\*\* Yes or No\?/i);
      const id = await thread.create();
      expect(t.checked(id).payroll_deduct ?? [], "Payroll Deduct is not Yes").toEqual(["yes"]);
    },
  },
];
