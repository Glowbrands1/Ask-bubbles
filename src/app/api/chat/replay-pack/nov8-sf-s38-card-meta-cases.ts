import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * sf-s38 (QA's morning scan, 8 Nov 2026; the sibling app's production, 7 Nov 16:14–16:23Z; checked here the same day)
 * ============================================================================
 *
 * The manager's words, the employee swapped for an invented one (the pack's STAFF):
 *   T1 (sent twice) "make me an CA for <A> missing her saturday and sunday shifts due to wanting to go home for the
 *      weekend but failed to communicate proporley" → the Corrective Action card;
 *   (1) "create it" and "create  the draft" each sent the same proposal text again; the draft was only made by the
 *       card's button;
 *   (2) "this proposal is out od fate" became "**Observation of Offense:** this proposal is out od fate";
 *   (3) the card itself was for "<A> missing": that is coding 4's reader cut (ACCOUNT_VERB_NOT_A_NAME, its own cases).
 * Changed on purpose (coding 2, 8 Nov 2026; QA parked CARD_NAME_THEN_WORDS_CURRENT): these cases no longer run with a
 * name fix, so they check that each turn keeps the SAME card the manager had, whatever name it reads; (3) is not here.
 * Here (main 084829d, production's flags plus flips 6 and 8) the card itself was for "<A> missing" and Create made the
 * form for "<A> missing"; "create it" and the complaint were answered as policy questions with no card.
 */
const T1 = "make me an CA for Rowan Kestrel missing her saturday and sunday shifts due to wanting to go home for the weekend but failed to communicate proporley";
const FIX = ["CREATE_COMMAND_POINTS_TO_CARD_ENABLED", "CARD_COMPLAINT_NOT_ACCOUNT_ENABLED"];
const PROPOSAL_TEXT = /I'll draft a \*\*Corrective Action Form\*\* for \*\*Rowan Kestrel\*\*/;
const PRESS = /press \*\*Create draft\*\* on the card/i;
const REPORT = "QA's sf-s38, 8 Nov 2026 (the sibling app's production; the same wording here)";

async function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-07T16:14:00Z"));
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  await thread.say(T1);
  await thread.say(T1);
  expect(thread.proposal?.templateKey, "no Corrective Action card").toBe("dpoa");
  // The card's own reading of the name (Rowan Kestrel, or "Rowan Kestrel missing" until the reader cut is on).
  const card = { templateKey: "dpoa", employeeName: thread.proposal?.employeeName };
  expect(card.employeeName ?? "", "the card is for someone else").toMatch(/^Rowan Kestrel/);
  return { thread, card };
}

export const NOV8_SF_S38_CARD_META_CASES: ReplayCase[] = [
  {
    id: "nov8-sf-s38-create-it",
    title: "sf-s38 (1): \"create it\" and \"create  the draft\" say to press Create draft, never the same proposal text again",
    report: REPORT,
    status: { open: "each is answered as a policy question, with no card" },
    fixFlags: FIX,
    async run(t) {
      const { thread, card } = await start(t);
      for (const said of ["create it", "create  the draft"]) {
        const reply = await thread.say(said);
        expect(reply.content, `"${said}" sent the proposal again:\n${reply.content}`).not.toMatch(PROPOSAL_TEXT);
        expect(reply.content, `"${said}" does not say how to create it:\n${reply.content}`).toMatch(PRESS);
        expect(reply.formProposal, `"${said}" lost the card`).toMatchObject(card);
      }
    },
  },
  {
    id: "nov8-sf-s38-out-od-fate",
    title: "sf-s38 (2): \"this proposal is out od fate\" asks what to change, and is never the Observation",
    report: REPORT,
    status: { open: "\"this proposal is out od fate\" becomes the card's Observation of Offense" },
    fixFlags: FIX,
    async run(t) {
      const { thread, card } = await start(t);
      await thread.say("create it");
      const reply = await thread.say("this proposal is out od fate");
      expect(reply.content, `the complaint is the Observation:\n${reply.content}`).not.toMatch(/out od fate/i);
      expect(reply.content, `the complaint is not acknowledged:\n${reply.content}`).toMatch(/What on the proposal is out of date\?/);
      expect(reply.formProposal, "the card was lost").toMatchObject(card);
      t.draftWrites({ observation: "Observed:\nRowan Kestrel missed her Saturday and Sunday shifts and did not communicate it." });
      const id = await thread.create();
      expect(t.values(id).observation ?? "", "the account was lost at Create").toMatch(/saturday/i);
      expect(t.values(id).observation ?? "", "the complaint reached the draft").not.toMatch(/out od fate|proposal/i);
    },
  },
];
