import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * "TEAM MEMBER" IS THE FRONTLINE ROLE, NOT A JOB TITLE (QA2 for Pau, 21 Nov 2026; ported from the sibling app's #1196)
 * ============================================================================
 *
 * Pau: "team member", "staff" and "employee" all mean the frontline role; the loop must never write one of them as
 * someone's Position. In the sibling app, with no title on the staff list, "<name>, she is a team member" filled the
 * card's Job Title with "Team Member". This app's loop already takes a typed title only from its own Woven positions
 * (`loopCardTitle`), where the bare role words are not one, so these cases pass here before and after: they guard the
 * mechanism. A real position typed ("a general manager") still fills the empty Job Title as the list writes it. Invented
 * person, no title on the staff list.
 */
const REPORT = "QA2 for Pau (21 Nov 2026): \"team member\", \"staff\" and \"employee\" are the frontline role, never a Position";
const ORSOLYA: DirectoryRow = { id: "e-orsolya-venkirk", firstName: "Orsolya", lastName: "Venkirk", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: null };

const proposed = (views: readonly LoopView[]) =>
  views.flatMap((view) => view.results).filter((result) => result.tool === "propose_form").at(-1)?.output as
    | { card?: Record<string, unknown>; facts?: Record<string, unknown> }
    | undefined;

function start(t: ReplayContext, said: string) {
  vi.setSystemTime(new Date("2026-11-11T16:00:00Z"));
  t.directory([...STAFF, ORSOLYA]);
  t.as("location_manager", WEST_DODGE);
  const model = loopStandIn((view) =>
    lastResult(view, "propose_form")
      ? { text: "Here is the card." }
      : { tool: "propose_form", input: { template_key: "dpoa", employee_id: ORSOLYA.id, what_happened: "Orsolya Venkirk was 20 minutes late on 11/9/26.", incident_date: "2026-11-09", policy: headingWith(view, /^attendance/i), person_evidence: evidenceFrom(view, "orsolya venkirk") } },
  );
  t.loopModel!(model);
  return { thread: t.thread(), model, said };
}

export const NOV21_AGENT_LOOP_ROLE_WORDS_NOT_A_TITLE_CASES: ReplayCase[] = [
  ...(["team member", "staff member", "employee"] as const).map((words): ReplayCase => ({
    id: `nov21-role-words-not-a-title-${words.replace(" ", "-")}`,
    title: `"verbal ca for orsolya venkirk, she is a ${words}, she was 20 minutes late on 11/9/26": the card's Job Title is not "${words}" (no title on the staff list)`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { thread, model, said } = start(t, `verbal ca for orsolya venkirk, she is a ${words}, she was 20 minutes late on 11/9/26`);
      const reply = await thread.say(said);
      const result = proposed(model.views);
      expect(result?.card, "no card was made (the case proves nothing)").toBeTruthy();
      expect(reply.formProposal?.employeeRole ?? null, `"${words}" was written as her Position`).toBeNull();
      expect(result?.facts?.job_title_from_your_words, `"${words}" was taken as a typed title`).toBeUndefined();
    },
  })),
  {
    id: "nov21-role-words-real-typed-title-still-fills",
    title: "Control: \"verbal ca for orsolya venkirk, she is a general manager at west dodge, …\" still fills the empty Job Title as \"General Manager\"",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { thread, said } = start(t, "verbal ca for orsolya venkirk, she is a general manager at west dodge, she was 20 minutes late on 11/9/26");
      const reply = await thread.say(said);
      expect(reply.formProposal?.employeeRole).toBe("General Manager");
    },
  },
];
