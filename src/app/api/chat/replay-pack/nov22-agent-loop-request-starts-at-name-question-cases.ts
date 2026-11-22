import { expect, vi } from "vitest";

import type { DirectoryRow, ReplayCase, ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * A "DID YOU MEAN" FOR THIS FORM STARTS THE REQUEST: THE LEVEL SAID RIGHT AFTER IT IS KEPT (QA's Bubbles live re-run 2, U35)
 * ============================================================================
 *
 * QA's tester, word for word (an assistant manager; the person invented, a two-word surname, on no directory but this
 * case's): T2 "i have an employee, Liesl Moreno Vagras that needs a corrective action form with a customer complaint",
 * T3 "verbal warning, no payroll deduct, part-time team member,", T4 "fix her last name vargas", T10 "can i review the
 * card", T11 "Create a Corrective Action Form from this conversation.", T12 "it was a customer complaint about the
 * experience with Liesl". T2 got propose_form's own "Did you mean <P>?". The last card (T12) said "Payroll deduct and
 * warning level aren't set", and the saved draft had no warning_type.
 *
 * Root cause: this request's turns start at the turn the app answered with this form's card or its "who is it for?".
 * The app's "Did you mean" for this form did not count, so the request "started" at the later card, and T3 fell before
 * it: at T12 the level quoted from T3 was refused (evidence_not_this_turn). T11 "Create a Corrective Action Form from
 * this conversation." names nobody, so the walk back from T12 also started the request there. And payroll could be
 * quoted only from the request's first turn, so T3's "no payroll deduct" was refused even at T4's card.
 *
 * Mechanism: propose_form's name question records the form it was making and marks that form's request start for the
 * person it offered; a walk that stops at a form request naming nobody runs from this card's earlier request-start
 * record; payroll may be quoted from any turn of this request, as the level (QA's ruling, narrowing the 15 Nov rule).
 * Controls: another person's turn, a turn before the request, and "make this for <B> instead of <A>" stay refused.
 */

const REPORT = "QA's Bubbles live re-run 2 (22 Nov 2026, U35): T3 \"verbal warning, no payroll deduct, …\" after the app's \"Did you mean\" was refused at the last card; the saved draft had no warning_type";
const LIESL: DirectoryRow = { id: "e-liesl-moreno-vargas", firstName: "Liesl", lastName: "Moreno Vargas", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-236"], positionName: "Team Member Part Time" };
const GRAND_ISLAND = { level: "location", primaryAreaId: "loc-236", alsoCoversAreaIds: [] };
const T = {
  T2: "i have an employee, Liesl Moreno Vagras that needs a corrective action form with a customer complaint",
  T3: "verbal warning, no payroll deduct, part-time team member,",
  T4: "fix her last name vargas",
  T10: "can i review the card",
  T11: "Create a Corrective Action Form from this conversation.",
  T12: "it was a customer complaint about the experience with Liesl",
};

const said = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).at(-1)?.text ?? "";
const back = (view: LoopView, text: string) => {
  const asks = view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0);
  return Math.max(0, asks.length - 1 - asks.findIndex((turn) => turn.text === text));
};

function start(t: ReplayContext, role: "assistant_manager" | "admin") {
  vi.setSystemTime(new Date("2026-11-22T10:00:00Z"));
  t.directory([...LOOP_STAFF, LIESL]);
  t.as(role, role === "admin" ? { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] } : GRAND_ISLAND);
}

/** The live model: propose_form with the level quoted from T3 on every card turn; the app's own question is said as given. */
const live = () =>
  loopStandIn((view): LoopDecision => {
    const message = said(view);
    const result = lastResult(view, "propose_form") as { ask_exactly?: string } | null;
    if (result) return { text: result.ask_exactly ?? "Here's the Corrective Action Form for **Liesl**." };
    if (message === T.T3 || message === T.T10 || message === T.T11) return { text: "Did you mean **Liesl Moreno Vargas**?" };
    return {
      tool: "propose_form",
      input: {
        template_key: "dpoa", employee_id: LIESL.id, policy: headingWith(view, /standards of conduct/i),
        person_evidence: evidenceFrom(view, message === T.T4 ? "vargas" : "Liesl"),
        ...(message === T.T12 ? { what_happened: "A customer complained about the experience with Liesl." } : {}),
        warning_level: "verbal", level_evidence: evidenceFrom(view, "verbal warning", back(view, T.T3)),
        payroll_deduct: "no", payroll_evidence: evidenceFrom(view, "no payroll deduct", back(view, T.T3)),
      },
    };
  });

const keepsLevel = (role: "assistant_manager" | "admin"): ReplayCase["run"] =>
  async (t: ReplayContext) => {
    start(t, role);
    t.loopModel!(live());
    const thread = t.thread();
    for (const turn of [T.T2, T.T3, T.T4, T.T10, T.T11, T.T12]) await thread.say(turn);
    expect(thread.proposal?.employeeName, "the case proves nothing: T12 made no card for the person").toBe("Liesl Moreno Vargas");
    expect((thread.proposal as { warningLevel?: string | null } | null)?.warningLevel, "T3's \"verbal warning\" was refused at the last card").toBe("verbal");
    expect((thread.proposal as { payrollDeduct?: string | null } | null)?.payrollDeduct, "T3's \"no payroll deduct\" was refused at the last card").toBe("no");
    const id = await thread.create();
    expect(t.checked(id).warning_type ?? [], "the saved draft has no Verbal Warning").toEqual(["verbal"]);
    expect(t.checked(id).payroll_deduct ?? [], "the saved draft has no payroll No").toEqual(["no"]);
  };

const payrollOf = (proposal: unknown) => (proposal as { payrollDeduct?: string | null } | null)?.payrollDeduct ?? null;

/** A control's model: a card for `person` each turn after the first, payroll quoted from `payrollTurn`. */
const quoting = (person: DirectoryRow, payrollTurn: string, extra: (view: LoopView) => Record<string, unknown> = () => ({})) =>
  loopStandIn((view): LoopDecision => {
    if (lastResult(view, "propose_form")) return { text: `Here's the Corrective Action Form for **${person.firstName}**.` };
    const message = said(view);
    if (message === payrollTurn) return { text: "Noted." };
    return {
      tool: "propose_form",
      input: {
        template_key: "dpoa", employee_id: person.id, policy: headingWith(view, /standards of conduct/i),
        person_evidence: evidenceFrom(view, person.firstName), what_happened: `${person.firstName} was late on 11/20.`,
        payroll_deduct: "no", payroll_evidence: evidenceFrom(view, payrollTurn, back(view, payrollTurn)),
        ...extra(view),
      },
    };
  });

export const NOV22_AGENT_LOOP_REQUEST_STARTS_AT_NAME_QUESTION_CASES: ReplayCase[] = [
  {
    id: "nov22-u35-level-after-did-you-mean-kept-assistant-manager",
    title: "U35 (ii): T2 \"… Liesl Moreno Vagras that needs a corrective action form …\" got \"Did you mean\"; T3 \"verbal warning, no payroll deduct, …\" — the last card (T12) keeps Verbal and Create saves it (assistant manager)",
    report: REPORT,
    status: "fixed",
    run: keepsLevel("assistant_manager"),
  },
  {
    id: "nov22-u35-level-after-did-you-mean-kept-admin",
    title: "U35 (ii), an admin (global) login: the same turns — the last card keeps Verbal and Create saves it",
    report: REPORT,
    status: "fixed",
    run: keepsLevel("admin"),
  },
  {
    id: "nov22-u35-control-payroll-before-request-refused",
    title: "U35 (ii), control: \"payroll is not deductable\" said BEFORE the request (\"corrective action for Liesl Moreno Vargas, she was late on 11/20\") is not this card's payroll",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t, "assistant_manager");
      t.loopModel!(quoting(LIESL, "payroll is not deductable"));
      const thread = t.thread();
      await thread.say("payroll is not deductable");
      await thread.say("corrective action for Liesl Moreno Vargas, she was late on 11/20");
      expect(thread.proposal?.employeeName).toBe("Liesl Moreno Vargas");
      expect(payrollOf(thread.proposal), "a payroll answer from before the request was carried").toBeNull();
    },
  },
  {
    id: "nov22-u35-control-payroll-other-persons-turn-refused",
    title: "U35 (ii), control: inside the request, a turn about ANOTHER person (\"no payroll deduct for Fenna Prewitt\") is not this card's payroll",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t, "assistant_manager");
      t.directory([...LOOP_STAFF, { ...LIESL, locationIds: ["loc-236", "loc-264"] }, { ...LOOP_STAFF[0]!, locationIds: ["loc-236"] }]);
      t.loopModel!(quoting(LIESL, "no payroll deduct for Fenna Prewitt"));
      const thread = t.thread();
      await thread.say("corrective action for Liesl Moreno Vargas, she was late on 11/20");
      await thread.say("no payroll deduct for Fenna Prewitt");
      await thread.say("verbal warning for Liesl");
      expect(thread.proposal?.employeeName).toBe("Liesl Moreno Vargas");
      expect(payrollOf(thread.proposal), "another person's payroll answer was carried").toBeNull();
    },
  },
  {
    id: "nov22-u35-control-payroll-never-carries-to-this-card-for",
    title: "U35 (ii), control (U21's ruling): \"make this for <B> instead of <A>\" never carries A's \"payroll is not deductable\" to B's card",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const [fenna, , thaddea] = LOOP_STAFF;
      vi.setSystemTime(new Date("2026-11-22T10:00:00Z"));
      t.directory([...LOOP_STAFF]);
      t.as("location_manager", { level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: [] });
      const A = "corrective action for Fenna Prewitt, she was late on 11/20";
      const PAY = "payroll is not deductable";
      const SWITCH = "make this for Thaddea instead of Fenna";
      t.loopModel!(
        loopStandIn((view): LoopDecision => {
          if (lastResult(view, "propose_form")) return { text: "Here's the Corrective Action Form." };
          const message = said(view);
          const person = message === SWITCH ? thaddea! : fenna!;
          return {
            tool: "propose_form",
            input: {
              template_key: "dpoa", employee_id: person.id, policy: headingWith(view, /standards of conduct/i),
              person_evidence: evidenceFrom(view, person.firstName), what_happened: `${person.firstName} was late on 11/20.`,
              ...(message === A ? {} : { payroll_deduct: "no", payroll_evidence: evidenceFrom(view, PAY, back(view, PAY)) }),
              ...(message === SWITCH ? { same_card_evidence: { ...evidenceFrom(view, SWITCH), kind: "this_card_for" } } : {}),
            },
          };
        }),
      );
      const thread = t.thread();
      await thread.say(A);
      await thread.say(PAY);
      expect(payrollOf(thread.proposal), "the case proves nothing: A's card has no payroll No").toBe("no");
      await thread.say(SWITCH);
      expect(thread.proposal?.employeeName).toBe("Thaddea Kroll");
      expect(payrollOf(thread.proposal), "A's payroll carried to B's card").toBeNull();
    },
  },
];
