import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF, LOOP_THADDEA } from "./loop-roster";
import { ACCOUNT, T1, T2, T3, T4 } from "./nov21-agent-loop-corrected-name-everywhere-cases";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * ONCE SET, THE FORM DATE STAYS UNTIL THE MANAGER CHANGES IT (QA's live re-test, 21 Nov 2026)
 * ============================================================================
 *
 * QA's conversation (`nov21-agent-loop-corrected-name-everywhere-cases.ts`, the person invented): T1 "… She was late on
 * 10/5 and 10/15"; the card had 2026-10-15 at T3, then T4 "she is at Omaha dodge" dropped it and Create saved today
 * (2026-11-21). The live model left incident_date out at T4, and T1 (typed under the old spelling of the name) read as
 * another request, so nothing kept it. Expected: the last offense date the manager gave stays unless they change it.
 */

const REPORT = "QA's live re-test (21 Nov 2026, Pau's account, agent loop on): the card's 2026-10-15 was dropped at T4 and the saved form_date became today";
const users = (view: LoopView) => view.turns.filter((turn) => turn.role === "user").length;

/** T1/T2 the CA card dated 10/15; T3 the Coaching card dated 10/15; T4 the card again with no incident_date, as live. */
const live = (t4Date?: string) =>
  loopStandIn((view): LoopDecision => {
    const turn = users(view);
    if (lastResult(view, "propose_form")) return { text: "Here is the card." };
    if (turn <= 2) return { tool: "propose_form", input: { template_key: "dpoa", employee_name: "Thaddea Krol", what_happened: ACCOUNT, incident_date: "2026-10-15", person_evidence: evidenceFrom(view, "Thaddea Krol", turn - 1) } };
    return { tool: "propose_form", input: { template_key: "coaching", employee_id: LOOP_THADDEA.id, what_happened: ACCOUNT, ...(turn === 3 ? { incident_date: "2026-10-15" } : t4Date ? { incident_date: t4Date } : {}), person_evidence: evidenceFrom(view, "Thaddea Kroll", turn - 3) } };
  });

const fixed = (id: string, title: string, t4Date: string | undefined, run: (t: ReplayContext) => Promise<void>): ReplayCase => ({
  id,
  title,
  report: REPORT,
  status: "fixed",
  async run(t) {
    vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
    t.directory([...LOOP_STAFF]);
    t.as("location_manager", WEST_DODGE);
    t.loopModel!(live(t4Date));
    await run(t);
  },
});

const formDate = (proposal: unknown) => (proposal as { formDate?: string | null } | null)?.formDate ?? null;

export const NOV21_AGENT_LOOP_FORM_DATE_KEPT_CASES: ReplayCase[] = [
  fixed("nov21-agent-loop-form-date-kept-t4", "T1 \"… She was late on 10/5 and 10/15\" … T4 \"she is at Omaha dodge\" (no date from the model): the card keeps 2026-10-15 at T3 and T4, and Create saves form_date 2026-10-15, never today", undefined, async (t) => {
    const thread = t.thread();
    for (const said of [T1, T2, T3]) await thread.say(said);
    expect(formDate(thread.proposal), "T3's card lost the date").toBe("2026-10-15");
    await thread.say(T4);
    expect(formDate(thread.proposal), "T4's card lost the date").toBe("2026-10-15");
    const id = await thread.create();
    expect(t.values(id).form_date, "Create saved another date").toBe("2026-10-15");
    expect(t.forms().find((row) => row.id === id)?.form_date).toBe("2026-10-15");
  }),
  fixed("nov21-agent-loop-form-date-manager-changes-it", "The same chat, T4 \"it was 10/5, not 10/15\": the date the manager gives now replaces the kept one", "2026-10-05", async (t) => {
    const thread = t.thread();
    for (const said of [T1, T2, T3]) await thread.say(said);
    await thread.say("it was 10/5, not 10/15");
    expect(formDate(thread.proposal)).toBe("2026-10-05");
  }),
];
