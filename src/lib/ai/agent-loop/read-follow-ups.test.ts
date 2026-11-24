import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DEFAULT_DATA_TOOL_DEPS, dataToolHandlers, readFollowUps, type DataToolDeps, type FollowUpQueueRead } from "./data-tools";

/*
 * Port from Ask Sunny. QA, 24 Nov 2026: "The Overview, the sidebar and the Form Monitoring banner say 19 overdue. Form
 * Monitoring's Overdue filter says 8 and Open says 6." read_follow_ups reads the one queue those screens count (Home,
 * the rail and the Forms Register here), so the AI says 19 too. Names are invented.
 */
const GLOBAL = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] } as never;
const QUEUE: FollowUpQueueRead = {
  overdue: 19,
  dueThisWeek: 2,
  open: 9,
  excluded: 1,
  forms: [
    ...Array.from({ length: 19 }, (_, i) => ({ employeeName: `Late Person ${i}`, templateName: "Coaching Form", locationName: null, followUpDate: "2026-11-01", overdue: true })),
    ...Array.from({ length: 9 }, (_, i) => ({ employeeName: `Open Person ${i}`, templateName: "Coaching Form", locationName: null, followUpDate: "2026-11-20", overdue: false })),
  ],
};
const ctx = { actor: { role: "admin" as never, scope: GLOBAL, subject: "user-1", verified: true }, question: "how many follow-ups are overdue?", scopeId: "s", today: "2026-11-14" };

describe("read_follow_ups", () => {
  it("gives Home's own counts: 19 overdue, never a count of loaded rows", async () => {
    const load = vi.fn(async () => QUEUE);
    const deps: DataToolDeps = { ...DEFAULT_DATA_TOOL_DEPS, loadFollowUpQueue: load };
    const result = (await readFollowUps(ctx, deps)) as Record<string, unknown>;
    expect(load).toHaveBeenCalledWith({ subject: "user-1", verified: true, role: "admin", scope: GLOBAL, today: "2026-11-14" });
    expect(result.counts).toEqual({ overdue: 19, due_this_week: 2, needs_attention: 21, open: 9, outstanding: 28 });
    expect(result).toMatchObject({ listed: 25, of: 28, test_records_not_counted: 1 });
  });

  it("a failed read says so, and never that none is overdue", async () => {
    const deps: DataToolDeps = { ...DEFAULT_DATA_TOOL_DEPS, loadFollowUpQueue: async () => { throw new Error("down"); } };
    const result = (await readFollowUps(ctx, deps)) as Record<string, unknown>;
    expect(String(result.error)).toContain("never say none is overdue");
  });

  it("is one of the loop's tools", () => {
    expect(Object.keys(dataToolHandlers(ctx))).toContain("read_follow_ups");
  });
});
