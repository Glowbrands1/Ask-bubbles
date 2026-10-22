import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createGoogleTestDatabase, type GoogleTestDatabase } from "./test-support";

/*
 * Every test builds a fresh database and replays the migrations. Under a full
 * parallel run that took 9.5 s once and 5 s+ again (QA, 22 Oct 2026), so the
 * default 5 s limit failed a correct test; the same limit the other migration
 * suites use (`pm-framework-readiness.integration.test.ts`).
 */
vi.setConfig({ hookTimeout: 120_000, testTimeout: 120_000 });

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

const countsV2 = async (code: string) =>
  (
    await q(
      `select * from public.google_review_goal_counts_v2('2026-10-05T05:00:00Z', '2026-10-12T05:00:00Z', '2026-10-01T05:00:00Z', '2026-10-14T15:00:00Z') where store_code = $1`,
      [code],
    )
  )[0]!;
const CUTOFF = "2026-10-01T05:00:00Z"; // Oct 1, 2026 12:00 AM America/Chicago (CDT)
const setCutoff = (stores: string[], cutoff = CUTOFF, actor = "approver") =>
  q(`select * from public.google_review_set_reporting_cutoff($1, $2::timestamptz, $3::text[])`, [actor, cutoff, stores]);

describe("reporting cutoff: October counts without touching the baseline", () => {
  async function october() {
    const loc = await link("219", "10");
    await add(loc, "2026-09-20T10:00:00Z", 5); // history
    await add(loc, "2026-10-01T04:59:59Z", 5); // one second before the cutoff: history
    await add(loc, "2026-10-01T05:00:00Z", 5); // exactly at the cutoff: counts
    await add(loc, "2026-10-05T10:00:00Z", 4); // last week
    await add(loc, "2026-10-06T10:00:00Z", 2); // 2★: never counts
    await add(loc, "2026-10-08T10:00:00Z", 5, { removed: true }); // removed: never counts
    await add(loc, "2026-10-12T05:00:00Z", 3); // Monday 00:00 CDT: this week
    const base = await add(loc, "2026-10-13T21:00:00Z", 5, { id: "BASE" }); // the newest review, pinned as the old baseline
    await pin("219", base, "2026-10-13T21:00:00Z");
    return { loc, base };
  }

  it("under the old baseline rule the October reviews before the baseline do not count", async () => {
    await october();
    expect(await countsV2("219")).toMatchObject({ month_count: 0, week_count: 0, count_from: null });
  });

  it("with the cutoff, counts 3–5★ reviews created at or after it — including the old baseline review — by Monday–Sunday windows", async () => {
    await october();
    await setCutoff(["219"]);
    expect(await countsV2("219")).toMatchObject({
      month_count: 4, // Oct 1 05:00, Oct 5, Oct 12, and the Oct 13 baseline review
      week_count: 2, // Mon Oct 12 05:00Z and Oct 13
      last_week_count: 1, // Oct 5 (the 2★ on Oct 6 never counts)
      historical_count: 2, // 09-20 and 10-01 04:59:59 — before the cutoff
    });
  });

  it("keeps the immutable baseline untouched and records what the cutoff superseded", async () => {
    await october();
    await setCutoff(["219"]);
    const row = (await q(`select * from public.google_review_goals where store_code = '219'`))[0]!;
    expect(row).toMatchObject({ baseline_review_id: "BASE", count_from_set_by: "approver", count_from_previous_baseline_id: "BASE" });
    expect(new Date(row.baseline_review_time as string).toISOString()).toBe("2026-10-13T21:00:00.000Z");
    expect(new Date(row.count_from as string).toISOString()).toBe(new Date(CUTOFF).toISOString());
    // the baseline guard is exactly as before
    await expect(q(`update public.google_review_goals set baseline_review_id = 'X', baseline_review_time = '2026-10-14T00:00:00Z' where store_code = '219'`)).rejects.toThrow(/cannot be overwritten/);
  });

  it("never overwrites a cutoff, by the function or a direct write", async () => {
    await october();
    await setCutoff(["219"]);
    await expect(setCutoff(["219"], "2026-10-02T05:00:00Z")).rejects.toThrow(/already has a cutoff/);
    await expect(q(`update public.google_review_goals set count_from = '2026-09-01T00:00:00Z' where store_code = '219'`)).rejects.toThrow(/cutoff; it cannot be overwritten/);
    await expect(q(`update public.google_review_goals set count_from = null where store_code = '219'`)).rejects.toThrow(/cannot be overwritten/);
  });

  it("refuses a future cutoff, one later than the baseline, an unknown or repeated store, and is all-or-nothing", async () => {
    await october();
    const other = await link("225", "11");
    const ob = await add(other, "2026-10-02T10:00:00Z", 5);
    await pin("225", ob, "2026-10-02T10:00:00Z");
    await expect(setCutoff(["219"], "2099-01-01T00:00:00Z")).rejects.toThrow(/not in the future/);
    await expect(setCutoff(["225"], "2026-10-03T00:00:00Z")).rejects.toThrow(/not be later than store 225's baseline/);
    await expect(setCutoff(["999"])).rejects.toThrow(/unknown store/);
    await expect(setCutoff(["219", "219"])).rejects.toThrow(/twice/);
    await expect(setCutoff([])).rejects.toThrow(/name the stores/);
    await expect(q(`select * from public.google_review_set_reporting_cutoff('  ', $1::timestamptz, $2::text[])`, [CUTOFF, ["219"]])).rejects.toThrow(/actor/);
    // all-or-nothing: 219 would accept this cutoff but 225's baseline (Oct 2 10:00) is earlier, so neither is written
    await expect(setCutoff(["219", "225"], "2026-10-02T12:00:00Z")).rejects.toThrow(/later than store 225/);
    expect(await q(`select 1 from public.google_review_goals where count_from is not null`)).toHaveLength(0);
  });

  it("a salon with no baseline can take a cutoff and then counts", async () => {
    const loc = await link("236", "12");
    await add(loc, "2026-10-03T10:00:00Z", 5);
    await setCutoff(["236"]);
    expect(await countsV2("236")).toMatchObject({ month_count: 1, baseline_review_id: null });
  });
});

describe("weekly and monthly periods", () => {
  it("groups by Central Monday–Sunday weeks and calendar months using original review dates", async () => {
    const loc = await link("219", "10");
    await add(loc, "2026-10-12T04:30:00Z", 5); // Sunday Oct 11, 23:30 CDT -> week of Oct 5
    await add(loc, "2026-10-12T05:00:00Z", 4); // Monday Oct 12, 00:00 CDT -> week of Oct 12
    await add(loc, "2026-10-18T04:59:00Z", 2); // Sunday Oct 18, 23:59 CDT -> week of Oct 12, a 2★
    await add(loc, "2026-10-19T05:00:00Z", 5); // Monday Oct 19 -> next week
    await add(loc, "2026-09-30T20:00:00Z", 5); // September
    await add(loc, "2026-10-14T05:00:00Z", 5, { removed: true }); // removed: absent
    const weeks = await q(`select period_start::text as s, review_count, qualifying_count, average_rating from public.google_reviews_periods(null, 'week') order by 1`);
    expect(weeks.map((w) => [w.s, w.review_count, w.qualifying_count])).toEqual([
      ["2026-09-28", 1, 1],
      ["2026-10-05", 1, 1],
      ["2026-10-12", 2, 1],
      ["2026-10-19", 1, 1],
    ]);
    const months = await q(`select period_start::text as s, review_count, qualifying_count from public.google_reviews_periods(null, 'month') order by 1`);
    expect(months.map((m) => [m.s, m.review_count, m.qualifying_count])).toEqual([["2026-09-01", 1, 1], ["2026-10-01", 4, 3]]);
    expect(Number((await q(`select average_rating from public.google_reviews_periods(null, 'week') where period_start = '2026-10-12'`))[0]!.average_rating)).toBe(3);
  });

  it("filters by store and rejects an unknown unit", async () => {
    const a = await link("219", "10");
    const b = await link("225", "11");
    await add(a, "2026-10-12T10:00:00Z", 5);
    await add(b, "2026-10-12T10:00:00Z", 5);
    await add(b, "2026-10-13T10:00:00Z", 5);
    expect((await q(`select review_count from public.google_reviews_periods('225', 'month')`))[0]!.review_count).toBe(2);
    await expect(q(`select * from public.google_reviews_periods(null, 'day')`)).rejects.toThrow(/unit must be/);
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
      await before.db.exec(readFileSync(join(process.cwd(), "supabase/migrations/20261016001000_google_review_reporting_cutoff.sql"), "utf8"));
      expect(await snapshot()).toEqual(beforeSnap);
    } finally {
      await before.close();
    }
  });
});
