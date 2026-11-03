import { expect } from "vitest";

import { noClaimWithoutUpdate, STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/** The West Dodge Rd Location Manager and an Assistant Manager at her store, 30 Oct 2026 (two chats rated 2 stars). */
export const OCT30_CASES: readonly ReplayCase[] = [
  {
    id: "oct30-am-role",
    title: "an Assistant Manager asks for a coaching form",
    report: '"coaching form" → "Your role cannot create a **Coaching Form**" (twice that evening)',
    status: "fixed",
    async run(t) {
      t.directory(STAFF);
      t.as("assistant_manager", WEST_DODGE);
      for (const turn of ["coaching form", "can you create a weekly coaching form using the promotions from the most recent weekly newsletter, make it for a week, on days there is no sale use google review"]) {
        const reply = await t.thread().say(turn);
        expect(reply.content).not.toContain("Your role cannot create");
        expect(reply.formProposal?.templateKey).toBe("coaching");
      }
    },
  },
  {
    id: "oct30-do-the-same",
    title: '"Do the same coaching form for <another>" carries the Details',
    report: "\"I'd like it to copy and paste a coaching form but change the employee name and position\"",
    status: "fixed",
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("Create a coaching form for Marnie Holloway");
      t.draftWrites({ coaching_details: "Ship From Store: print packing slips and pin them on the rolling rack, first come first serve." });
      await thread.create();
      await thread.say("Do the same coaching form for remy calder");
      t.draftWrites({});
      const remy = await thread.create();
      expect(t.values(remy).coaching_details).toContain("rolling rack");
    },
  },
  ...["yes, do that", "the details we just discussed!!!"].map(
    (turn): ReplayCase => ({
      id: `oct30-refers-back-${turn.startsWith("yes") ? "do-that" : "discussed"}`,
      title: `"${turn}" with the draft open writes the offered Details`,
      report: '"it would never automatically put it in the coaching form, I had to copy and paste it myself"',
      status: { open: "FORM_EDIT_REFERS_BACK_ENABLED is off in production" },
      fixFlags: ["FORM_EDIT_REFERS_BACK_ENABLED"],
      async run(t) {
        t.directory(STAFF);
        t.as("location_manager", WEST_DODGE);
        const thread = t.thread();
        await thread.say("Create a coaching form for Remy Calder");
        t.draftWrites({ coaching_details: "" });
        await thread.create();
        t.modelSays(
          "Marking an order as Shipped is meant to happen only once the guest is in the store.\n\n**Details of Coaching:** \"Remy marked a guest's order as Shipped before the guest had picked it up.\"\n\nWant me to put that on the card?",
        );
        await thread.say("ship from store, when to press ready for pick up and when to press mark as shipped");
        t.modelSays(null);
        t.revisionWrites({ coaching_details: "Remy marked a guest's order as Shipped before the guest had picked it up." });
        const reply = await thread.say(turn);
        expect(reply.formUpdate?.updated ?? []).toContain("coaching_details");
      },
    }),
  ),
  {
    id: "oct30-claims",
    title: "the answer's \"Updating the draft now.\" / \"That's on the card.\" with nothing written",
    report: "\"Updating the draft now … That's on the card\" while the card was unchanged",
    status: { open: "FORM_EDIT_REFERS_BACK_ENABLED is off in production" },
    fixFlags: ["FORM_EDIT_REFERS_BACK_ENABLED"],
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("Create a coaching form for Remy Calder");
      t.draftWrites({ coaching_details: "" });
      await thread.create();
      t.modelSays("Updating the draft now.\n\n**Details of Coaching:** \"Remy marked an order shipped early.\"\n\nThat's on the card.");
      noClaimWithoutUpdate(await thread.say("what else should go on it?"));
    },
  },
];
