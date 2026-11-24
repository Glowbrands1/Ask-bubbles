import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_FENNA, LOOP_OZREN, LOOP_STAFF, LOOP_THADDEA } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * "DO THE SAME COACHING FORM FOR <B>": THE SAVED DETAILS ARE THE CARD'S (QA's live re-test, 21 Nov 2026, item 24)
 * ============================================================================
 *
 * Pau's account, the agent loop on. A Coaching card for <A> was built from the manager's own ship-from-store steps,
 * then "Do the same coaching form for <B>" gave <B> a card with those same steps. After Create, <B>'s saved Coaching
 * Details held long text the manager never gave (orders shown as "Pickup", a 2pm cutoff, hourly checks, BOPIS before
 * SFS).
 *
 * Where it came from: the draft route's implicit copy (SAME_FORM_COPY_ENABLED, `lib/forms/same-form-copy.ts`). The
 * loop's card cites the manager's turn that names <B> ("Do the same coaching form for <B>"), so that turn is the last of
 * the notes Create sends, it reads as a copy request, and with <A>'s card never created the copy took this manager's
 * NEWEST other Coaching Form: an older one, about something else, written over the card. A loop card carries its own
 * account (the loop already copied <A>'s account onto <B>'s card, as the rules book says), so the card is what is saved.
 *
 * The managers' turns are QA's, verbatim, with invented people (`loop-roster.ts`): <A> Fenna Prewitt, <B> Ozren Brack,
 * and Thaddea Kroll for the manager's older, unrelated Coaching Form.
 */

const REPORT =
  "QA's live re-test (21 Nov 2026, Pau's account, agent loop on, production 3e2c30dd), item 24 (C5): \"The saved draft differs from the card\"";

const CREATE_A = "create a coaching form for Fenna Prewitt";
const DETAILS =
  "this is what i am wanting to coach on: managing our ship from store operation, here are the details of the process: print packing slip, use rolling rack and use clips to pin them in order of first come first serve. Pick and customize products, pack, once the order is ready, then print shipping label";
const ADD = "add details about the rolling rack";
const MAKE = "make that update";
const SAME_FOR_B = "Do the same coaching form for Ozren Brack";

/** The card's account: the manager's own steps (and, once asked, the rolling rack detail in the manager's words). */
const STEPS =
  "Coaching on managing the ship from store operation: print the packing slip, use the rolling rack and use clips to pin them in order of first come first serve; pick and customize products, pack, and once the order is ready, print the shipping label.";
const STEPS_WITH_RACK = `${STEPS} On the rolling rack, the packing slips are pinned with clips in order of first come first serve.`;

/** The manager's OLDER Coaching Form, for somebody else and about something else: never what <B>'s form is drafted from. */
const OLDER_DETAILS = "Observed:\nThaddea processed orders shown as Pickup after the 2pm cutoff, skipped the hourly ShipStation checks and filled BOPIS before SFS on 11/10.";
const OLDER_ACCOUNT = "Thaddea Kroll processed orders shown as Pickup after the 2pm cutoff, skipped the hourly ShipStation checks and filled BOPIS before SFS on 11/10.";
const OLDER_WORDS = /pickup|2\s*pm|cutoff|hourly|shipstation|bopis/i;

const lastSaid = (view: LoopView) => view.turns.filter((turn) => turn.role === "user").at(-1)?.text ?? "";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-20T22:40:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
}

/** The loop's model, as the rules book teaches it: one Coaching card per person, the account in the manager's words. */
function standIn() {
  return loopStandIn((view): LoopDecision => {
    const said = lastSaid(view);
    const card = lastResult(view, "propose_form") as { card?: unknown; ask_exactly?: string; error?: string } | null;
    if (card) return { text: card.card ? "Here's the Coaching Form." : card.ask_exactly ?? card.error ?? "" };
    if (/thaddea/i.test(said)) {
      return { tool: "propose_form", input: { template_key: "coaching", employee_id: LOOP_THADDEA.id, what_happened: OLDER_ACCOUNT, person_evidence: evidenceFrom(view, "thaddea kroll") } };
    }
    if (said === CREATE_A) return { text: "What would you like to coach Fenna on?" };
    if (said === DETAILS) {
      return { tool: "propose_form", input: { template_key: "coaching", employee_id: LOOP_FENNA.id, what_happened: STEPS, person_evidence: evidenceFrom(view, "Fenna Prewitt", 1), request_evidence: [evidenceFrom(view, "this is what i am wanting to coach on")] } };
    }
    if (said === ADD) {
      return { tool: "propose_form", input: { template_key: "coaching", employee_id: LOOP_FENNA.id, what_happened: STEPS_WITH_RACK, person_evidence: evidenceFrom(view, "Fenna Prewitt", 2), request_evidence: [evidenceFrom(view, "this is what i am wanting to coach on", 1), evidenceFrom(view, "add details about the rolling rack")] } };
    }
    if (said === MAKE) return { text: "Updated the card: the rolling rack detail is in." };
    if (said === SAME_FOR_B) {
      // A new request after an earlier card for someone else: the rules book asks for new_form_evidence, and with
      // CARD_PERSON_THIS_REQUEST_ENABLED (ON in production since 21 Nov 2026 13:31Z) a card for another person without
      // it is refused (person_change_not_asked). The stand-in passes it as the live model is taught to.
      return { tool: "propose_form", input: { template_key: "coaching", employee_id: LOOP_OZREN.id, what_happened: STEPS_WITH_RACK, person_evidence: evidenceFrom(view, "Ozren Brack"), new_form_evidence: evidenceFrom(view, SAME_FOR_B) } };
    }
    return { text: "Tell me more." };
  });
}

