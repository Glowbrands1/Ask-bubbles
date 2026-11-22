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

export const NOV22_ROUND3_INCIDENT_DATE_CASES: ReplayCase[] = [
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
];
