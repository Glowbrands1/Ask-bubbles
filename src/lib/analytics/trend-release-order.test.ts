import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE ANALYTICS PAGE SURVIVES EITHER RELEASE ORDER.
 *
 * The application now asks `analytics_trend` for business-zone buckets with a
 * `p_timezone` argument that only exists once migration 20261009001000 is
 * applied. If the code is deployed first, PostgREST answers PGRST202 ("no
 * function matches"): the trend is then asked for again without the zone, and
 * the page renders instead of failing. With the migration applied, the first
 * call is the only call.
 */

type Call = { fn: string; args: Record<string, unknown> };
const calls: Call[] = [];
let migrationApplied = true;

const ok = (data: unknown) => Promise.resolve({ data, error: null });

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === "analytics_trend" && "p_timezone" in args && !migrationApplied) {
        return Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
      }
      if (fn === "analytics_trend") return ok([{ bucket_start: "2026-10-09", events: "3", active_users: "1" }]);
      if (fn === "analytics_totals") return ok([{}]);
      return ok([]);
    },
    from: () => ({ select: () => ({ order: () => ok([]) }) }),
  }),
}));

const { loadAnalytics } = await import("./queries");
const { EMPTY_FILTERS } = await import("./filters");

beforeEach(() => {
  calls.length = 0;
});

describe("the usage trend across the migration's release", () => {
  it("asks once, with the business zone, when the migration is applied", async () => {
    migrationApplied = true;
    const snapshot = await loadAnalytics(EMPTY_FILTERS);
    const trend = calls.filter((call) => call.fn === "analytics_trend");
    expect(trend).toHaveLength(1);
    expect(trend[0]!.args.p_timezone).toBe("America/Chicago");
    expect(snapshot.trend).toEqual([{ date: "2026-10-09", events: 3, activeUsers: 1 }]);
  });

  it("falls back to the old signature instead of failing when it is not applied yet", async () => {
    migrationApplied = false;
    const snapshot = await loadAnalytics(EMPTY_FILTERS);
    const trend = calls.filter((call) => call.fn === "analytics_trend");
    expect(trend).toHaveLength(2);
    expect("p_timezone" in trend[1]!.args).toBe(false);
    expect(snapshot.trend).toHaveLength(1);
  });
});
