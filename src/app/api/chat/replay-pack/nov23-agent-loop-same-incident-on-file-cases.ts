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
const WREN: DirectoryRow = { id: "e-wren-halloway", firstName: "Wren", lastName: "Halloway", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const ON_1118 = "create a corrective action for Wren Halloway, she was a no call no show on 11/18";
const ON_1120 = "create a corrective action for Wren Halloway, she was a no call no show on 11/20";
const SEPARATE = "this is a separate incident, she no-showed her second shift that day too";

/** Wren's Corrective Action for 11/18 on file: finalized 11/19 (or a draft). */
function onFile(t: ReplayContext, status: "finalized" | "draft"): void {
  const ids = t.templateIds!("dpoa");
  (t.forms() as Record<string, unknown>[]).push({
    id: "ca-wren-1118", ...ids, variant_key: null, employee_role: null, location_id: WEST_DODGE.primaryAreaId, location_name: "Omaha, West Dodge Rd",
    created_by: "another-manager", created_by_role: "location_manager", source: "ask_sunny", status, follow_up_date: null, archived_at: null,
    revises_instance_id: null, template_key: "dpoa", template_name: "Corrective Action Form", employee_name: "Wren Halloway", form_date: "2026-11-18",
    created_at: "2026-11-18T22:00:00Z", updated_at: "2026-11-19T16:00:00Z", ...(status === "finalized" ? { finalized_at: "2026-11-19T16:00:00Z" } : {}),
  });
  t.typeOnForm("ca-wren-1118", { observation: "Wren was a no call no show for her shift on 11/18/26." });
}

const users = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0);
type Result = { card?: unknown; reason_code?: string; ask_exactly?: string } | null;

/** The model proposes the CA for the date in the manager's first message; told it is on file, it asks; told it is separate, it proposes again with those words. */
const model = (date: string) =>
  loopStandIn((view): LoopDecision => {
    const result = lastResult(view, "propose_form") as Result;
    if (result?.card) return { text: "Here's the Corrective Action Form for **Wren**." };
    if (result) return { text: result.ask_exactly ?? `refused: ${result.reason_code}` };
    const said = users(view).at(-1)!.text;
    /* evidenceFrom's last argument counts manager messages back from the latest: the request's first message is 1 back after SEPARATE. */
    const first = said === SEPARATE ? 1 : 0;
    return {
      tool: "propose_form",
      input: {
        template_key: "dpoa", employee_id: WREN.id, incident_date: date,
        what_happened: `Wren was a no call no show for her shift on ${date.slice(5, 7)}/${date.slice(8)}/26.`,
        policy: headingWith(view, /attendance/i),
        person_evidence: evidenceFrom(view, "Wren Halloway", first),
        attendance: "absence", attendance_evidence: evidenceFrom(view, "no call no show", first),
        ...(said === SEPARATE ? { separate_incident_evidence: evidenceFrom(view, "this is a separate incident", 0) } : {}),
      },
    };
  });

async function chat(t: ReplayContext, first: string, date: string, status: "finalized" | "draft" = "finalized") {
  vi.setSystemTime(new Date("2026-11-23T18:00:00Z"));
  t.directory([...LOOP_STAFF, WREN]);
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
    title: "\"create a corrective action for Wren Halloway, she was a no call no show on 11/18\" with a CA for 11/18 finalized 11/19 on file: no card yet; the reply says \"Wren already has a Corrective Action for 11/18 (finalized 11/19). Do you want to open that one, or is this a separate incident?\"",
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
    title: "The same with a DRAFT CA for 11/18 on file: the reply says Wren already has one for 11/18 (a draft) and asks; no card yet",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { thread, reply } = await chat(t, ON_1118, "2026-11-18", "draft");
      expect(thread.proposal ?? null, reply.content).toBeNull();
      expect(reply.content).toContain("already has a Corrective Action for 11/18 (a draft)");
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
];
