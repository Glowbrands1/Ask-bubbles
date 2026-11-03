import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/** The sibling app's 2 Nov scan, data-loss reports (P1): what the manager typed must reach the form she keeps. The same mechanism here. */
export const NOV2_DATA_LOSS_CASES: readonly ReplayCase[] = [
  {
    id: "nov2-p1a-policy-turn-drops-account",
    title: "a turn naming only the policy does not leave the manager's account out of the draft",
    report:
      "\"Details managers had typed were lost. On one form, a redraft replaced her specific note with 'does not describe a specific incident.'\"",
    // Holds here with production's flags (replayed 3 Nov 2026); open in the sibling app, where a metric is read as a person.
    status: "fixed",
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("Can you make a written CA for remy calder on performance");
      await thread.say("She had 24 transactions and was below in Below in PPTA, LPSVA, average ticket, and units per transaction");
      await thread.say("the policy would be must see behaviors on woven");
      expect(thread.proposal?.employeeName).toBe("Remy Calder");
      t.draftWrites({});
      await thread.create();
      expect(t.draftPrompts().at(-1), "the draft was written without her account").toContain("24 transactions");
    },
  },
  {
    id: "nov2-p1b-next-message-new-draft",
    title: "the next message about the open draft does not start a new draft",
    report:
      "\"Details managers had typed were lost … her next message started a new draft without what she'd typed, and that generic version is the one that got finalized.\"",
    // Holds here with production's flags (replayed 3 Nov 2026); open in the sibling app.
    status: "fixed",
    fixFlags: ["OPEN_DRAFT_KEEPS_TURNS_ENABLED"],
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("I need to create a verbal corrective action form");
      await thread.say("Remy Calder");
      expect(thread.proposal?.employeeName).toBe("Remy Calder");
      t.draftWrites({});
      const first = await thread.create();
      t.typeOnForm(first, { observation: "Remy was below the store average in October on every metric we track." });
      t.revisionWrites({ observation: "Remy was below the store average in October on every metric we track — underperformance for the month of October." });
      const reply = await thread.say("underperformance for the month of october");
      expect(t.forms().filter((row) => row.employee_name === "Remy Calder"), "a second draft was started").toHaveLength(1);
      expect(reply.formProposal, "a new card was offered for the open draft").toBeUndefined();
      expect(t.values(first).observation).toContain("below the store average");
    },
  },
];
