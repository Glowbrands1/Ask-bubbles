import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { REFUSAL_ROSTER } from "./nov7-step-b-refusals-scenarios";

/**
 * ============================================================================
 * A FORM THE LIBRARY DOES NOT HAVE IS SAID SO, WITH THE FORMS THAT EXIST (board f099, QA, 23 Nov 2026; the old chat)
 * ============================================================================
 *
 * The board's report, in its own words: asking for a form that doesn't exist ("store manager interview") re-offered the
 * open Coaching card instead of saying that form doesn't exist and listing what does. The original turns were not found
 * (the tester's cases and a read-only search of the stored chats hold none), so the turns below use the board's wording.
 * The turn's own words ask for a form outside the library (`namesFormNotInLibrary`): the reply names it in the
 * manager's words, trimmed to the form's name, says it isn't in the library, and lists the forms this person can create;
 * no card is proposed, so the open card stays as it was. The pack's invented person.
 */

const REPORT = "Board f099 (QA, 23 Nov 2026, the old chat): asking for a form that doesn't exist (\"store manager interview\") re-offered the open Coaching card";
const COACHING = "create a coaching form for Marnie Holloway, she was late to her shift on 11/8/26";
/*
 * CHANGED ON PURPOSE (Pau, 23 Nov: BCS terms in the forms; QA's #1112 review): the interviews are published now, so
 * "store manager interview form" finds them by name. They cannot be started in the chat, so the reply names them and
 * sends the manager to Forms (`namedFormsNotInChatReply`): never a card, never a swap to another form, and an open card
 * stays as it was. Before 23 Nov the reply was "There's no store manager interview form in the forms library, so I can't
 * start it. …": no interview was published then.
 */
const FOUND_NOT_IN_CHAT = /^The forms library has the .*\*\*First Round Management Interview Form\*\* and \*\*Second Round Management Interview Form\*\*, but they can't be started in the chat yet: start one from \*\*Forms\*\*\./;

type Reply = { content: string; formProposal?: { templateKey?: string } | null; formSelection?: { primary?: { templateKey?: string }; additional?: unknown[] } };

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-10T14:00:00Z"));
  t.directory(REFUSAL_ROSTER);
  t.as("location_manager", WEST_DODGE);
}

export const NOV23_F099_FORM_NOT_IN_LIBRARY_CASES: ReplayCase[] = [
  {
    id: "nov23-f099-open-coaching-card-store-manager-interview",
    title: "f099: a Coaching card open, \"can you make a store manager interview form\": says there's no such form and lists the forms that exist; the Coaching card is not offered again",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const thread = t.thread();
      const card = (await thread.say(COACHING)) as Reply;
      expect(card.formProposal?.templateKey, "the Coaching card did not open (the case proves nothing)").toBe("coaching");
      const reply = (await thread.say("can you make a store manager interview form")) as Reply;
      expect(reply.formProposal ?? null, `the open card was offered again:\n${reply.content}`).toBeNull();
      /* With a card on screen the forms menu is left off (NO_SELECTION_ON_OPEN_CARD), so the reply names the forms and says the card is still open. */
      expect(reply.content, reply.content).toMatch(FOUND_NOT_IN_CHAT);
      expect(reply.content, reply.content).toMatch(/Your Coaching Form card is still open above\.$/);
      expect(reply.content, "a swap to the Prescreen").not.toMatch(/Prescreen/);
    },
  },
  {
    id: "nov23-f099-fresh-chat-store-manager-interview",
    title: "f099: a fresh chat, \"create a store manager interview form for Marnie Holloway\": says there's no such form and lists the forms that exist; no card",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const reply = (await t.thread().say("create a store manager interview form for Marnie Holloway")) as Reply;
      expect(reply.formProposal ?? null, reply.content).toBeNull();
      expect(reply.content, reply.content).toMatch(FOUND_NOT_IN_CHAT);
      expect(reply.content, "the whole message was echoed, not the form's name").not.toMatch(/Marnie/);
      expect(reply.content, "a swap to the Prescreen").not.toMatch(/Prescreen/);
    },
  },
  {
    id: "nov23-f099-control-interview-as-a-fact-stays-on-card",
    title: "Control: a Coaching card open, \"she also skipped her interview training on 11/9\" is a fact for the card, never \"no such form\"",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const thread = t.thread();
      await thread.say(COACHING);
      const reply = (await thread.say("she also skipped her interview training on 11/9")) as Reply;
      expect(reply.content, reply.content).not.toMatch(/in the forms library/);
      expect(reply.formProposal?.templateKey, reply.content).toBe("coaching");
    },
  },
];
