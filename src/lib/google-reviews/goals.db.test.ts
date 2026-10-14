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

/** Pin an explicit, approved baseline. */
async function pin(code: string, reviewId: string, time: string) {
  await q(`select * from public.google_review_set_baselines('admin', $1::jsonb)`, [JSON.stringify([{ store_code: code, review_id: reviewId, review_time: time }])]);
}

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

  it("sets exactly the approved baselines, and records who and when", async () => {
    const loc = await link("219", "10");
    await add(loc, "2026-09-01T10:00:00Z", 5);
    const approved = await add(loc, "2026-10-02T10:00:00Z", 3);
    await add(loc, "2026-10-09T10:00:00Z", 5); // newer than the approved one: must NOT be chosen
    const set = await q(`select * from public.google_review_set_baselines('approver', $1::jsonb)`, [
      JSON.stringify([{ store_code: "219", review_id: approved, review_time: "2026-10-02T10:00:00Z" }]),
    ]);
    expect(set).toHaveLength(1);
    expect(set[0]).toMatchObject({ store_code: "219", baseline_review_id: approved });
    expect(await counts("219")).toMatchObject({ baseline_review_id: approved, month_count: 1 });
    expect((await q(`select baseline_set_by, baseline_set_at from public.google_review_goals where store_code = '219'`))[0]).toMatchObject({ baseline_set_by: "approver" });
  });

  it("refuses a review that belongs to another salon, with a wrong timestamp, removed, unknown, duplicated or malformed — and writes nothing", async () => {
    const a = await link("219", "10");
    const b = await link("225", "11");
    const ra = await add(a, "2026-10-02T10:00:00Z", 5);
    const rb = await add(b, "2026-10-03T10:00:00Z", 5);
    const gone = await add(a, "2026-10-04T10:00:00Z", 5, { removed: true });
    const call = (entries: unknown[]) => q(`select * from public.google_review_set_baselines('approver', $1::jsonb)`, [JSON.stringify(entries)]);
    await expect(call([{ store_code: "219", review_id: rb, review_time: "2026-10-03T10:00:00Z" }])).rejects.toThrow(/not a live review of store 219/); // another salon's review
    await expect(call([{ store_code: "219", review_id: ra, review_time: "2026-10-02T10:00:01Z" }])).rejects.toThrow(/not the approved/); // wrong time
    await expect(call([{ store_code: "219", review_id: gone, review_time: "2026-10-04T10:00:00Z" }])).rejects.toThrow(/not a live review/); // removed
    await expect(call([{ store_code: "219", review_id: "nope", review_time: "2026-10-02T10:00:00Z" }])).rejects.toThrow(/not a live review/);
    await expect(call([{ store_code: "999", review_id: ra, review_time: "2026-10-02T10:00:00Z" }])).rejects.toThrow(/unknown store/);
    await expect(call([{ store_code: "219", review_id: ra, review_time: "2026-10-02T10:00:00Z" }, { store_code: "219", review_id: ra, review_time: "2026-10-02T10:00:00Z" }])).rejects.toThrow(/twice/);
    await expect(call([{ store_code: "219", review_id: ra }])).rejects.toThrow(/needs store_code/);
    await expect(call([])).rejects.toThrow(/non-empty/);
    await expect(q(`select * from public.google_review_set_baselines('  ', $1::jsonb)`, [JSON.stringify([{ store_code: "219", review_id: ra, review_time: "2026-10-02T10:00:00Z" }])])).rejects.toThrow(/actor/);
    // all-or-nothing: a good entry beside a bad one is not written either
    await expect(call([{ store_code: "219", review_id: ra, review_time: "2026-10-02T10:00:00Z" }, { store_code: "225", review_id: ra, review_time: "2026-10-02T10:00:00Z" }])).rejects.toThrow();
    expect(await q(`select 1 from public.google_review_goals where baseline_review_id is not null`)).toHaveLength(0);
  });

  it("never overwrites an existing baseline, by the function or by a direct write", async () => {
    const loc = await link("219", "10");
    const first = await add(loc, "2026-10-02T10:00:00Z", 5);
    const second = await add(loc, "2026-10-05T10:00:00Z", 5);
    await q(`select * from public.google_review_set_baselines('approver', $1::jsonb)`, [JSON.stringify([{ store_code: "219", review_id: first, review_time: "2026-10-02T10:00:00Z" }])]);
    await expect(
      q(`select * from public.google_review_set_baselines('approver', $1::jsonb)`, [JSON.stringify([{ store_code: "219", review_id: second, review_time: "2026-10-05T10:00:00Z" }])]),
    ).rejects.toThrow(/already has a baseline/);
    await expect(q(`update public.google_review_goals set baseline_review_id = $1, baseline_review_time = '2026-10-05T10:00:00Z' where store_code = '219'`, [second])).rejects.toThrow(/cannot be overwritten/);
    await expect(q(`update public.google_review_goals set baseline_review_id = null, baseline_review_time = null where store_code = '219'`)).rejects.toThrow(/cannot be overwritten/);
    await q(`update public.google_review_goals set monthly_target = 12 where store_code = '219'`); // the target may change; the baseline may not
    expect((await counts("219")).baseline_review_id).toBe(first);
  });

  it("excludes reviews at or before the baseline, and counts only 3–5★ live reviews after it", async () => {
    const loc = await link("219", "10");
    await add(loc, "2026-09-20T10:00:00Z", 5); // history
    const base = await add(loc, "2026-10-02T10:00:00Z", 5, { id: "BASE" });
    await pin("219", "BASE", "2026-10-02T10:00:00Z");
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
    const base225 = await add(loc, "2026-10-01T00:00:00Z", 5);
    await pin("225", base225, "2026-10-01T00:00:00Z");
    const rid = await add(loc, "2024-03-01T10:00:00Z", 5); // imported now, created long before the baseline
    expect((await counts("225")).month_count).toBe(0);
    expect(rid).toBeTruthy();
  });

  it("keeps each salon's reviews and baselines separate", async () => {
    const a = await link("219", "10");
    const b = await link("225", "11");
    const ba = await add(a, "2026-10-01T10:00:00Z", 5);
    const bb = await add(b, "2026-09-01T10:00:00Z", 5);
    await pin("219", ba, "2026-10-01T10:00:00Z");
    await pin("225", bb, "2026-09-01T10:00:00Z");
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

describe("the goals migration preserves existing review data", () => {
  it("leaves every imported review and salon mapping byte-for-byte unchanged", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { createMigratedTestDatabase } = await import("@/test/pglite-knowledge-db");
    const before = await createMigratedTestDatabase(["20260829000100_extensions", "20260829000200_knowledge_schema", "20261013001000_google_reviews", "20261014001000_google_reviews_history"]);
    try {
      const run = (sql: string, params: unknown[] = []) => before.db.query<Record<string, unknown>>(sql, params).then((r) => r.rows);
      await run(`select public.google_review_record_link('219', 'accounts/1', 'locations/10', 'matched', 'high', '{}'::jsonb, 'test')`);
      const loc = (await run(`select id from public.google_review_locations where store_code = '219'`))[0]!.id;
      for (let i = 0; i < 250; i += 1) {
        await run(
          `insert into public.google_reviews (location_id, google_review_id, review_resource_name, star_rating, review_create_time, review_update_time, content_hash, reviewer_name)
           values ($1, $2, $3, $4, now() - ($5 || ' days')::interval, now() - ($5 || ' days')::interval, $6, 'Reviewer')`,
          [loc, `g${i}`, `accounts/1/locations/10/reviews/g${i}`, (i % 5) + 1, String(i), "a".repeat(64)],
        );
      }
      const snapshot = async () => ({
        reviews: (await run(`select md5(string_agg(t::text, '|' order by google_review_id)) as h, count(*)::int as n from public.google_reviews t`))[0],
        locations: (await run(`select md5(string_agg(t::text, '|' order by store_code)) as h from public.google_review_locations t`))[0],
      });
      const beforeSnap = await snapshot();
      expect(beforeSnap.reviews).toMatchObject({ n: 250 });
      await before.db.exec(readFileSync(join(process.cwd(), "supabase/migrations/20261015001000_google_review_goals.sql"), "utf8"));
      expect(await snapshot()).toEqual(beforeSnap);
      expect((await run(`select count(*)::int as n from public.google_review_goals`))[0]).toMatchObject({ n: 7 });
    } finally {
      await before.close();
    }
  });
});
