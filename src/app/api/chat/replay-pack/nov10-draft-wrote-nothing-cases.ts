import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * A BLANK DRAFT IS SAID (ported from the sibling app: QA's r21 live check there, 10 Nov 2026)
 * ============================================================================
 *
 * QA's wording, the person invented (Odessa Pennick): "make me a coaching form for <name>" → the app asked "What
 * happened?" → Create saved only the Name and Date, with no "Nothing was saved" notice. No account, so the drafting
 * model wrote no Details DRAFT_WROTE_NOTHING_NOTICE_ENABLED.
 */

const ODESSA: DirectoryRow = {
  id: "e-wn-odessa-pennick",
  firstName: "Odessa",
  lastName: "Pennick",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};

/** The invented person of this file (a function: the registry reads exported arrays as cases). */
export function draftWroteNothingPeople(): readonly DirectoryRow[] {
  return [ODESSA];
}

const notices = (replies: readonly Record<string, unknown>[]) => replies.map((reply) => String(reply.notice ?? "")).join("\n");

export const NOV10_DRAFT_WROTE_NOTHING_CASES: ReplayCase[] = [
  {
    id: "nov10-r21-name-only-coaching-blank-draft-is-said",
    title: "r21: \"make me a coaching form for <name>\" → Create with no account: the draft says its details are blank, never a silent blank",
    report: 'QA, 10 Nov 2026 (r21 live, conv 13:24Z): name-only coaching card ("make me a coaching form for <T>", app asked "What happened?"), Create → saved only Name+Date, no notice',
    status: { open: "Create saves no Details and the draft's reply says nothing about it" },
    fixFlags: ["DRAFT_WROTE_NOTHING_NOTICE_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-10T13:24:00Z"));
      t.directory([...STAFF, ODESSA]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("make me a coaching form for Odessa Pennick");
      t.draftWrites({});
      const id = await thread.create();
      expect(t.values(id).coaching_details ?? "", "the stand-in wrote Details").toBe("");
      expect(notices(t.draftReplies!()), "a blank draft, said nothing").toMatch(/details are blank/i);
    },
  },
  {
    id: "nov10-draft-wrote-nothing-control-account-given",
    title: "control: with an account, the draft writes Details and no blank notice",
    report: "coding 6, 10 Nov 2026: DRAFT_WROTE_NOTHING_NOTICE_ENABLED's negative control",
    status: "fixed",
    fixFlags: ["DRAFT_WROTE_NOTHING_NOTICE_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-10T13:24:00Z"));
      t.directory([...STAFF, ODESSA]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("make me a coaching form for Odessa Pennick, she missed the monthly meeting on 11/5/26");
      t.draftWrites({ coaching_details: "Observed:\nOdessa missed the monthly meeting on 11/5/26." });
      await thread.create();
      expect(notices(t.draftReplies!())).not.toMatch(/details are blank/i);
    },
  },
];
