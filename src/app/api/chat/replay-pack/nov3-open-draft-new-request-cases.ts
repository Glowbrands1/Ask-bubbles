import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/** QA's live check in the sibling app, 3 Nov 2026 (fresh chat); the same race reproduces here. */
export const NOV3_OPEN_DRAFT_NEW_REQUEST_CASES: readonly ReplayCase[] = [
  {
    id: "nov3-open-draft-new-request",
    title: "with her draft open, a new request for the same person with a new incident is its own card, and the open draft is untouched",
    report:
      '"a CA" → "<name> failed to take trash out and put rugs out untl 12;30pm" → Create → "make me a CA for <name> for being late to opening this morning" → "Redrafted the Corrective Action Form …", the open draft rewritten with both incidents (QA live check)',
    status: { open: "the new request is written into the open draft" },
    fixFlags: ["NEW_REQUEST_OPEN_DRAFT_ENABLED"],
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("a CA");
      await thread.say("Rowan Kestrel failed to take trash out and put rugs out untl 12;30pm");
      expect(thread.proposal).toMatchObject({ templateKey: "dpoa", employeeName: "Rowan Kestrel" });
      t.draftWrites({ observation: "Rowan did not take the trash out or put the rugs out until 12:30pm." });
      const first = await thread.create();
      // As in the sibling app (04:25:06–04:25:16 UTC): the next message came before the first draft was saved.
      t.draftNotYetSaved(first);
      const before = JSON.stringify(t.values(first));
      const reply = await thread.say("make me a CA for Rowan Kestrel for being late to opening this morning");
      expect(JSON.stringify(t.values(first)), "the open draft was rewritten").toBe(before);
      expect(reply.formUpdate, "the open draft was changed").toBeUndefined();
      expect(reply.formProposal, "no card of its own for the new incident").toMatchObject({ templateKey: "dpoa", employeeName: "Rowan Kestrel" });
      // Create for it then reuses the open draft here (CONVERSATION_DRAFT_REUSE is on in this app's
      // production): DRAFT_REUSE_NEW_REQUEST_ENABLED gives it its own draft (replay case nov2-p2).
    },
  },
];
