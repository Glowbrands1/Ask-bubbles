import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";
import { LIVE_T3_ANSWER, T3, pauSfB6People } from "./nov5-pau-sf-b6-cases";

/**
 * sf-b6's card half (Pau via QA, 5 Nov 2026; QA, 10 Nov 2026): after the request and "can you have it include that we
 * recieved a customer complaint …", "Create a Corrective Action Form from this conversation." built a card — and a
 * draft — without the added detail: the card's turns leave out every turn that reads as a question unless it names the
 * employee. Here only that half is asserted (the reply's "I can prepare:" ending is nov5-sf-b6-reply-full-sentence).
 */
export const NOV10_SF_B6_ADDED_DETAIL_CASES: ReplayCase[] = [
  {
    id: "nov10-sf-b6-card-carries-added-detail",
    title: "sf-b6: \"Create … from this conversation\" makes a card that shows, and drafts from, the detail added on turn 3",
    report: "Pau via QA, 5 Nov 2026 (this app's production, 4 Nov), sf-b6: the next card ignored the detail added on turn 3",
    status: { open: "the card's turns are the request and \"Create …\" only; the turn-3 detail is neither on the card nor handed to the draft" },
    fixFlags: ["ADDED_DETAIL_KEPT_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-04T23:30:00Z"));
      t.directory([...STAFF, ...pauSfB6People()]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("Which forms can I create here?");
      await thread.say("I need a corrective action form for Wynne Sarrow for counting the drawer early and turning away a customer");
      t.modelSays(LIVE_T3_ANSWER);
      await thread.say(T3);
      t.modelSays(null);
      const card = await thread.say("Create a Corrective Action Form from this conversation.");
      expect(thread.proposal, `no Corrective Action card:\n${card.content}`).toMatchObject({ templateKey: "dpoa", employeeName: "Wynne Sarrow" });
      expect(card.content, `the card ignores the detail added on turn 3:\n${card.content}`).toMatch(/4:56|customer complaint/i);
      t.draftWrites({});
      await thread.create();
      expect(t.draftPrompts().at(-1) ?? "", "the draft was not handed the detail added on turn 3").toMatch(/4:56pm/);
    },
  },
];
