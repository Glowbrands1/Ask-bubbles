import { expect, vi } from "vitest";

import { WEST_DODGE, STAFF, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * A COACHING FORM ASKED FOR WELL AFTER A CORRECTIVE ACTION SAYS WHERE THE NAME CAME FROM (QA's round-6 item, 8 Nov
 * 2026; KEPT_REQUEST_SAME_FORM_ENABLED)
 * ============================================================================
 *
 * Ported from the sibling app (QA's round-6 item there; the same turns as corrective-action-chat-edits-e2e "carries …
 * into a Coaching Form asked for well after she was named", the person invented). With REQUEST_KEPT_IN_WINDOW on (#576)
 * the Corrective Action request is kept in the Coaching card's window: the card still names the person, but no longer
 * says "I took <A> from earlier in this conversation — if this form is for somebody else, tell me who."
 */
const PERSON: DirectoryRow = {
  id: "e-briar-castellane",
  firstName: "Briar",
  lastName: "Castellane",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};

/** The invented person of this file (a function: the registry reads exported arrays as cases). */
export function keptRequestSameFormPeople(): readonly DirectoryRow[] {
  return [PERSON];
}

const TURNS = [
  "create corrective action for Briar Castellane for Late Opening from the policy manual. It is a verbal warning",
  "can you add late opening policy to the direct policy section of this form",
  "I have independently verified and the policy is correct",
  "what does the manual say about reimbursing the company?",
  "how much is the late opening fee?",
  "and who pays for client restitution?",
  "ok thanks",
] as const;

const FIX = [
  "REQUEST_KEPT_IN_WINDOW_ENABLED",
  "NEXT_PUBLIC_REQUEST_KEPT_IN_WINDOW_ENABLED",
  "KEPT_REQUEST_SAME_FORM_ENABLED",
  "NEXT_PUBLIC_KEPT_REQUEST_SAME_FORM_ENABLED",
  "CARRIED_PERSON_NOTICE_ENABLED",
];

function start(t: Parameters<ReplayCase["run"]>[0]) {
  vi.setSystemTime(new Date("2026-10-20T15:00:00Z"));
  t.directory([...STAFF, PERSON]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV8_KEPT_REQUEST_SAME_FORM_CASES: ReplayCase[] = [
  {
    id: "nov8-kept-request-coaching-says-where-the-name-came-from",
    title: "\"Create a Coaching Form from this conversation.\" well after a Corrective Action for <A>: the card is <A>'s and says the name came from earlier",
    report: "QA's round-6 item, 8 Nov 2026 (the round-5 gate on #576): with REQUEST_KEPT_IN_WINDOW on, the carried person's notice is gone (a silent carry-over)",
    // This app's production does not run REQUEST_KEPT_IN_WINDOW yet (#576), so the notice shows: fixed. The fix-flag run
    // turns it on with this file's flags; without them, corrective-action-chat-edits-e2e's row shows the silent carry-over.
    status: "fixed",
    // KEPT_REQUEST_SAME_FORM keeps the CA request out of the Coaching card's window, and CARRIED_PERSON_NOTICE says
    // where the person came from, whichever reader put them on the card (in the sibling app, also INTENT_EXTRACTION and
    // SLOT_RETENTION drop the notice on the route).
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      for (const turn of TURNS) await thread.say(turn);
      const reply = await thread.say("Create a Coaching Form from this conversation.");
      expect(thread.proposal?.templateKey, `no Coaching card:\n${reply.content}`).toBe("coaching");
      expect(thread.proposal?.employeeName, `the card is for someone else:\n${reply.content}`).toBe("Briar Castellane");
      expect(reply.content, `a silent carry-over:\n${reply.content}`).toMatch(/I took \*\*Briar Castellane\*\* from earlier in this conversation/);
      // A policy line on this Coaching card is not asserted: in the sibling app it comes from its live citation flags
      // reading the policy the conversation discussed (coding 2's bisect, 8 Nov 2026), not from the window (QA to decide).
    },
  },
  {
    id: "nov8-kept-request-coaching-named-now-no-notice",
    title: "must not change: \"Create a Coaching Form for <A> from this conversation.\" names the person in its own turn, so no notice",
    report: "QA's round-6 item, 8 Nov 2026 (the negative)",
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      for (const turn of TURNS) await thread.say(turn);
      const reply = await thread.say("Create a Coaching Form for Briar Castellane from this conversation.");
      expect(thread.proposal?.employeeName, `the card is for someone else:\n${reply.content}`).toBe("Briar Castellane");
      expect(reply.content, `a notice for a name typed in this very turn:\n${reply.content}`).not.toMatch(/from earlier in this conversation/);
    },
  },
  {
    id: "nov8-kept-request-ca-named-recently-no-notice",
    title: "must not change: a Corrective Action asked for two turns after the person was named says nothing about earlier turns",
    report: "QA's round-6 item, 8 Nov 2026 (the negative)",
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      await thread.say("Briar Castellane opened the store 40 minutes late on 10/19");
      await thread.say("what does the manual say about late opening?");
      const reply = await thread.say("Create a Corrective Action Form from this conversation.");
      expect(thread.proposal?.employeeName, `the card is for someone else:\n${reply.content}`).toBe("Briar Castellane");
      expect(reply.content, `a notice for a name in the last turns:\n${reply.content}`).not.toMatch(/from earlier in this conversation/);
    },
  },
];
