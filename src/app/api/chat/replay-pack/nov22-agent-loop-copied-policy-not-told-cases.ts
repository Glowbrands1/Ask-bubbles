import { expect, vi } from "vitest";

import { WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * THE REPLY NEVER DESCRIBES THE TOOL'S GUARDS (QA's live re-run on production f9461c1, 22 Nov 2026, A1 notes (b))
 * ============================================================================
 *
 * After a Corrective Action card, the Coaching card's turn replied "the system won't let this Coaching card reuse the
 * Attendance heading cited on the earlier Corrective Action card…". propose_form had left the copied heading off and
 * listed it in not_on_card (policy_not_for_this_card), and the rules book says to tell the manager each not_on_card entry
 * in one line; the only reason it could give is the guard itself. That entry is an instruction for the model (policy_copied:
 * propose again with the heading that fits this card), not a fact for the manager. The stand-in follows the rules book
 * literally: it says each not_on_card entry, and it re-proposes when told the policy was copied. Invented person:
 * Zelphine Harwick.
 */

const REPORT = "QA's live re-run on production f9461c1 (22 Nov 2026, A1 notes (b)): the reply said \"the system won't let this Coaching card reuse the Attendance heading cited on the earlier Corrective Action card\"";
const ZELPHINE: DirectoryRow = { id: "e-zelphine-harwick", firstName: "Zelphine", lastName: "Harwick", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const T1 = "ca for zelphine harwick, she was late on 11/20";
const T2 = "also make a coaching form for her, she was coached on restocking the soap shelf before close on 11/20";

type Proposed = { card?: unknown; reason_code?: string; not_on_card?: { field: string; reason_code: string }[]; facts?: { policy_copied?: unknown } } | null;
const users = (view: LoopView) => view.turns.filter((turn) => turn.role === "user").length;
const proposals = (view: LoopView) => view.results.filter((result) => result.tool === "propose_form").map((result) => result.output as Proposed);

export const NOV22_AGENT_LOOP_COPIED_POLICY_NOT_TOLD_CASES: ReplayCase[] = [
  {
    id: "nov22-a1b-copied-policy-never-told-to-manager",
    title: `A1 notes (b): "${T1}", then "${T2}" with the CA's Attendance heading copied onto the Coaching card: the copied heading is the model's to fix (policy_copied), never a not_on_card line the reply tells the manager`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-22T18:40:00Z"));
      t.directory([...LOOP_STAFF, ZELPHINE]);
      t.as("location_manager", WEST_DODGE);
      const model = loopStandIn((view): LoopDecision => {
        const all = proposals(view);
        const last = all.at(-1) ?? null;
        if (users(view) === 1) {
          return last?.card ? { text: "Here's the Corrective Action Form for **Zelphine**." } : { tool: "propose_form", input: { template_key: "dpoa", employee_id: ZELPHINE.id, what_happened: "Zelphine was late on 11/20.", incident_date: "2026-11-20", policy: "Attendance" } };
        }
        const coaching = { template_key: "coaching", employee_id: ZELPHINE.id, new_form_evidence: evidenceFrom(view, "make a coaching form for her"), what_happened: "Zelphine was coached on restocking the soap shelf before close on 11/20.", incident_date: "2026-11-20" };
        if (!last) return { tool: "propose_form", input: { ...coaching, policy: "Attendance" } };
        /* The rules book: propose again with the heading that fits THIS card when policy_copied says the heading was copied. */
        if (last.facts?.policy_copied && all.length === 1) return { tool: "propose_form", input: { ...coaching, policy: "Other — restocking" } };
        /* The rules book: each field in not_on_card, said in one short line (its reason_code). */
        const lines = (all.flatMap((result) => result?.not_on_card ?? [])).map((entry) => `${entry.field} was left off (${entry.reason_code}).`);
        return { text: ["Here's the Coaching Form for **Zelphine**.", ...lines].join(" ") };
      });
      t.loopModel!(model);
      const thread = t.thread();
      await thread.say(T1);
      expect(thread.proposal?.templateKey, "no Corrective Action card (the case proves nothing)").toBe("dpoa");
      const reply = await thread.say(T2);
      const seen = model.views.flatMap(proposals);
      expect(seen.some((result) => result?.facts?.policy_copied), `the copied heading was never caught (the case proves nothing):\n${JSON.stringify(seen)}`).toBe(true);
      expect(reply.content, `the reply tells the manager about the copied-heading guard:\n${reply.content}`).not.toMatch(/policy_not_for_this_card/);
      expect(thread.proposal?.templateKey, reply.content).toBe("coaching");
    },
  },
];
