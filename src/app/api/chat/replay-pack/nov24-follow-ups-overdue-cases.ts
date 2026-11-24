import { expect, vi } from "vitest";

import { COMPANY_LOCATIONS } from "@/lib/locations";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * THE OVERDUE COUNT IS ONE NUMBER, AND THE AI SAYS IT TOO (port from Ask Sunny; QA, 24 Nov 2026)
 * ============================================================================
 *
 * QA tested Ask Sunny live: "The overdue counts disagree. The Overview, the sidebar and the Form Monitoring banner say
 * 19 overdue. Form Monitoring's Overdue filter says 8 and Open says 6." This app had the same reads (Home, the rail
 * and the Forms Register banner over the first 50 follow-ups; the pills over the 200 newest forms). The screens now
 * count one queue (`readFollowUpQueue`) and the AI reads it through read_follow_ups (CLAUDE.md §5). Seeded: 19 overdue
 * and 9 open follow-ups at the manager's store under 210 newer forms with none, plus one test record.
 */
const REPORT = "Port from Ask Sunny (QA, 24 Nov 2026, live): the overdue counts disagree (19 on the Overview, 8 on the Overdue filter)";
const FLAG = "AGENT_LOOP_ENABLED";
const ASKED = "how many follow-ups are overdue?";
const STORE = COMPANY_LOCATIONS.find((location) => location.id === WEST_DODGE.primaryAreaId)!;

function row(id: string, followUp: string | null, created: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    template_id: "template-1",
    template_key: "coaching",
    template_name: "Coaching Form",
    template_short_name: "Coaching",
    layout_family: "coaching",
    template_version_id: "v1",
    template_version: 1,
    variant_key: null,
    employee_name: `Invented Person ${id}`,
    employee_role: null,
    location_id: STORE.id,
    location_name: STORE.name,
    created_by: "someone-else",
    created_by_role: "location_manager",
    source: "manual",
    status: "finalized",
    form_date: "2026-10-01",
    follow_up_date: followUp,
    followed_up_at: null,
    followed_up_by: null,
    finalized_at: "2026-10-01T12:00:00Z",
    exported_at: null,
    archived_at: null,
    revises_instance_id: null,
    created_at: created,
    updated_at: created,
    ...extra,
  };
}

function seed(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-24T16:00:00Z"));
  t.addRows!("form_instances", [
    ...Array.from({ length: 19 }, (_, i) => row(`late-${i}`, `2026-11-${String(1 + (i % 9)).padStart(2, "0")}`, "2026-10-01T10:00:00Z")),
    ...Array.from({ length: 9 }, (_, i) => row(`open-${i}`, `2026-12-${String(1 + i).padStart(2, "0")}`, "2026-10-02T10:00:00Z")),
    ...Array.from({ length: 210 }, (_, i) => row(`newer-${i}`, null, `2026-11-${String(10 + (i % 10)).padStart(2, "0")}T10:00:00Z`)),
    // A test record (a store the business does not operate): left out, as on Home.
    row("test-record", "2026-11-02", "2026-10-03T10:00:00Z", { location_name: "Maple Crossing" }),
  ]);
}

export const NOV24_FOLLOW_UPS_OVERDUE_CASES: ReplayCase[] = [
  {
    id: "nov24-follow-ups-overdue-same-count-as-home",
    title: `port from Ask Sunny, QA: "The Overview, the sidebar and the [forms page] banner say 19 overdue. [Its] Overdue filter says 8" — asked "${ASKED}", read_follow_ups gives the model Home's 19 overdue and 9 open, test record left out`,
    report: REPORT,
    status: "fixed",
    fixFlags: [FLAG],
    async run(t) {
      if (!t.loopOn?.()) return;
      t.as("location_manager", WEST_DODGE);
      seed(t);
      const model = loopStandIn((view: LoopView): LoopDecision => (lastResult(view, "read_follow_ups") ? { text: "Here are your follow-ups." } : { tool: "read_follow_ups", input: {} }));
      t.loopModel!(model);
      await t.thread().say(ASKED);
      const output = model.views.flatMap((view) => view.results.filter((result) => result.tool === "read_follow_ups")).at(-1)?.output as
        | { counts?: Record<string, number>; test_records_not_counted?: number; refused?: string; error?: string }
        | undefined;
      expect(output?.refused, JSON.stringify(output)).toBeUndefined();
      expect(output?.error, JSON.stringify(output)).toBeUndefined();
      expect(output?.counts).toMatchObject({ overdue: 19, open: 9, outstanding: 28 });
      expect(output?.test_records_not_counted).toBe(1);
    },
  },
];
