import { expect, vi } from "vitest";

import type { DirectoryRow, ReplayCase, ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * THE INCIDENT DATE THE MANAGER STATED IS THE FORM'S; NEVER TODAY BY DEFAULT (QA's Bubbles live round 3, 22 Nov 2026)
 * ============================================================================
 *
 * U09, the tester's words (the person invented): T1 "create a written CA for Briony Kask.", T2 "JBA Policy Manual
 * 1-1-2026, Verbal CA 11-1-2026. On 11-1-26 Briony violated care and cleaning of facilities policy". The card said
 * "Dated today" and Create saved 2026-11-22 (at 5:10 PM it was 11/01). Root cause: the incident's dates left out any day
 * a prior step also had, so "On 11-1-26" (the Verbal CA's day too) was no incident date. A prior step now accounts for
 * one mention of its day (`incidentDates`); and when the request states exactly one incident date the card does not
 * hold, propose_form hands it back once with that date named (QA's ruling), never today.
 *
 * A1(c), QA's ruling (1): two incident dates ("She was late on 10/5 and 10/15") and none chosen: the card asks which,
 * and offers no Create while it asks (as a card still asking its store), so today is never saved for it.
 */

const REPORT = "QA's Bubbles live round 3 (22 Nov 2026, U09 and A1(c)): the incident date the manager stated did not reach the card, and Create saved today";
const BRIONY: DirectoryRow = { id: "e-briony-kask", firstName: "Briony", lastName: "Kask", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const ADMIN = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const U09_T1 = "create a written CA for Briony Kask.";
const U09_T2 = "JBA Policy Manual 1-1-2026, Verbal CA 11-1-2026. On 11-1-26 Briony violated care and cleaning of facilities policy";
const users = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).length;

function start(t: ReplayContext, rows: readonly DirectoryRow[]) {
  vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
  t.directory([...LOOP_STAFF, ...rows]);
  t.as("admin", ADMIN);
}


/*
 * U21 round 3 (QA, 22 Nov 2026, from the tester's card data; the person invented): the model passed a prior step's date as
 * incident_date. T4's card was dated 9/22 (the earlier coaching: "She has recieved coaching on 9/22 …", a spelling the
 * prior-step reading missed, and that turn's prior_actions listed only the 5/26 acknowledgement), and T12's 6/24/24 (the
 * day the policies were signed; the check compared 06-24 of this year). A prior step's date, from this turn's
 * prior_actions or this person's earlier cards (`prior-step-dates.ts`), is never the form date: propose_form hands the
 * card back once naming it, so the reply asks which day this happened.
 */
const U21 = {
  T1: "corrective action",
  T2: "briony kask",
  T3: "This is what happened: She has recieved coaching on 9/22 for cleaning tasks not being completed. What was observed this weekend is that trash liners were not put into the trash cans after collecting trash, laundry was not done",
  T4: "jba woven policys were acknowledged on 5/26/26",
  T12: "previous coaching: there was a store meeting in july 2026 and she signed the jba policys on 6/24/24",
};
const U21_ACCOUNT = "Briony was observed this weekend not putting trash liners into the trash cans after collecting trash, and laundry was not done.";

function priorDateCase(id: string, title: string, last: string, priorActions: string, passed: string): ReplayCase {
  return {
    id,
    title,
    report: "QA's Bubbles live round 3 (22 Nov 2026, U21 card data): the card's form date was a prior step's date (the earlier coaching 9/22; the policies signed 6/24/24)",
    status: "fixed",
    async run(t) {
      start(t, [BRIONY]);
      const model = loopStandIn((view): LoopDecision => {
        const message = view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).at(-1)?.text ?? "";
        const result = lastResult(view, "propose_form") as { card?: unknown; reason_code?: string } | null;
        if (result?.card) return { text: "Here's the Corrective Action Form for **Briony**." };
        if (result?.reason_code === "date_is_prior_step" && message === last && view.results.filter((row) => row.tool === "propose_form").length > 3) return { text: "Which day did this happen?" };
        if (message === U21.T1) return { text: "Who is this Corrective Action Form for, and what happened?" };
        const base = { template_key: "dpoa", employee_id: BRIONY.id, policy: headingWith(view, /standards of conduct/i), person_evidence: evidenceFrom(view, U21.T2, Math.max(0, users(view) - 2)) };
        if (message === U21.T2) return { tool: "propose_form", input: base };
        if (message === U21.T3) return { tool: "propose_form", input: { ...base, what_happened: U21_ACCOUNT, prior_actions: "Coaching — 09/22/2026 (cleaning tasks not being completed)", prior_actions_evidence: evidenceFrom(view, "coaching on 9/22") } };
        /* The live model: this turn's step only, and the prior step's date as incident_date; handed back, it leaves it out. */
        const handedBack = result?.reason_code === "date_is_prior_step";
        return { tool: "propose_form", input: { ...base, what_happened: U21_ACCOUNT, prior_actions: priorActions, prior_actions_evidence: evidenceFrom(view, last), ...(handedBack ? {} : { incident_date: passed }) } };
      });
      t.loopModel!(model);
      const thread = t.thread();
      for (const message of [U21.T1, U21.T2, U21.T3]) await thread.say(message);
      const reply = await thread.say(last);
      const backs = model.views.flatMap((view) => view.results.filter((row) => row.tool === "propose_form").map((row) => row.output as { reason_code?: string; prior_step_date?: string }));
      expect(backs.some((row) => row.reason_code === "date_is_prior_step" && row.prior_step_date === passed), `${passed} (a prior step's date) was never handed back:\n${JSON.stringify(backs.map((row) => row.reason_code))}`).toBe(true);
      expect(thread.proposal?.formDate ?? null, `the card is dated by a prior step:\n${reply.content}`).not.toBe(passed);
    },
  };
}

export const NOV22_ROUND3_INCIDENT_DATE_CASES: ReplayCase[] = [
  {
    id: "nov22-r3-u09-model-passed-date-is-kept",
    title: "Round 3 U09 (QA, from Sunny's trace): T2 \"… Verbal CA 11-1-2026. On 11-1-26 Briony violated …\" with the model PASSING incident_date 2026-11-01 — the card keeps it (it was dropped as the Verbal CA step's date) and Create saves 2026-11-01",
    report: "QA (22 Nov 2026, Sunny's U09 trace): the model passed incident_date 2026-11-01, the card ended with no date, and Create saved today",
    status: "fixed",
    async run(t) {
      start(t, [BRIONY]);
      t.loopModel!(loopStandIn((view): LoopDecision => {
        const result = lastResult(view, "propose_form") as { card?: unknown } | null;
        if (result?.card) return { text: "Here's the Corrective Action Form for **Briony**." };
        const base = { template_key: "dpoa", employee_name: "Briony Kask", person_evidence: evidenceFrom(view, "Briony Kask", users(view) - 1), warning_level: "written", level_evidence: evidenceFrom(view, "written", users(view) - 1) };
        if (users(view) === 1) return { tool: "propose_form", input: base };
        return { tool: "propose_form", input: { ...base, what_happened: "On 11/1/26 Briony violated the care and cleaning of facilities policy.", policy: "Care and Cleaning of Equipment and Facilities", prior_actions: "Signed JBA Policy Manual 1/1/2026; Verbal Warning 11/1/2026", prior_actions_evidence: evidenceFrom(view, "JBA Policy Manual 1-1-2026, Verbal CA 11-1-2026"), incident_date: "2026-11-01" } };
      }));
      const thread = t.thread();
      await thread.say(U09_T1);
      const reply = await thread.say(U09_T2);
      expect(thread.proposal?.formDate, `the card dropped the date the model passed:\n${reply.content}`).toBe("2026-11-01");
      const id = await thread.create();
      expect(t.values(id).form_date, "Create saved another date than the one stated").toBe("2026-11-01");
    },
  },
  {
    id: "nov22-r3-u09-one-stated-date-is-the-form-date",
    title: "Round 3 U09: T2 \"JBA Policy Manual 1-1-2026, Verbal CA 11-1-2026. On 11-1-26 Briony violated …\" with the model leaving incident_date out — the card is dated 11/01/2026 (never today) and Create saves 2026-11-01",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t, [BRIONY]);
      t.loopModel!(loopStandIn((view): LoopDecision => {
        const result = lastResult(view, "propose_form") as { card?: unknown; reason_code?: string } | null;
        if (result?.card) return { text: "Here's the Corrective Action Form for **Briony**." };
        const base = { template_key: "dpoa", employee_name: "Briony Kask", person_evidence: evidenceFrom(view, "Briony Kask", users(view) - 1), warning_level: "written", level_evidence: evidenceFrom(view, "written", users(view) - 1) };
        if (users(view) === 1) return { tool: "propose_form", input: base };
        /* The live model: the account, the policy and the stated prior steps, and no incident_date; handed back, it passes the date named. */
        const named = (result as { incident_date_stated?: string } | null)?.incident_date_stated;
        return { tool: "propose_form", input: { ...base, what_happened: "On 11/1/26 Briony violated the care and cleaning of facilities policy.", policy: "Care and Cleaning of Equipment and Facilities", prior_actions: "Signed JBA Policy Manual 1/1/2026; Verbal Warning 11/1/2026", prior_actions_evidence: evidenceFrom(view, "JBA Policy Manual 1-1-2026, Verbal CA 11-1-2026"), ...(named ? { incident_date: named } : {}) } };
      }));
      const thread = t.thread();
      await thread.say(U09_T1);
      const reply = await thread.say(U09_T2);
      expect(thread.proposal?.formDate, `the card is not dated 11/01/2026:\n${reply.content}`).toBe("2026-11-01");
      const id = await thread.create();
      expect(t.values(id).form_date, "Create saved another date than the one stated").toBe("2026-11-01");
    },
  },
  {
    id: "nov22-r3-a1c-two-dates-asked-no-create",
    title: "Round 3 A1(c), QA's ruling (1): \"She was late on 10/5 and 10/15\" with no date chosen — the card asks which and offers no Create while it asks",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t, []);
      const T1 = "My employee della varnick has was 10 minutes late on her last two shifts. Then she was late again. Please create a CA form so I can document. She was late on 10/5 and 10/15";
      t.loopModel!(loopStandIn((view): LoopDecision => {
        if (lastResult(view, "propose_form")) return { text: "Here's the card." };
        return { tool: "propose_form", input: { template_key: "dpoa", employee_name: "Della Varnick", what_happened: "Della was 10 minutes late on 10/5 and 10/15.", policy: headingWith(view, /attendance/i), person_evidence: evidenceFrom(view, "della varnick") } };
      }));
      const thread = t.thread();
      await thread.say(T1);
      expect(thread.proposal?.formDate ?? null, "a date was chosen for the manager").toBeNull();
      expect((thread.proposal as { supportsInlineDraft?: boolean } | null)?.supportsInlineDraft, "Create is offered while the date is asked").toBe(false);
    },
  },
  priorDateCase(
    "nov22-r3-u21-earlier-coaching-date-is-not-the-form-date",
    `U21 round 3 T4: "${U21.T4}" with the model passing 2026-09-22 (the earlier coaching, "recieved coaching on 9/22") as incident_date — handed back naming it; the card is never dated 9/22`,
    U21.T4,
    "Policy acknowledgement — 05/26/2026",
    "2026-09-22",
  ),
  priorDateCase(
    "nov22-r3-u21-signed-policies-date-is-not-the-form-date",
    `U21 round 3 T12: "${U21.T12}" with the model passing 2024-06-24 (the day the policies were signed) as incident_date — handed back naming it; the card is never dated 6/24/24`,
    U21.T12,
    "Store meeting attended July 2026; signed JBA policies 6/24/24",
    "2024-06-24",
  ),
];
