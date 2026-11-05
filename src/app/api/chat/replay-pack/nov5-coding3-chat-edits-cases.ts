import { expect } from "vitest";

import { STAFF, WEST_DODGE, noClaimWithoutUpdate, replyMatchesDiff, savedForm, type ReplayAnswer, type ReplayCase, type ReplayContext, type ReplayThread } from "./cases";

/**
 * ============================================================================
 * CODING 3 — "EDITS SAID IN CHAT NEVER REACH THE CARD" (both apps, 5 Nov 2026)
 * ============================================================================
 *
 * A manager's exact production wording (people invented; Rowan Kestrel is the
 * pack's STAFF):
 *
 *   (a) "can you upate the draft with these details of coaching?" →
 *       "it didnt edit in the card" → "the details we just discussed!!!"
 *   (b) "i don't see the details updated in the draft card.  Do i need to copy
 *       and paste it?  or should it be automatically updating?"
 *
 * EXTENDS nov3-stepb-make-that-update and nov3-stepb-write-the-observation
 * (`nov3-step-b-cases.ts`), which give the details AFTER Create and run with
 * Step B's flags. What those do not cover, and these cases do, with
 * production's flags only (no fix exists yet, so no fixFlags):
 *
 *   1. The details were discussed BEFORE the card: the bot's own how-to answer
 *      held them, then the card, then (a). "these details" and "the details
 *      we just discussed" are read from the LAST reply only
 *      (`form-content-turn.ts` previousAnswer: the card, then the bot's own
 *      "I haven't changed …"). Step B and the edit tool accept the last reply
 *      only as an offer, so with their flags on too nothing writes the
 *      answer's details (replayed 5 Nov 2026).
 *   2. The manager's own account given before "Create a coaching form.".
 *      HOLDS HERE ("fixed"): this app has no THIS_PERSONS_TURNS_ENABLED, so the
 *      drafting model is handed the account. In the sibling app that flag is on and
 *      starts the draft's turns at the request, so the same case is open
 *      there; kept here as the guard for the day that flag is ported.
 *   3. (b) answered truthfully. The live answer's "It should update
 *      automatically — no copy-and-paste needed" goes out as it is: the
 *      honest-reply guard (FORM_EDIT_HONEST_REPLY_ENABLED, CLAIM_GUARD_ENABLED,
 *      `honestFormReply`) reads claims from a list of phrasings, and this one
 *      ("copy-and-paste", "update automatically", "the details are on the
 *      draft card") is not on it. Where the guard does catch a claim, its reply
 *      invites "make that update" — which then writes nothing, because that
 *      reply is the "previous answer" it reads (replayed 5 Nov 2026).
 *
 * The drafting and revision models are the pack's stand-ins (they write
 * nothing) unless a case says otherwise, as in production's reports.
 * Invariants only: what is SAVED, what is CLAIMED, and what the drafting
 * model is HANDED.
 */

type T = ReplayContext;

/** The ship-from-store coaching details the bot gave as a how-to answer, before any card (the live answer's shape). */
const HOW_TO_ANSWER = [
  "Here's how to coach on ship from store:",
  "**Details of Coaching:** Press **Ready for Pick Up** only once the order is packed and on the pickup shelf. Press **Mark as Shipped** only after the order has left the store with the carrier.",
].join("\n\n");
const IN_THE_ANSWER = [/packed and on the pickup shelf/i, /left the store with the carrier/i];

/** What Rowan did, in the b17 mechanism's wording here (as `nov3-step-b-cases.ts`). */
const ROWAN_DID = "rowan marked an order as shipped but the customer hadn't picked up yet";
const SAID = /rowan marked an order as shipped but the customer hadn't picked up yet/i;

/** The bot's own lines — the card, a no-change reply, an honest reply — are never the form's content. */
const BOTS_OWN_WORDS = /Here is what I would put|I haven't changed|Nothing on the form has changed|Tell me which part to change|Create the draft here/i;

function start(t: T) {
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
}

/** One turn on the open draft: no claim without a change, and the bot's own lines never written into it. */
async function onDraft(t: T, thread: ReplayThread, id: string, text: string): Promise<ReplayAnswer> {
  const before = savedForm(t, id);
  const reply = await thread.say(text);
  replyMatchesDiff(t, id, before, reply, text);
  if (savedForm(t, id) === before) noClaimWithoutUpdate(reply);
  expect(t.values(id).coaching_details ?? "", `"${text}": the bot's own reply was written into the Details`).not.toMatch(BOTS_OWN_WORDS);
  return reply;
}

