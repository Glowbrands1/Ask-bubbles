import { expect, vi } from "vitest";

import { WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * THE SAME INCIDENT ALREADY ON FILE IS SAID, AND CREATE WAITS (Pau's review of the sibling app's chats, 23 Nov 2026, via QA)
 * ============================================================================
 *
 * An employee ended up with two FINALIZED Corrective Actions for one incident date (a no-show on 11/18) and a third
 * draft, and the AI never mentioned that one already existed. A Corrective Action or Coaching card for a person and
 * incident date that already has that form on file (draft or finalized) is not made: the reply says so plainly and asks
 * "Do you want to open that one, or is this a separate incident?". The manager's words that it is a separate incident
 * build the card; another date gets no question. Invented person; the form on file is this case's.
 */

const REPORT = "Pau's review (23 Nov 2026, via QA): an employee had two finalized Corrective Actions for the same incident date (a no-show on 11/18) and a third draft; the AI never mentioned one already existed";
const CORLISS: DirectoryRow = { id: "e-corliss-abernath", firstName: "Corliss", lastName: "Abernath", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const ON_1118 = "create a corrective action for Corliss Abernath, she was a no call no show on 11/18";
const ON_1120 = "create a corrective action for Corliss Abernath, she was a no call no show on 11/20";
const SEPARATE = "this is a separate incident, she no-showed her second shift that day too";

/** Corliss's Corrective Action for 11/18 on file: finalized 11/19 (or a draft). */
function onFile(t: ReplayContext, state: "finalized" | "draft" | "with_hr"): void {
  const status = state === "finalized" ? "finalized" : "draft";
  const ids = t.templateIds!("dpoa");
  (t.forms() as Record<string, unknown>[]).push({
    id: "ca-corliss-1118", ...ids, variant_key: null, employee_role: null, location_id: WEST_DODGE.primaryAreaId, location_name: "Omaha, West Dodge Rd",
    /* A form waiting for HR is read only by its creator and HR, so that one is this manager's own (the owner's case: she sent it). */
    created_by: state === "with_hr" ? "qa-manager" : "another-manager", created_by_role: "location_manager", source: "ask_sunny", status, follow_up_date: null, archived_at: null,
    revises_instance_id: null, template_key: "dpoa", template_name: "Corrective Action Form", employee_name: "Corliss Abernath", form_date: "2026-11-18",
    created_at: "2026-11-18T22:00:00Z", updated_at: "2026-11-19T16:00:00Z", ...(status === "finalized" ? { finalized_at: "2026-11-19T16:00:00Z" } : {}),
    ...(state === "with_hr" ? { hr_approval_state: "pending" } : {}),
  });
  t.typeOnForm("ca-corliss-1118", { observation: "Corliss was a no call no show for her shift on 11/18/26." });
}

const users = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0);
type Result = { card?: unknown; reason_code?: string; ask_exactly?: string } | null;

/** The model proposes the CA for the date in the manager's first message; told it is on file, it asks; told it is separate, it proposes again with those words. */
const model = (date: string) =>
  loopStandIn((view): LoopDecision => {
    const result = lastResult(view, "propose_form") as Result;
    if (result?.card) return { text: "Here's the Corrective Action Form for **Corliss**." };
    if (result) return { text: result.ask_exactly ?? `refused: ${result.reason_code}` };
    const said = users(view).at(-1)!.text;
    /* evidenceFrom's last argument counts manager messages back from the latest: the request's first message is 1 back after SEPARATE. */
    const first = said === SEPARATE ? 1 : 0;
    return {
      tool: "propose_form",
      input: {
        template_key: "dpoa", employee_id: CORLISS.id, incident_date: date,
        what_happened: `Corliss was a no call no show for her shift on ${date.slice(5, 7)}/${date.slice(8)}/26.`,
        policy: headingWith(view, /attendance/i),
        person_evidence: evidenceFrom(view, "Corliss Abernath", first),
        attendance: "absence", attendance_evidence: evidenceFrom(view, "no call no show", first),
        ...(said === SEPARATE ? { separate_incident_evidence: evidenceFrom(view, "this is a separate incident", 0) } : {}),
      },
    };
  });

async function chat(t: ReplayContext, first: string, date: string, status: "finalized" | "draft" | "with_hr" = "finalized") {
  vi.setSystemTime(new Date("2026-11-23T18:00:00Z"));
  t.directory([...LOOP_STAFF, CORLISS]);
  t.as("location_manager", WEST_DODGE);
  onFile(t, status);
  t.loopModel!(model(date));
  const thread = t.thread();
  const reply = await thread.say(first);
  return { thread, reply };
}

export const NOV23_AGENT_LOOP_SAME_INCIDENT_ON_FILE_CASES: ReplayCase[] = [
  {
    id: "nov23-same-incident-finalized-ca-on-file-is-said",
    title: "\"create a corrective action for Corliss Abernath, she was a no call no show on 11/18\" with a CA for 11/18 finalized 11/19 on file: no card yet; the reply says \"Corliss already has a Corrective Action for 11/18 (finalized 11/19). Do you want to open that one, or is this a separate incident?\"",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { thread, reply } = await chat(t, ON_1118, "2026-11-18");
      expect(thread.proposal ?? null, `a second CA for 11/18 was put up with no word of the one on file:\n${reply.content}`).toBeNull();
      expect(reply.content).toContain("already has a Corrective Action for 11/18 (finalized 11/19). Do you want to open that one, or is this a separate incident?");
    },
  },
  {
    id: "nov23-same-incident-draft-on-file-is-said",
    title: "The same with a DRAFT CA for 11/18 on file: the reply says Corliss already has one for 11/18 (a draft) and asks; no card yet",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { thread, reply } = await chat(t, ON_1118, "2026-11-18", "draft");
      expect(thread.proposal ?? null, reply.content).toBeNull();
      expect(reply.content).toContain("already has a Corrective Action for 11/18 (a draft)");
    },
  },
  {
    id: "nov24-same-incident-with-hr-on-file-is-said",
    title: "Port from Ask Sunny (owner, 24 Nov 2026): the manager's own CA for 11/18 is waiting for HR approval: the reply says Corliss already has one for 11/18 (waiting for HR approval) and asks; never calls it filed or finalized",
    report: "Owner, 24 Nov 2026 (Ask Sunny): a manager starting a new form for the same person should see the one she already sent to HR",
    status: "fixed",
    async run(t) {
      const { thread, reply } = await chat(t, ON_1118, "2026-11-18", "with_hr");
      expect(thread.proposal ?? null, reply.content).toBeNull();
      expect(reply.content).toContain("already has a Corrective Action for 11/18 (waiting for HR approval). Do you want to open that one, or is this a separate incident?");
    },
  },
  {
    id: "nov23-same-incident-separate-answer-builds-card",
    title: "After the question, \"this is a separate incident, she no-showed her second shift that day too\": the card is made for 11/18 (a genuinely separate incident is never blocked)",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { thread } = await chat(t, ON_1118, "2026-11-18");
      const reply = await thread.say(SEPARATE);
      expect(thread.proposal?.templateKey, reply.content).toBe("dpoa");
      expect(thread.proposal?.formDate).toBe("2026-11-18");
    },
  },
  {
    id: "nov23-same-incident-other-date-no-warning",
    title: "Control: a no call no show on 11/20 with the 11/18 CA on file: the card is made and the reply never says one already exists",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { thread, reply } = await chat(t, ON_1120, "2026-11-20");
      expect(thread.proposal?.templateKey, reply.content).toBe("dpoa");
      expect(reply.content).not.toMatch(/already has|separate incident/);
    },
  },
  {
    id: "nov23-same-incident-copy-without-date-is-asked",
    title: "QA's live check of #1123: \"create a verbal CA for Corliss Abernath with all the same information given\" reads her 11/18 CA and proposes the copy with NO date and its own wording (as the live model did): no card yet; the reply asks about the 11/18 one on file",
    report: "QA's live check of #1123 (24 Nov 2026): the copy's card had no form_date, so the same-date check had nothing to compare and a second CA went up with no warning",
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-23T18:00:00Z"));
      t.directory([...LOOP_STAFF, CORLISS]);
      t.as("location_manager", WEST_DODGE);
      onFile(t, "finalized");
      const ask = "create a verbal CA for Corliss Abernath with all the same information given";
      t.loopModel!(loopStandIn((view): LoopDecision => {
        const result = lastResult(view, "propose_form") as Result;
        if (result?.card) return { text: "Here's the Corrective Action Form for **Corliss**." };
        if (result) return { text: result.ask_exactly ?? `refused: ${result.reason_code}` };
        if (!lastResult(view, "read_form")) return { tool: "read_form", input: { instance_id: "ca-corliss-1118", forms_on_file_evidence: evidenceFrom(view, ask) } };
        return { tool: "propose_form", input: { template_key: "dpoa", employee_id: CORLISS.id, person_evidence: evidenceFrom(view, "Corliss Abernath"), warning_level: "verbal", level_evidence: evidenceFrom(view, "verbal"), what_happened: "Corliss missed her scheduled shift without calling in." } };
      }), { scripted: true });
      const thread = t.thread();
      const reply = await thread.say(ask);
      expect(thread.proposal ?? null, `a second CA went up with no word of the 11/18 one:\n${reply.content}`).toBeNull();
      expect(reply.content).toContain("already has a Corrective Action for 11/18 (finalized 11/19). Do you want to open that one, or is this a separate incident?");
    },
  },
  {
    id: "nov23-same-incident-create-is-held-at-the-last-gate",
    title: "Create, the last gate: Corliss's CA card for 11/20 was made with nothing on file that day; another manager then files a CA for her 11/20; Create is held with the same question, and no second form is saved",
    report: "QA's live check of #1123 (24 Nov 2026): the same check at Create, when the form date is known, catches every path",
    status: "fixed",
    async run(t) {
      const { thread } = await chat(t, ON_1120, "2026-11-20");
      expect(thread.proposal?.templateKey, "no 11/20 card (the case proves nothing)").toBe("dpoa");
      const ids = t.templateIds!("dpoa");
      (t.forms() as Record<string, unknown>[]).push({
        id: "ca-corliss-1120", ...ids, variant_key: null, employee_role: null, location_id: WEST_DODGE.primaryAreaId, location_name: "Omaha, West Dodge Rd",
        created_by: "another-manager", created_by_role: "location_manager", source: "ask_sunny", status: "draft", follow_up_date: null, archived_at: null,
        revises_instance_id: null, template_key: "dpoa", template_name: "Corrective Action Form", employee_name: "Corliss Abernath", form_date: "2026-11-20",
        created_at: "2026-11-23T17:30:00Z", updated_at: "2026-11-23T17:30:00Z",
      });
      const before = (t.forms() as Record<string, unknown>[]).length;
      await expect(thread.create(), "Create saved a second CA for 11/20").rejects.toThrow(/already has a Corrective Action for 11\/20 \(a draft\)\. Do you want to open that one, or is this a separate incident\?/);
      expect((t.forms() as Record<string, unknown>[]).length, "a form was saved").toBe(before);
    },
  },
  {
    id: "nov23-same-incident-create-after-separate-answer-saves",
    title: "Control: after \"this is a separate incident …\" the 11/18 card's Create saves (the loop cleared that date; the last gate never asks again)",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { thread } = await chat(t, ON_1118, "2026-11-18");
      await thread.say(SEPARATE);
      expect(thread.proposal?.templateKey).toBe("dpoa");
      const id = await thread.create();
      expect(id).toBeTruthy();
    },
  },
];
