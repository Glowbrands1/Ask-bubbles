import { expect } from "vitest";

import type { ReplayCase } from "./cases";

/**
 * Replay set b2 (Ask Bubbles feedback, Oct 2026; the employee's name is
 * invented): the employee was named by first name in an account, the form was
 * asked for in a later turn, and "Yes" to "Is this for <full name>?" turned
 * the conversation back into the account alone — no card, the request lost.
 */
const GRAND_ISLAND = "loc-236";

export const NOV3_FIRST_NAME_YES_CASES: readonly ReplayCase[] = [
  {
    id: "nov3-b2-yes-keeps-request",
    title: "\"Yes\" to \"Is this for <name>?\" keeps the form the manager asked for in a later turn",
    report:
      "Replay set b2: \"I have an employee <first name> at our Grand Island location who has been out of dress code three shifts …\" → \"Create a Coaching Form from this conversation.\" → \"Is this for <name>?\" → \"Yes\" → no card",
    status: { open: "the answer becomes the account alone and the form request is lost" },
    fixFlags: ["FIRST_NAME_YES_KEEPS_REQUEST_ENABLED"],
    async run(t) {
      t.directory([
        { id: "e-b2", firstName: "Odessa", lastName: "Ferncliff", preferredFirstName: null, employmentStatus: "active", locationIds: [GRAND_ISLAND], positionName: "Team Member Part Time" },
      ]);
      t.as("location_manager", { level: "location", primaryAreaId: GRAND_ISLAND, alsoCoversAreaIds: [] });
      const thread = t.thread();
      await thread.say(
        "I have an employee Odessa at our Grand Island location who has been out of dress code three shifts. I verbally coached her on the second offense and she still is out of dress code",
      );
      await thread.say("Create a Coaching Form from this conversation.");
      const reply = await thread.say("Yes");
      expect(reply.formProposal, `no card after "Yes": ${reply.content.slice(0, 200)}`).toMatchObject({
        templateKey: "coaching",
        employeeName: "Odessa Ferncliff",
        locationId: GRAND_ISLAND,
      });
    },
  },
];
