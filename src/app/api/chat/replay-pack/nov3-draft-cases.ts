import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/** QA's live check in the sibling app with the open-draft flags, 3 Nov 2026, kept here too. */
export const NOV3_DRAFT_CASES: readonly ReplayCase[] = [
  {
    id: "nov3-open-coaching-draft-duplicate-card",
    title: "with a Coaching draft open, \"I talked to her about it last week\" does not offer a second card for her",
    report:
      'Coaching draft open; "when should an order be marked as shipped?" → "yes, do that" → "I talked to her about it last week" showed a NEW Coaching proposal card for the same person with a Create draft button (QA live check)',
    // Seen in the sibling app (QA, 3 Nov 2026, 01:52 UTC). Here it holds with or without OPEN_DRAFT_KEEPS_TURNS_ENABLED (on since 04:20); kept so it stays that way.
    status: "fixed",
    fixFlags: ["OPEN_DRAFT_KEEPS_TURNS_ENABLED"],
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("create a coaching form for remy calder");
      if (thread.proposal?.status !== "ready") await thread.say("she keeps skipping the soap restock checklist at close");
      expect(thread.proposal).toMatchObject({ templateKey: "coaching", employeeName: "Remy Calder" });
      t.draftWrites({});
      const first = await thread.create();
      const replies = [];
      for (const turn of ["when should an order be marked as shipped?", "yes, do that", "I talked to her about it last week"]) {
        replies.push(await thread.say(turn));
      }
      for (const [index, reply] of replies.entries()) {
        expect(reply.formProposal, `reply ${index + 1} offered a new card with her draft open`).toBeUndefined();
      }
      expect(t.forms().filter((row) => row.employee_name === "Remy Calder")).toHaveLength(1);
      expect(t.forms().map((row) => row.id)).toContain(first);
    },
  },
];
