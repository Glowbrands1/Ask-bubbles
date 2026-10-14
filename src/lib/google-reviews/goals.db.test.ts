import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createGoogleTestDatabase, type GoogleTestDatabase } from "./test-support";

/** The goal counts on the real schema: baseline boundaries, rating eligibility, windows, historical exclusion. */

let d: GoogleTestDatabase;
beforeEach(async () => {
  d = await createGoogleTestDatabase();
});
afterEach(async () => {
  await d.close();
});
const q = async <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await d.db.query<T>(sql, params)).rows;

async function link(code: string, location: string) {
  await q(`select public.google_review_record_link($1, 'accounts/1', $2, 'matched', 'high', '{}'::jsonb, 'test')`, [code, `locations/${location}`]);
  return { id: (await q<{ id: string }>(`select id from public.google_review_locations where store_code = $1`, [code]))[0]!.id, location };
}
let n = 0;
async function add(loc: { id: string; location: string }, time: string, stars: number, over: { id?: string; removed?: boolean } = {}) {
  const rid = over.id ?? `r${(n += 1)}`;
  await q(
    `insert into public.google_reviews (location_id, google_review_id, review_resource_name, star_rating, review_create_time, review_update_time, content_hash, removed_at)
     values ($1, $2, $3, $4, $5, $5, $6, $7)`,
    [loc.id, rid, `accounts/1/locations/${loc.location}/reviews/${rid}`, stars, time, "a".repeat(64), over.removed ? new Date().toISOString() : null],
  );
  return rid;
}
// Wed 2026-10-14 15:00 UTC. Windows: prev week 2026-10-04, week 2026-10-11, month 2026-10-01 (UTC midnights for the test).
const counts = async (code: string) =>
  (
    await q(
      `select * from public.google_review_goal_counts('2026-10-04T00:00:00Z', '2026-10-11T00:00:00Z', '2026-10-01T00:00:00Z', '2026-10-14T15:00:00Z') where store_code = $1`,
      [code],
    )
  )[0]!;

describe("goal counts", () => {
  it("seeds a target of 10 for all seven salons and no baselines", async () => {
    const rows = await q(`select monthly_target, baseline_review_id from public.google_review_goals`);
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.monthly_target === 10 && r.baseline_review_id === null)).toBe(true);
  });

  it("counts nothing, and calls everything historical, until a baseline exists", async () => {
    const loc = await link("219", "10");
    await add(loc, "2026-10-12T10:00:00Z", 5);
    await add(loc, "2026-10-13T10:00:00Z", 4);
    expect(await counts("219")).toMatchObject({ month_count: 0, week_count: 0, historical_count: 2, baseline_review_id: null });
  });

  it("baselines at the newest live review, idempotently, and never moves an existing one", async () => {
    const loc = await link("219", "10");
    await add(loc, "2026-09-01T10:00:00Z", 5);
    const newest = await add(loc, "2026-10-02T10:00:00Z", 3);
    await add(loc, "2026-10-09T10:00:00Z", 5, { removed: true }); // removed reviews never become a baseline
    const set = await q(`select * from public.google_review_set_baselines('admin')`);
    expect(set).toHaveLength(1);
    expect(set[0]).toMatchObject({ store_code: "219", baseline_review_id: newest });
    await add(loc, "2026-10-13T10:00:00Z", 5);
    expect(await q(`select * from public.google_review_set_baselines('admin')`)).toHaveLength(0);
    expect(await counts("219")).toMatchObject({ baseline_review_id: newest });
    expect((await q(`select baseline_set_by from public.google_review_goals where store_code = '219'`))[0]!.baseline_set_by).toBe("admin");
  });

  it("excludes reviews at or before the baseline, and counts only 3–5★ live reviews after it", async () => {
    const loc = await link("219", "10");
    await add(loc, "2026-09-20T10:00:00Z", 5); // history
    const base = await add(loc, "2026-10-02T10:00:00Z", 5, { id: "BASE" });
    await q(`select * from public.google_review_set_baselines('admin')`);
    await add(loc, "2026-10-02T10:00:00Z", 5); // same instant as the baseline: not after it
    await add(loc, "2026-10-02T10:00:01Z", 5); // one second after: counts (month)
    await add(loc, "2026-10-05T10:00:00Z", 3); // last week, counts (month)
    await add(loc, "2026-10-06T10:00:00Z", 2); // 2★: never counts
    await add(loc, "2026-10-07T10:00:00Z", 1); // 1★: never counts
    await add(loc, "2026-10-12T10:00:00Z", 4); // this week
    await add(loc, "2026-10-13T10:00:00Z", 4, { removed: true }); // removed: never counts
    await add(loc, "2026-10-15T10:00:00Z", 5); // after "now": not yet
    expect(base).toBe("BASE");
    expect(await counts("219")).toMatchObject({
      baseline_review_id: "BASE",
      month_count: 3,
      week_count: 1,
      last_week_count: 1,
      // history: the 09-20 review, the baseline itself, and the review created at the baseline's own instant
      historical_count: 3,
    });
  });

  it("dates by the original Google review time, not the import time", async () => {
    const loc = await link("225", "11");
    await add(loc, "2026-10-01T00:00:00Z", 5);
    await q(`select * from public.google_review_set_baselines('admin')`);
    const rid = await add(loc, "2024-03-01T10:00:00Z", 5); // imported now, created long before the baseline
    expect((await counts("225")).month_count).toBe(0);
    expect(rid).toBeTruthy();
  });

  it("keeps each salon's reviews and baselines separate", async () => {
    const a = await link("219", "10");
    const b = await link("225", "11");
    await add(a, "2026-10-01T10:00:00Z", 5);
    await add(b, "2026-09-01T10:00:00Z", 5);
    await q(`select * from public.google_review_set_baselines('admin')`);
    await add(a, "2026-10-12T10:00:00Z", 5);
    await add(b, "2026-10-12T10:00:00Z", 5);
    await add(b, "2026-10-13T10:00:00Z", 5);
    expect(await counts("219")).toMatchObject({ month_count: 1 });
    expect(await counts("225")).toMatchObject({ month_count: 2 });
  });

  it("is readable only by the service role", async () => {
    const grants = await q(`select grantee from information_schema.routine_privileges where routine_name = 'google_review_goal_counts'`);
    expect(grants.map((g) => g.grantee)).not.toContain("anon");
    expect(grants.map((g) => g.grantee)).not.toContain("authenticated");
  });
});
