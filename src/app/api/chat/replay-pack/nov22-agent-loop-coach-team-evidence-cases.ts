import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn } from "./loop-stand-in";

/**
 * ============================================================================
 * A WHOLE-TEAM COACHING REQUEST IS THE MODEL'S CALL, SHOWN BY THE MANAGER'S WORDS (port of the sibling app's QA shadow
 * re-run S2, 22 Nov 2026)
 * ============================================================================
 *
 * The sibling app's director typed "can you make me a coahcing form for my entire team at <store> for selling <product>
 * and not writing raing checks": coach_team answered wrong_tool ("not a whole-team request"), because its phrase reader
 * needs "coaching" spelled one of two ways and a team phrase from its list. Same reader here. The model decides it is a
 * whole team and passes team_evidence: the manager's words, checked only for being real (evidence.ts). Pau: guide the
 * loop, no word lists. This app's stores stand in for <store>; soap for <product>.
 */

const REPORT = "Sibling app's QA shadow re-run (22 Nov 2026), S2: coach_team refused \"a coaching form for my entire <team> at <store>\" as not a team request";
const GROUPS = ["sales team", "front counter team", "employees", "store"];

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-22T16:00:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

/** The sibling's sentence (a director, one turn, no person named), typos kept; the store is this app's. */
const VERBATIM = "can you make me a coahcing form for my entire team at bellevue for selling soap bundles and not writing raing checks";

const said = (group: string) => `can you make me a coaching form for my entire ${group} at West Dodge for selling soap and not writing rain checks`;

export const NOV22_AGENT_LOOP_COACH_TEAM_EVIDENCE_CASES: ReplayCase[] = [
  ...GROUPS.map((group): ReplayCase => ({
    id: `nov22-s2-coach-team-evidence-${group.replace(/\s+/g, "-")}`,
    title: `S2: "${said(group)}" with team_evidence: the team Coaching card, never wrong_tool`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      const thread = start(t);
      const model = loopStandIn((view) => (lastResult(view, "coach_team") ? { text: "Here is the team Coaching card." } : { tool: "coach_team", input: { team_evidence: evidenceFrom(view, `my entire ${group}`) } }));
      t.loopModel!(model);
      const reply = await thread.say(said(group));
      const result = lastResult(model.views.at(-1)!, "coach_team") as { reason_code?: string; error?: string } | null;
      expect(result?.reason_code ?? null, JSON.stringify(result)).not.toBe("wrong_tool");
      expect(reply.formProposal?.employeeName, `no team card:\n${reply.content}`).toBe("All team members");
    },
  })),
  {
    id: "nov22-s2-coach-team-evidence-not-in-message",
    title: "Control: team_evidence whose words are not in the manager's message is not evidence: wrong_tool, as before",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const thread = start(t);
      const model = loopStandIn((view) => (lastResult(view, "coach_team") ? { text: "ok" } : { tool: "coach_team", input: { team_evidence: evidenceFrom(view, "my whole sales team") } }));
      t.loopModel!(model);
      await thread.say("can you make me a coaching form for fenna prewitt for selling soap");
      const result = lastResult(model.views.at(-1)!, "coach_team") as { reason_code?: string } | null;
      expect(result?.reason_code).toBe("wrong_tool");
    },
  },
  {
    id: "nov22-s2-verbatim-own-store",
    title: "S2 verbatim, the manager of Bellevue: \"can you make me a coahcing form for my entire team at bellevue …\" (typos and all) with team_evidence makes the team Coaching card",
    report: `${REPORT}; the sibling QA's sentence`,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-22T16:00:00Z"));
      t.directory([...LOOP_STAFF].map((row) => ({ ...row, locationIds: ["loc-67"] })));
      t.as("location_manager", { level: "location", primaryAreaId: "loc-67", alsoCoversAreaIds: [] });
      const model = loopStandIn((view) => (lastResult(view, "coach_team") ? { text: "Here is the team Coaching card." } : { tool: "coach_team", input: { team_evidence: evidenceFrom(view, "my entire team at bellevue") } }));
      t.loopModel!(model);
      const reply = await t.thread().say(VERBATIM);
      const result = lastResult(model.views.at(-1)!, "coach_team") as { reason_code?: string } | null;
      expect(result?.reason_code ?? null, JSON.stringify(result)).not.toBe("wrong_tool");
      expect(reply.formProposal?.employeeName, `no team card:\n${reply.content}`).toBe("All team members");
    },
  },
  {
    id: "nov22-s2-verbatim-not-her-store",
    title: "S2 verbatim, a West Dodge manager: the same sentence is a team request (never wrong_tool); Bellevue is not hers, so no Bellevue card",
    report: `${REPORT}; the sibling QA's sentence`,
    status: "fixed",
    async run(t) {
      const thread = start(t);
      const model = loopStandIn((view) => (lastResult(view, "coach_team") ? { text: "ok" } : { tool: "coach_team", input: { team_evidence: evidenceFrom(view, "my entire team at bellevue") } }));
      t.loopModel!(model);
      const reply = await thread.say(VERBATIM);
      const result = lastResult(model.views.at(-1)!, "coach_team") as { reason_code?: string } | null;
      expect(result?.reason_code ?? null, JSON.stringify(result)).not.toBe("wrong_tool");
      expect(reply.formProposal?.locationId ?? null).not.toBe("loc-67");
    },
  },
];
