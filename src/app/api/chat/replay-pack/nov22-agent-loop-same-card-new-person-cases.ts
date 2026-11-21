import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_FENNA, LOOP_STAFF, LOOP_THADDEA } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * "MAKE THIS FOR <B> INSTEAD OF <A>" CARRIES THE ACCOUNT ON SCREEN (QA's Bubbles round 2, 22 Nov 2026, U21)
 * ============================================================================
 *
 * The manager's turns, word for word (the people invented, `loop-roster.ts`): T1 "corrective action", T2 "<A>", T3 "This
 * is what happened: She has recieved coaching on 9/22 for cleaning tasks not being completed. What was observed this
 * weekend is that trash liners were not put into the trash cans after collecting trash, laundry was not done", …, T9 "no
 * i want this to be a corrective action for a new person now", T10 "make this for <B-first> instead of <A-first>". In one
 * of QA's two runs T10 answered "this new Corrective Action is for <B>. What happened?": the account on screen was dropped.
 *
 * Mechanism: the model passes `same_card_evidence`, the manager's words in this message asking for the card on screen
 * (or this chat's latest card of the form, by the server's record) for this person. It counts as asking for a form for
 * this person (the person guard). With no account from the model the card goes back once, to be proposed with that
 * card's account as the chat shows it, with this person's name (the records keep no account text, QA's c163); the fact
 * `copied_from_card` says so, and that a level and payroll answer are the manager's to state for this person.
 */

const REPORT = "QA's Bubbles round 2 (22 Nov 2026, U21): \"make this for <B> instead of <A>\" started from nothing (\"What happened?\") instead of carrying the account on screen";
const T1 = "corrective action";
const T2 = "Fenna Prewitt";
const T3 =
  "This is what happened: She has recieved coaching on 9/22 for cleaning tasks not being completed. What was observed this weekend is that trash liners were not put into the trash cans after collecting trash, laundry was not done";
const T9 = "no i want this to be a corrective action for a new person now";
const T10 = "make this for Thaddea instead of Fenna";
const ACCOUNT_A = "Fenna Prewitt did not put trash liners into the trash cans after collecting trash this weekend, and laundry was not done.";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
}

const issueOf = (proposal: unknown) => (proposal as { issue?: string | null } | null)?.issue ?? "";
const said = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).at(-1)?.text ?? "";

/** The live model through T10: A's card with the account; at T9 a question; at T10 B's card with no account (`withEvidence`: the manager's ask quoted). */
const live = (withEvidence: boolean) => {
  let handedBack = false;
  return loopStandIn((view): LoopDecision => {
    const message = said(view);
    const last = lastResult(view, "propose_form") as { reason_code?: string; facts?: { copied_from_card?: { say_exactly?: string } } } | null;
    if (last?.reason_code === "same_card_account_missing") handedBack = true;
    if (last && last.reason_code !== "same_card_account_missing") return { text: ["Here's the Corrective Action Form.", last.facts?.copied_from_card?.say_exactly ?? ""].join(" ").trim() };
    if (message === T1) return { text: "This Corrective Action Form needs a person. Who is it for?" };
    if (message === T9) return { text: "Got it — who is the new corrective action for?" };
    if (message === T10) {
      return {
        tool: "propose_form",
        input: {
          template_key: "dpoa",
          employee_id: LOOP_THADDEA.id,
          policy: headingWith(view, /standards of conduct/i),
          person_evidence: evidenceFrom(view, "Thaddea"),
          ...(withEvidence ? { same_card_evidence: evidenceFrom(view, T10) } : {}),
          /* Handed back: the account of the card on screen, as the chat shows it, with B's name (what a model reads back). */
          ...(handedBack ? { what_happened: ACCOUNT_A.replace("Fenna Prewitt", "Thaddea Kroll") } : {}),
        },
      };
    }
    return {
      tool: "propose_form",
      input: { template_key: "dpoa", employee_id: LOOP_FENNA.id, policy: headingWith(view, /standards of conduct/i), person_evidence: evidenceFrom(view, "Fenna Prewitt", message === T2 ? 0 : 1), ...(message === T3 ? { what_happened: ACCOUNT_A } : {}) },
    };
  });
};

export const NOV22_AGENT_LOOP_SAME_CARD_NEW_PERSON_CASES: ReplayCase[] = [
  {
    id: "nov22-u21-make-this-for-new-person-carries-account",
    title: "U21: T9 \"no i want this to be a corrective action for a new person now\", T10 \"make this for <B> instead of <A>\" — <B>'s card carries the account on screen with <B>'s name, never \"What happened?\"",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const thread = t.thread();
      const model = live(true);
      t.loopModel!(model);
      await thread.say(T1);
      await thread.say(T2);
      await thread.say(T3);
      expect(issueOf(thread.proposal), "the case proves nothing: A's card has no account").toMatch(/trash liners/);
      await thread.say(T9);
      await thread.say(T10);
      expect(thread.proposal?.employeeName, "the card is not B's").toBe("Thaddea Kroll");
      expect(issueOf(thread.proposal), "B's card dropped the account on screen").toMatch(/Thaddea did not put trash liners/);
      expect(issueOf(thread.proposal), "A's name stayed in B's account").not.toMatch(/Fenna/);
      const result = model.views.map((view) => lastResult(view, "propose_form")).filter(Boolean).at(-1) as { facts?: Record<string, unknown> } | undefined;
      expect(result?.facts?.copied_from_card, "the reply is not told the account was copied").toBeTruthy();
      const handBacks = model.views.filter((view) => (lastResult(view, "propose_form") as { reason_code?: string } | null)?.reason_code === "same_card_account_missing");
      expect(handBacks.length, "the card with no account was never handed back").toBeGreaterThan(0);
    },
  },
  {
    id: "nov22-u21-no-same-card-evidence-no-copy",
    title: "U21, control: <B>'s card with neither an account nor the manager's ask for the card on screen copies nothing (the card asks what happened)",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const thread = t.thread();
      t.loopModel!(live(false));
      await thread.say(T1);
      await thread.say(T2);
      await thread.say(T3);
      await thread.say(T9);
      await thread.say(T10);
      expect(thread.proposal?.employeeName === "Thaddea Kroll" ? issueOf(thread.proposal) : "").not.toMatch(/trash liners/);
    },
  },
];