export const NOV5_CODING3_CHAT_EDITS_CASES: ReplayCase[] = [
  {
    id: "nov5-coding3-these-details-answered-before-the-card",
    title:
      "(a) the coaching details the bot gave BEFORE the card: \"can you upate the draft with these details of coaching?\" → \"it didnt edit in the card\" → \"the details we just discussed!!!\" put them on Rowan's draft",
    report:
      'Manager, production (relayed 5 Nov 2026, both apps): "can you upate the draft with these details of coaching?" → "it didnt edit in the card" → "the details we just discussed!!!"',
    status: {
      open: "the Details stay empty: \"these details\" / \"the details we just discussed\" are read from the last reply (the card, then the bot's own no-change reply), never the earlier answer that held them",
    },
    async run(t: T) {
      start(t);
      const thread = t.thread();
      t.modelSays(HOW_TO_ANSWER);
      await thread.say("how do i coach on ship from store, when to press ready for pick up and when to press mark as shipped?");
      t.modelSays(null);
      await thread.say("Create a coaching form for Rowan Kestrel");
      expect(thread.proposal, "no Coaching Form card for Rowan Kestrel").toMatchObject({ templateKey: "coaching", employeeName: "Rowan Kestrel" });
      const id = await thread.create();
      for (const turn of ["can you upate the draft with these details of coaching?", "it didnt edit in the card", "the details we just discussed!!!"]) {
        await onDraft(t, thread, id, turn);
      }
      const details = t.values(id).coaching_details ?? "";
      for (const step of IN_THE_ANSWER) {
        expect(details, `after "the details we just discussed!!!" the Details do not hold the coaching details discussed before the card (${step})`).toMatch(step);
      }
    },
  },
  {
    id: "nov5-coding3-account-before-the-request-reaches-the-draft",
    title: "the account she gave before \"Create a coaching form.\" is what the draft is written from",
    report:
      'Manager, production (relayed 5 Nov 2026, both apps), the b17 mechanism with the account given first: "<name> marked <a thing> as <done> but <it wasn\'t>" → "Create a coaching form." → … → "can you upate the draft with these details of coaching?"',
    // Holds with this app's production flags (no THIS_PERSONS_TURNS_ENABLED here); open in the sibling app.
    status: "fixed",
    async run(t: T) {
      start(t);
      const thread = t.thread();
      await thread.say(ROWAN_DID);
      const asked = await thread.say("Create a coaching form.");
      // Asked "Is this for Rowan Kestrel?" (read from her account), she says yes.
      expect(asked.content, "the form request did not ask whether it is for Rowan Kestrel").toMatch(/Rowan Kestrel/);
      await thread.say("yes");
      expect(thread.proposal, "no Coaching Form card for Rowan Kestrel").toMatchObject({ templateKey: "coaching", employeeName: "Rowan Kestrel" });
      /*
       * The live drafting model writes what it is handed; the stand-in writes
       * her account. The prompt assertion is the real check: had the prompt
       * not held it, the live model could not have written it.
       */
      t.draftWrites({ coaching_details: `Observed:\n${ROWAN_DID}` });
      const id = await thread.create();
      expect(t.draftPrompts().at(-1) ?? "", "the drafting model was not handed her account").toMatch(SAID);
      await onDraft(t, thread, id, "can you upate the draft with these details of coaching?");
      expect(t.values(id).coaching_details ?? "", "the draft does not say what Rowan did").toMatch(SAID);
    },
  },
  {
    id: "nov5-coding3-copy-paste-question-told-the-truth",
    title:
      "(b) \"i don't see the details updated in the draft card. Do i need to copy and paste it? …\" is answered truthfully, and the \"make that update\" it invites writes her account",
    report:
      'Manager, production (relayed 5 Nov 2026, both apps): "i don\'t see the details updated in the draft card.  Do i need to copy and paste it?  or should it be automatically updating?"',
    status: {
      open: "the live answer \"It should update automatically — no copy-and-paste needed\" is sent unchanged with nothing written (the claim guard's phrase list misses it); past that, the \"make that update\" the honest reply invites writes nothing",
    },
    async run(t: T) {
      start(t);
      const thread = t.thread();
      for (const turn of ["Create a coaching form.", "Rowan", "yes"]) await thread.say(turn);
      expect(thread.proposal, "no Coaching Form card for Rowan Kestrel").toMatchObject({ templateKey: "coaching", employeeName: "Rowan Kestrel" });
      const id = await thread.create();
      await onDraft(t, thread, id, ROWAN_DID);
      // What the live answering model said to (b) (this app's live check, 31 Oct 2026, `form-content-turn.ts`).
      t.modelSays("It should update automatically — no copy-and-paste needed. The details are on the draft card.");
      const asked = await onDraft(
        t,
        thread,
        id,
        "i don't see the details updated in the draft card.  Do i need to copy and paste it?  or should it be automatically updating?",
      );
      t.modelSays(null);
      // Written by now: the truthful answer needs nothing more.
      if (SAID.test(t.values(id).coaching_details ?? "")) return;
      expect(asked.content, "the reply to (b) says it updates by itself though nothing was written").not.toMatch(
        /no copy[- ]?(?:and[- ])?paste needed|updates? automatically|details are on the draft/i,
      );
      // Her next turn in the report: what the reply invites.
      await onDraft(t, thread, id, "make that update");
      expect(t.values(id).coaching_details ?? "", 'after "make that update" the draft does not say what Rowan did').toMatch(SAID);
    },
  },
];
