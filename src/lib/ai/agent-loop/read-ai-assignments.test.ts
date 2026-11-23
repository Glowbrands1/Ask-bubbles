import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DEFAULT_DATA_TOOL_DEPS, dataToolHandlers, readAiAssignments, type DataToolDeps } from "./data-tools";

/*
 * Port from Ask Sunny (Pau, 23 Nov 2026): read_ai_assignments, the AI assignment tracker (AI Training -> Assignments),
 * read by the people it was set up for only (`AI_ASSIGNMENT_TRACKER_EMAILS`). The emails and people are invented.
 */

const ADMIN = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] } as never;
const TRACKER = {
  people: [{ id: "p1", name: "Brindle Oakhart", group: null, startDate: null, sortOrder: null }],
  marks: [{ personId: "p1", month: "2026-11", half: 0 as const, state: "done" as const }],
};
const ctx = (email: string, role = "admin") => ({ actor: { role: role as never, scope: ADMIN, email }, question: "who hasn't done their AI assignment yet?", scopeId: "s", today: "2026-11-14" });

afterEach(() => vi.unstubAllEnvs());

describe("read_ai_assignments", () => {
  it("someone on the list reads the tracker", async () => {
    vi.stubEnv("AI_ASSIGNMENT_TRACKER_EMAILS", "tracker.one@example.test");
    const deps: DataToolDeps = { ...DEFAULT_DATA_TOOL_DEPS, loadAssignmentTracker: async () => TRACKER };
    const result = (await readAiAssignments(ctx("Tracker.One@example.test"), deps)) as { tracker: { untrusted_text: string } };
    expect(result.tracker.untrusted_text).toContain("Done this half: Brindle Oakhart.");
  });

  it("anyone else, an owner included, is refused and nothing is read", async () => {
    vi.stubEnv("AI_ASSIGNMENT_TRACKER_EMAILS", "tracker.one@example.test");
    const load = vi.fn(async () => TRACKER);
    const deps: DataToolDeps = { ...DEFAULT_DATA_TOOL_DEPS, loadAssignmentTracker: load };
    for (const role of ["admin", "owner", "location_manager"]) {
      const result = (await readAiAssignments(ctx("someone.else@example.test", role), deps)) as { refused?: string };
      expect(result.refused).toMatch(/only for the people it was set up for/);
    }
    expect(load).not.toHaveBeenCalled();
  });

  it("is one of the loop's tools", () => {
    expect(Object.keys(dataToolHandlers(ctx("x@example.test")))).toContain("read_ai_assignments");
  });
});