export const NOV21_AGENT_LOOP_SAME_COACHING_SAVED_AS_CARD_CASES: ReplayCase[] = [
  {
    id: "nov21-agent-loop-same-coaching-saved-as-card",
    title:
      "\"create a coaching form for <A>\" → the ship-from-store steps → \"add details about the rolling rack\" → \"make that update\" → \"Do the same coaching form for <B>\" → Create: <B>'s saved Coaching Details are the card's steps, never the manager's older Coaching Form for someone else",
    report: `${REPORT}: the card for <B> showed the manager's own SFS steps, the saved coaching_details held BOPIS/ShipStation text the manager never gave`,
    status: "fixed",
    fixFlags: ["AGENT_LOOP_ENABLED"],
    async run(t) {
      start(t);
      t.loopModel!(standIn());

      // The manager's older Coaching Form, for somebody else: this account's newest other Coaching Form.
      const older = t.thread();
      await older.say(`coaching form for thaddea kroll, ${OLDER_ACCOUNT.toLowerCase().replace(/^thaddea kroll /, "she ")}`);
      expect(older.proposal?.employeeName, "the older card was not made (the case proves nothing)").toBe("Thaddea Kroll");
      t.draftWrites({ coaching_details: OLDER_DETAILS });
      const olderId = await older.create();
      const olderSaved = t.values(olderId).coaching_details ?? "";
      expect(olderSaved, "the older form has no Details (the case proves nothing)").toMatch(/BOPIS/);

      const thread = t.thread();
      await thread.say(CREATE_A);
      await thread.say(DETAILS);
      expect(thread.proposal?.employeeName, "no Coaching card for <A>").toBe("Fenna Prewitt");
      await thread.say(ADD);
      await thread.say(MAKE);
      const reply = await thread.say(SAME_FOR_B);
      expect(reply.formProposal, `no Coaching card for <B>:\n${reply.content}`).toMatchObject({ templateKey: "coaching", employeeName: "Ozren Brack" });
      const card = (thread.proposal as { issue?: string } | null)?.issue ?? "";
      expect(card, "<B>'s card does not show the manager's steps").toMatch(/packing slip/i);

      t.draftWrites({
        coaching_details:
          "Observed:\nOzren was coached on managing the ship from store operation: print the packing slip, use the rolling rack and use clips to pin them in order of first come first serve; pick and customize products, pack, and once the order is ready, print the shipping label.\n\nExpectation:\nOzren follows each step of the ship from store process in order.",
      });
      const id = await thread.create();
      expect(id, "Create wrote over the older form").not.toBe(olderId);
      const saved = t.values(id).coaching_details ?? "";
      expect(saved, `the saved Details are not the card's steps:\n${saved}`).toMatch(/packing slip/i);
      expect(saved, `the saved Details carry text the manager never gave:\n${saved}`).not.toMatch(OLDER_WORDS);
      expect(saved, "the saved Details name another person").not.toMatch(/thaddea|kroll/i);
      // The drafting model was handed the card's steps, and nothing of the older form.
      const handed = t.draftPrompts().at(-1) ?? "";
      expect(handed, "the drafting model was not handed <B>'s card").toMatch(/packing slip/i);
      expect(handed, "the drafting model was handed the older form's text").not.toMatch(OLDER_WORDS);
      expect(t.values(olderId).coaching_details, "the older form changed").toBe(olderSaved);
    },
  },
  {
    id: "nov21-agent-loop-same-coaching-not-loop-still-copies",
    title: "control: the app's own path (loop off for this manager) still copies the manager's earlier Coaching Form on \"Do the same coaching form for <B>\" (SAME_FORM_COPY_ENABLED unchanged)",
    report: `${REPORT}; the fix is for the loop's card only`,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-20T22:40:00Z"));
      t.directory([...LOOP_STAFF]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("create a coaching form for Fenna Prewitt, she leaves the packing slips off the rolling rack at close");
      expect(thread.proposal?.employeeName, "no card for <A> (the case proves nothing)").toBe("Fenna Prewitt");
      t.draftWrites({ coaching_details: "Observed:\nFenna Prewitt leaves the packing slips off the rolling rack at close." });
      const first = await thread.create();
      expect(t.values(first).coaching_details ?? "").toMatch(/rolling rack/);
      await thread.say(SAME_FOR_B);
      expect(thread.proposal?.employeeName, "no card for <B> on the app's own path").toBe("Ozren Brack");
      t.draftWrites({ coaching_details: "Observed:\nCoaching for Ozren Brack." });
      const id = await thread.create();
      expect(t.values(id).coaching_details ?? "", "the app's own copy no longer runs").toMatch(/rolling rack/);
    },
  },
];
