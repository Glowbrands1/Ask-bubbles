import { expect, vi } from "vitest";

import type { DirectoryRow, ReplayCase, ReplayContext } from "./cases";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * AN EXIT CARD'S REPLY READS BACK ONLY WHAT CREATE SAVES (QA's Bubbles round 2, 22 Nov 2026, U22)
 * ============================================================================
 *
 * The manager's turns, word for word (a global district manager; the people invented, the former employee on no directory
 * but this case's; the address QA's test one): T1 "create exit for <P17>. <P17>'s last day worked was TBD. On 11-14-26
 * General Manager, <P18>, messaged <P17> via woven regarding her hours worked on 11-13-26. <P17> messaged back stating she
 * did not work 11-13-26 and she was quitting effective immediately.", T2 "address: 123 Test St, Lees Summit, MO. 00000".
 * The T2 reply read back "**Date that notice was given:** 11/14/2026" (never stated; not saved) and "**Reason for
 * Resignation:** <the account>" (saved to Additional Details).
 *
 * Mechanism (`agent-loop/exit-read-back.ts`; QA, with Pau's "as you said only for manager facts"): the exit card's result
 * lists the lines Create saves (reads_back); a reply line under one of the exit form's own labels that is not one of them
 * goes back once, and is left out if it is still there.
 */

const REPORT = "QA's Bubbles round 2 (22 Nov 2026, U22): the exit reply read back a notice date nobody stated and labelled the account by a field it is not saved to";
const GLOBAL = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const P17: DirectoryRow = { id: "e-odile-marchetti", firstName: "Odile", lastName: "Marchetti", preferredFirstName: null, employmentStatus: "terminated", locationIds: ["loc-219"], positionName: "Team Member Part Time" };
const T1 =
  "create exit for Odile Marchetti. Odile Marchetti's last day worked was TBD. On 11-14-26 General Manager, Ravi Ostrom, messaged Odile Marchetti via woven regarding her hours worked on 11-13-26. Odile Marchetti messaged back stating she did not work 11-13-26 and she was quitting effective immediately.";
const T2 = "address: 123 Test St, Lees Summit, MO. 00000";
const ACCOUNT =
  "On 11/14/26, General Manager Ravi Ostrom messaged Odile Marchetti via Woven regarding Odile Marchetti's hours worked on 11/13/26. Odile Marchetti messaged back stating Odile Marchetti did not work 11/13/26 and was quitting effective immediately.";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
  t.directory([P17]);
  t.as("location_manager", GLOBAL);
}

type Card = { card?: { observation?: string | null; reads_back?: string[] } } | null;
const said = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).at(-1)?.text ?? "";
const handedBack = (view: LoopView) => view.turns.some((turn) => /^\[app check\]/.test(turn.text) && /exit field/.test(turn.text));

/** The live model's reply: the account labelled "Reason for Resignation" and a notice date; `fixes`: the second reply reads back `reads_back`. */
const live = (fixes: boolean) =>
  loopStandIn((view): LoopDecision => {
    const result = lastResult(view, "propose_form") as Card;
    if (!result) {
      return {
        tool: "propose_form",
        input: {
          template_key: "resignation-exit",
          employee_name: "Odile Marchetti",
          exit_type: "resignation",
          exit_evidence: { ...evidenceFrom(view, "create exit for Odile Marchetti", said(view) === T1 ? 0 : 1), kind: "asks_for_exit_form" },
          what_happened: ACCOUNT,
          person_evidence: evidenceFrom(view, "Odile Marchetti", said(view) === T1 ? 0 : 1),
        },
      };
    }
    const intro = "Here's the Resignation/Exit Form for **Odile Marchetti**.";
    if (handedBack(view) && fixes) return { text: [intro, ...(result.card?.reads_back ?? [])].join("\n\n") };
    return { text: [intro, "**Date that notice was given:** 11/14/2026", `**Reason for Resignation:** ${result.card?.observation ?? ""}`, "Filed as: Immediate Voluntary Resignation."].join("\n\n") };
  });

export const NOV22_AGENT_LOOP_EXIT_READS_BACK_SAVED_CASES: ReplayCase[] = [
  {
    id: "nov22-u22-exit-reply-reads-back-only-saved",
    title: "U22: T2 \"address: 123 Test St, …\" — the reply's \"Date that notice was given: 11/14/2026\" (never stated) and \"Reason for Resignation: <account>\" go back once; the reply then reads the account back as Additional Details, with no notice date",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const thread = t.thread();
      const model = live(true);
      t.loopModel!(model);
      await thread.say(T1);
      const reply = await thread.say(T2);
      expect(model.views.some(handedBack), "the unsaved lines were never handed back").toBe(true);
      expect(reply.content, "a notice date nobody stated was read back").not.toMatch(/Date that notice was given/);
      expect(reply.content, "the account is labelled by a field it is not saved to").not.toMatch(/Reason for Resignation/);
      expect(reply.content).toMatch(/\*\*Additional Details:\*\* On 11\/14\/26/);
    },
  },
  {
    id: "nov22-u22-exit-unsaved-lines-twice-left-out",
    title: "U22, the model repeats the unsaved lines after the hand-back: they are left out of the reply (the card shows what is saved), never offered as a change",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const thread = t.thread();
      t.loopModel!(live(false));
      await thread.say(T1);
      const reply = await thread.say(T2);
      expect(reply.content).not.toMatch(/Date that notice was given|Reason for Resignation/);
      expect(reply.content, "the unsaved line was offered as a change").not.toMatch(/isn't on the card yet/);
      expect(reply.content).toMatch(/Resignation\/Exit Form for \*\*Odile/);
    },
  },
];
