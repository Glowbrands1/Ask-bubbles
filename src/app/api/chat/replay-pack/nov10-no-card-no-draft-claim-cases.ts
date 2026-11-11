import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * NO CARD, NO CLAIM THAT A DRAFT IS OPEN (#164, rebuilt 10 Nov 2026)
 * ============================================================================
 *
 * QA B22-2 (25 Oct 2026, production): after <A>'s Corrective Action, "now one for <B>, Store Associate, late today"
 * got "A new Corrective Action Form draft is open for <B> … press Finalize on the card", and no card or draft existed.
 * The October triage (docs/parity-log/oct-pr-triage.md, 10 Nov 2026), with production's flags: still no card, and the
 * answering model's claim (scripted to the B22 reply) comes back unchanged. NO_CARD_NO_DRAFT_CLAIM_ENABLED replaces the
 * claim with one honest line. (In the sibling app the claim is gone on main; there the guard is not needed.)
 *
 * The triage's invented names: Wren Calloway is <A>; Remy Calder (the pack's STAFF) is <B>.
 */
const WREN: DirectoryRow = {
  id: "e-nocard-wren-calloway",
  firstName: "Wren",
  lastName: "Calloway",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};
const B22_REPLY =
  "A new Corrective Action Form draft is open for Remy Calder, Store Associate, for being late today. Review it and press Finalize on the card when you're ready.";
const CLAIM = /draft is open for remy calder|press finalize on the card/i;

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-10-25T15:00:00Z"));
  t.directory([...STAFF.filter((row) => row.lastName !== "Calloway"), WREN]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV10_NO_CARD_NO_DRAFT_CLAIM_CASES: ReplayCase[] = [
  {
    id: "nov10-no-card-no-draft-claim-b22",
    title: "B22-2: after Wren Calloway's CA is created, \"now one for Remy Calder, Store Associate, late today\" never claims a draft is open for Remy when no card came back",
    report: 'QA B22-2 (25 Oct 2026; #164; the October triage, 10 Nov 2026): "now one for Remy Calder, Store Associate, late today" → "A new Corrective Action Form draft is open for Remy Calder … press Finalize on the card", no card',
    status: { open: "the answering model's claim that a draft is open for Remy Calder, and its \"press Finalize on the card\", go out unchanged with no card" },
    fixFlags: ["NO_CARD_NO_DRAFT_CLAIM_ENABLED"],
    async run(t) {
      const thread = start(t);
      await thread.say("I need a corrective action for Wren Calloway, she was late opening the store on Monday");
      expect(thread.proposal, "no CA card for Wren Calloway").toMatchObject({ templateKey: "dpoa", employeeName: "Wren Calloway" });
      t.draftWrites({ observation: "Observed:\nWren Calloway opened the store late on Monday." });
      await thread.create();
      t.modelSays(B22_REPLY);
      const reply = await thread.say("now one for Remy Calder, Store Associate, late today");
      t.modelSays(null);
      if (reply.formProposal) return; // A card for Remy is the other fix (SECOND_PERSON_ACCOUNT_WORDS_ENABLED); no claim to check.
      expect(reply.content, `a draft is claimed for Remy with no card:\n${reply.content}`).not.toMatch(CLAIM);
    },
  },
];
