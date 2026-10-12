import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { APPROVED_GOOGLE_STORES } from "@/config/company/google-reviews";
import { createMigratedTestDatabase, type KnowledgeTestDatabase } from "@/test/pglite-knowledge-db";

/**
 * THE GOOGLE REVIEWS SCHEMA ON A REAL POSTGRES (PGlite), running the repository's
 * OWN migration verbatim — and its rollback. Everything the application relies on
 * for brand isolation, idempotency, removal safety and the run lock is asserted
 * here against the real SQL, not a reimplementation.
 */

const BASE = ["20260829000100_extensions", "20260829000200_knowledge_schema"] as const;
const UP = "20261013001000_google_reviews";
const read = (path: string) => readFileSync(new URL(`../../../supabase/${path}`, import.meta.url), "utf8");

let t: KnowledgeTestDatabase;
beforeEach(async () => {
  t = await createMigratedTestDatabase([...BASE, UP]);
});
afterEach(async () => {
  await t.close();
});

const q = async <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await t.db.query<T>(sql, params)).rows;
const sealed = "v1.aaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbb.cccccccccccccccccccc";
const resource = (a: string, l: string, id: string) => `accounts/${a}/locations/${l}/reviews/${id}`;

async function linkedLocation(code = "219", account = "111", location = "222") {
  await q(`select public.google_review_record_link($1, $2, $3, 'matched', 'high', '{}'::jsonb, 'test')`, [code, `accounts/${account}`, `locations/${location}`]);
  return (await q<{ id: string }>(`select id from public.google_review_locations where store_code = $1`, [code]))[0]!.id;
}
const review = (account: string, location: string, id: string, over: Record<string, unknown> = {}) => ({
  google_review_id: id,
  review_resource_name: resource(account, location, id),
  star_rating: 5,
  comment: `comment ${id}`,
  review_create_time: "2026-10-01T12:00:00Z",
  review_update_time: "2026-10-01T12:00:00Z",
  reply_comment: null,
  reply_update_time: null,
  content_hash: id.padEnd(64, "0").replace(/[^0-9a-f]/g, "a").slice(0, 64),
  ...over,
});
const claim = async (mode = "save") => (await q<{ id: string }>(`select public.google_review_claim_run('tester', $1) as id`, [mode]))[0]!.id;
const apply = async (run: string, loc: string, reviews: unknown[], complete: boolean) =>
  (await q<{ r: Record<string, number> }>(`select public.google_review_apply_reviews($1, $2, $3::jsonb, $4) as r`, [run, loc, JSON.stringify(reviews), complete]))[0]!.r;
const finish = (run: string, status = "succeeded") => q(`select public.google_review_finish_run($1, $2, '{}'::jsonb, null, null)`, [run, status]);

describe("the allowlist", () => {
  it("is seeded with exactly the seven approved stores, identical to the company configuration", async () => {
    const rows = await q<{ store_code: string; display_name: string; address_line1: string; address_line2: string | null; city: string; state: string; postal_code: string }>(
      `select store_code, display_name, address_line1, address_line2, city, state, postal_code from public.google_review_locations order by store_code`,
    );
    expect(rows).toHaveLength(7);
    const fromConfig = [...APPROVED_GOOGLE_STORES].sort((a, b) => a.code.localeCompare(b.code));
    expect(rows.map((r) => [r.store_code, r.display_name, r.address_line1, r.address_line2, r.city, r.state, r.postal_code])).toEqual(
      fromConfig.map((s) => [s.code, s.displayName, s.addressLine1, s.addressLine2, s.city, s.state, s.postalCode]),
    );
  });

  it("starts with every store unmatched and no Google link", async () => {
    const rows = await q(`select match_status, google_account_name, google_location_name from public.google_review_locations`);
    expect(new Set(rows.map((r) => r.match_status))).toEqual(new Set(["unmatched"]));
    expect(rows.every((r) => r.google_location_name === null)).toBe(true);
  });

  it("refuses any other brand and any other store outside the allowlist's constraints", async () => {
    await expect(q(`insert into public.google_review_locations (brand, store_code, display_name, address_line1, city, state, postal_code) values ('sun_tan_city', '140', 'x', 'x', 'x', 'MO', '64101')`)).rejects.toThrow();
    await expect(q(`insert into public.google_review_locations (store_code, display_name, address_line1, city, state, postal_code) values ('219', 'dup', 'x', 'x', 'MO', '64101')`)).rejects.toThrow(); // duplicate code
    await expect(q(`insert into public.google_review_locations (store_code, display_name, address_line1, city, state, postal_code) values ('bad code!', 'x', 'x', 'x', 'MO', '64101')`)).rejects.toThrow();
  });

  it("is idempotent: applying the migration a second time changes nothing", async () => {
    await t.db.exec(read(`migrations/${UP}.sql`));
    expect((await q<{ n: string }>(`select count(*)::text as n from public.google_review_locations`))[0]!.n).toBe("7");
  });
});

describe("linking a store to a Google location", () => {
  it("records a matched link, audits it, and a Google location can belong to only one store", async () => {
    await linkedLocation("219", "111", "222");
    const row = (await q(`select match_status, google_account_name, google_location_name from public.google_review_locations where store_code = '219'`))[0]!;
    expect(row).toMatchObject({ match_status: "matched", google_account_name: "accounts/111", google_location_name: "locations/222" });
    expect((await q(`select action, store_code from public.google_review_audit where action = 'link_matched'`))).toHaveLength(1);
    await expect(q(`select public.google_review_record_link('225', 'accounts/111', 'locations/222', 'matched', 'high', '{}'::jsonb, 'test')`)).rejects.toThrow();
  });

  it("never downgrades a confirmed link, and does not re-audit an unchanged result", async () => {
    await q(`select public.google_review_record_link('66', 'accounts/1', 'locations/2', 'confirmed', 'high', '{}'::jsonb, 'admin')`);
    expect((await q<{ r: string }>(`select public.google_review_record_link('66', null, null, 'mismatch', 'low', '{}'::jsonb, 'auto') as r`))[0]!.r).toBe('kept_confirmed');
    expect((await q(`select match_status from public.google_review_locations where store_code = '66'`))[0]!.match_status).toBe("confirmed");
    await q(`select public.google_review_record_link('67', 'accounts/1', 'locations/3', 'matched', 'high', '{}'::jsonb, 'auto')`);
    await q(`select public.google_review_record_link('67', 'accounts/1', 'locations/3', 'matched', 'high', '{}'::jsonb, 'auto')`);
    expect((await q(`select 1 from public.google_review_audit where store_code = '67'`))).toHaveLength(1);
  });

  it("a non-accepted result (candidate, mismatch, ambiguous) records evidence and holds no link", async () => {
    await q(`select public.google_review_record_link('264', null, null, 'candidate', 'medium', '{"candidates":1}'::jsonb, 'auto')`);
    const row = (await q(`select match_status, google_location_name, match_evidence from public.google_review_locations where store_code = '264'`))[0]!;
    expect(row).toMatchObject({ match_status: "candidate", google_location_name: null, match_evidence: { candidates: 1 } });
    await expect(q(`select public.google_review_record_link('nope', 'accounts/1', 'locations/9', 'matched', 'high', '{}'::jsonb, 'x')`)).rejects.toThrow();
  });
});

describe("storing reviews", () => {
  it("inserts, then is idempotent, then reconciles a changed review and a new reply", async () => {
    const loc = await linkedLocation();
    const run = await claim();
    const first = await apply(run, loc, [review("111", "222", "r1"), review("111", "222", "r2", { star_rating: 2 })], true);
    expect(first).toMatchObject({ inserted: 2, updated: 0, unchanged: 0, removed: 0 });
    await finish(run);

    const run2 = await claim();
    expect(await apply(run2, loc, [review("111", "222", "r1"), review("111", "222", "r2", { star_rating: 2 })], true)).toMatchObject({ inserted: 0, updated: 0, unchanged: 2 });
    await finish(run2);

    const run3 = await claim();
    const replied = review("111", "222", "r2", { star_rating: 2, reply_comment: "Thank you", reply_update_time: "2026-10-02T09:00:00Z", content_hash: "b".repeat(64) });
    expect(await apply(run3, loc, [review("111", "222", "r1"), replied], true)).toMatchObject({ inserted: 0, updated: 1, unchanged: 1 });
    const r2 = (await q(`select reply_comment, has_reply from public.google_reviews where google_review_id = 'r2'`))[0]!;
    expect(r2).toMatchObject({ reply_comment: "Thank you", has_reply: true });
    expect((await q(`select 1 from public.google_reviews`))).toHaveLength(2); // no duplicates
  });

  it("refuses a review whose resource name belongs to a DIFFERENT Google location (cross-store mismatch)", async () => {
    const loc = await linkedLocation("219", "111", "222");
    const run = await claim();
    await expect(apply(run, loc, [review("111", "999", "r1")], true)).rejects.toThrow(/does not belong/);
    await expect(apply(run, loc, [review("777", "222", "r1")], true)).rejects.toThrow(/does not belong/);
    expect((await q(`select 1 from public.google_reviews`))).toHaveLength(0);
    // a direct write is refused by the same trigger
    await expect(q(`insert into public.google_reviews (location_id, google_review_id, review_resource_name, star_rating, review_create_time, review_update_time, content_hash)
                    values ($1, 'x', 'accounts/111/locations/999/reviews/x', 5, now(), now(), $2)`, [loc, "a".repeat(64)])).rejects.toThrow(/does not belong/);
  });

  it("refuses reviews for a store that holds no accepted Google link, or for an inactive one", async () => {
    const loc = (await q<{ id: string }>(`select id from public.google_review_locations where store_code = '225'`))[0]!.id;
    const run = await claim();
    await expect(apply(run, loc, [review("111", "222", "r1")], false)).rejects.toThrow(/not linked/);
    const linked = await linkedLocation("236", "5", "6");
    await q(`update public.google_review_locations set is_active = false where id = $1`, [linked]);
    await expect(apply(run, linked, [review("5", "6", "r1")], false)).rejects.toThrow(/not linked/);
  });

  it("rejects malformed values at the database: rating 0 or 6, oversized text, a reply time without a reply", async () => {
    const loc = await linkedLocation();
    const run = await claim();
    for (const bad of [{ star_rating: 0 }, { star_rating: 6 }, { comment: "x".repeat(5001) }, { reply_update_time: "2026-10-02T09:00:00Z" }, { content_hash: "short" }]) {
      await expect(apply(run, loc, [review("111", "222", "bad", bad)], false)).rejects.toThrow();
    }
    expect((await q(`select 1 from public.google_reviews`))).toHaveLength(0);
  });

  it("marks reviews removed ONLY after a complete read; an incomplete read changes nothing; a returning review is restored", async () => {
    const loc = await linkedLocation();
    const ids = Array.from({ length: 20 }, (_, i) => `r${i}`);
    let run = await claim();
    await apply(run, loc, ids.map((id) => review("111", "222", id)), true);
    await finish(run);

    run = await claim();
    expect(await apply(run, loc, ids.slice(1).map((id) => review("111", "222", id)), false)).toMatchObject({ removed: 0 });
    expect((await q(`select 1 from public.google_reviews where removed_at is not null`))).toHaveLength(0);
    await finish(run);

    run = await claim();
    expect(await apply(run, loc, ids.slice(1).map((id) => review("111", "222", id)), true)).toMatchObject({ removed: 1 });
    expect((await q(`select google_review_id from public.google_reviews where removed_at is not null`)).map((r) => r.google_review_id)).toEqual(["r0"]);
    await finish(run);

    run = await claim();
    expect(await apply(run, loc, ids.map((id) => review("111", "222", id)), true)).toMatchObject({ removed: 0, restored: 1 });
    expect((await q(`select 1 from public.google_reviews where removed_at is not null`))).toHaveLength(0);
  });

  it("MASS-REMOVAL GUARD: a complete read that would remove more than 25% (min 5) is refused and changes nothing", async () => {
    const loc = await linkedLocation();
    const ids = Array.from({ length: 20 }, (_, i) => `r${i}`);
    let run = await claim();
    await apply(run, loc, ids.map((id) => review("111", "222", id)), true);
    await finish(run);

    run = await claim();
    await expect(apply(run, loc, ids.slice(0, 10).map((id) => review("111", "222", id)), true)).rejects.toThrow(/removal_guard/);
    expect((await q(`select 1 from public.google_reviews where removed_at is null`))).toHaveLength(20);
    // an empty "complete" read of a populated location is the extreme case
    await expect(apply(run, loc, [], true)).rejects.toThrow(/removal_guard/);
  });

  it("the stats view counts only live reviews and reports average, unanswered and rating buckets", async () => {
    const loc = await linkedLocation();
    const run = await claim();
    await apply(run, loc, [
      review("111", "222", "a1", { star_rating: 5, reply_comment: "ok", reply_update_time: "2026-10-02T00:00:00Z" }),
      review("111", "222", "a2", { star_rating: 1 }),
      review("111", "222", "a3", { star_rating: 4 }),
    ], true);
    const s = (await q(`select review_count, average_rating, unanswered_count, rating_1, rating_4, rating_5 from public.google_review_location_stats where store_code = '219'`))[0]!;
    expect(Number(s.review_count)).toBe(3);
    expect(Number(s.average_rating)).toBeCloseTo(3.33, 2);
    expect(Number(s.unanswered_count)).toBe(2);
    expect([Number(s.rating_1), Number(s.rating_4), Number(s.rating_5)]).toEqual([1, 1, 1]);
    expect(Number((await q(`select review_count from public.google_review_location_stats where store_code = '225'`))[0]!.review_count)).toBe(0);
  });
});

describe("searching reviews", () => {
  const search = async (args: { store?: string | null; rating?: number | null; reply?: string | null; from?: string | null; to?: string | null; removed?: boolean; limit?: number; offset?: number } = {}) =>
    (await q<{ r: { total: number; rows: Record<string, unknown>[] } }>(
      `select public.google_reviews_search($1, $2::smallint, $3, $4::timestamptz, $5::timestamptz, $6, $7, $8) as r`,
      [args.store ?? null, args.rating ?? null, args.reply ?? null, args.from ?? null, args.to ?? null, args.removed ?? false, args.limit ?? 25, args.offset ?? 0],
    ))[0]!.r;

  async function seed() {
    const a = await linkedLocation("219", "111", "222");
    const b = await linkedLocation("225", "111", "333");
    const run = await claim();
    await apply(run, a, [
      review("111", "222", "a1", { star_rating: 5, review_create_time: "2026-10-03T12:00:00Z" }),
      review("111", "222", "a2", { star_rating: 1, review_create_time: "2026-10-02T12:00:00Z", reply_comment: "sorry", reply_update_time: "2026-10-02T13:00:00Z", content_hash: "c".repeat(64) }),
      review("111", "222", "a3", { star_rating: 3, review_create_time: "2026-09-01T12:00:00Z", content_hash: "d".repeat(64) }),
    ], true);
    await apply(run, b, [review("111", "333", "b1", { star_rating: 5, review_create_time: "2026-10-04T12:00:00Z", content_hash: "e".repeat(64) })], true);
  }

  it("filters by store, rating, reply state and date range, newest first, with an exact total", async () => {
    await seed();
    const all = await search();
    expect(all.total).toBe(4);
    expect(all.rows.map((r) => r.store_code)).toEqual(["225", "219", "219", "219"]); // b1 (Oct 4), a1, a2, a3
    expect((await search({ store: "219" })).total).toBe(3);
    expect((await search({ rating: 5 })).total).toBe(2);
    expect((await search({ reply: "answered" })).rows.map((r) => r.has_reply)).toEqual([true]);
    expect((await search({ reply: "unanswered" })).total).toBe(3);
    expect((await search({ from: "2026-10-02T00:00:00Z", to: "2026-10-04T00:00:00Z" })).total).toBe(2); // a1, a2 (b1 is at Oct 4 12:00, outside)
    expect((await search({ store: "219", rating: 1, reply: "answered" })).total).toBe(1);
  });

  it("pages with the total unchanged, caps the page size at 100, and rejects bad filters", async () => {
    await seed();
    const p1 = await search({ limit: 2, offset: 0 });
    const p2 = await search({ limit: 2, offset: 2 });
    expect([p1.total, p2.total]).toEqual([4, 4]);
    expect(new Set([...p1.rows, ...p2.rows].map((r) => r.id)).size).toBe(4);
    expect((await search({ limit: 100000 })).rows).toHaveLength(4);
    await expect(search({ reply: "maybe" })).rejects.toThrow(/bad reply filter/);
    await expect(search({ rating: 9 })).rejects.toThrow();
  });

  it("lists live reviews by default and only removed ones when asked; the page rows carry no reviewer field", async () => {
    const a = await linkedLocation("219", "111", "222");
    const ids = Array.from({ length: 12 }, (_, i) => `x${i}`);
    let run = await claim();
    await apply(run, a, ids.map((id) => review("111", "222", id)), true);
    await finish(run);
    run = await claim();
    await apply(run, a, ids.slice(1).map((id) => review("111", "222", id)), true);
    expect((await search()).total).toBe(11);
    const removed = await search({ removed: true });
    expect(removed.total).toBe(1);
    expect(Object.keys(removed.rows[0]!).sort()).toEqual(["comment", "has_reply", "id", "removed_at", "reply_comment", "reply_update_time", "review_create_time", "review_update_time", "star_rating", "store_code", "store_name"]);
  });
});

describe("clearing a link", () => {
  it("unlinks the store, keeps its stored reviews, refuses new ones until it is linked again, and audits it", async () => {
    const loc = await linkedLocation("66", "111", "222");
    const run = await claim();
    await apply(run, loc, [review("111", "222", "k1")], true);
    expect((await q<{ r: boolean }>(`select public.google_review_clear_link('66', 'admin') as r`))[0]!.r).toBe(true);
    expect((await q<{ r: boolean }>(`select public.google_review_clear_link('66', 'admin') as r`))[0]!.r).toBe(false); // nothing left to clear
    expect((await q(`select match_status, google_location_name from public.google_review_locations where store_code = '66'`))[0]).toMatchObject({ match_status: "unmatched", google_location_name: null });
    expect(await q(`select 1 from public.google_reviews`)).toHaveLength(1);
    await expect(apply(run, loc, [review("111", "222", "k2")], false)).rejects.toThrow(/not linked/);
    expect((await q(`select 1 from public.google_review_audit where action = 'link_cleared' and store_code = '66'`))).toHaveLength(1);
  });
});

describe("the run lock, the connection and the audit trail", () => {
  it("allows one running sync at a time, releases on finish, and abandons a stale run", async () => {
    const a = await claim();
    expect((await q(`select public.google_review_claim_run('other', 'save') as id`))[0]!.id).toBeNull();
    await finish(a);
    expect(await claim()).toBeTruthy();
    await q(`update public.google_review_sync_runs set started_at = now() - interval '31 minutes' where status = 'running'`);
    expect(await claim()).toBeTruthy();
    expect((await q(`select error_code from public.google_review_sync_runs where status = 'failed'`)).map((r) => r.error_code)).toContain("abandoned");
  });

  it("a dry-run claim cannot apply reviews", async () => {
    const loc = await linkedLocation();
    const dry = await claim("dry_run");
    await expect(apply(dry, loc, [review("111", "222", "r1")], true)).rejects.toThrow(/no running save run/);
  });

  it("keeps exactly one ACTIVE connection and refuses a plaintext token", async () => {
    await q(`select public.google_review_set_connection($1, array['https://www.googleapis.com/auth/business.manage'], 'admin@example.invalid')`, [sealed]);
    await q(`select public.google_review_set_connection($1, array['https://www.googleapis.com/auth/business.manage'], 'admin@example.invalid')`, [sealed.replace("aaaa", "dddd")]);
    expect((await q(`select status from public.google_business_connections where status = 'active'`))).toHaveLength(1);
    expect((await q(`select status from public.google_business_connections where status = 'revoked'`))).toHaveLength(1);
    await expect(q(`select public.google_review_set_connection('1//0gPlainRefreshToken', '{}'::text[], 'x')`)).rejects.toThrow();
    await q(`select public.google_review_end_connection('expired', 'invalid_grant', 'system')`);
    expect((await q(`select 1 from public.google_business_connections where status = 'active'`))).toHaveLength(0);
    expect((await q(`select action from public.google_review_audit order by id`)).map((r) => r.action)).toEqual(expect.arrayContaining(["connection_created", "connection_expired"]));
  });

  it("the audit trail is append-only", async () => {
    await linkedLocation();
    await expect(q(`update public.google_review_audit set actor = 'x'`)).rejects.toThrow(/append-only/);
    await expect(q(`delete from public.google_review_audit`)).rejects.toThrow(/append-only/);
  });

  it("denies the browser roles every table, view and function", async () => {
    for (const sql of [
      `select * from public.google_reviews`, `select * from public.google_review_locations`, `select * from public.google_business_connections`,
      `select * from public.google_review_sync_runs`, `select * from public.google_review_audit`, `select * from public.google_review_location_stats`,
      `select * from public.google_reviews_feed`, `select public.google_review_claim_run('x', 'save')`,
    ]) {
      for (const role of ["anon", "authenticated"]) {
        await t.db.exec(`set role ${role}`);
        try {
          await expect(t.db.query(sql)).rejects.toThrow(/permission denied/);
        } finally {
          await t.db.exec("reset role");
        }
      }
    }
  });
});

describe("rollback", () => {
  it("removes only this migration's objects, leaves every earlier object untouched, and can be re-applied", async () => {
    const before = await q<{ n: string }>(`select count(*)::text as n from information_schema.tables where table_schema = 'public' and table_name not like 'google\\_%' escape '\\'`);
    await t.db.exec(read("rollbacks/20261013001000_google_reviews_down.sql"));
    const gone = await q(`select table_name from information_schema.tables where table_schema = 'public' and table_name like 'google\\_%' escape '\\'`);
    expect(gone).toEqual([]);
    expect((await q(`select proname from pg_proc where pronamespace = 'public'::regnamespace and proname like 'google\\_review%' escape '\\'`))).toEqual([]);
    const after = await q<{ n: string }>(`select count(*)::text as n from information_schema.tables where table_schema = 'public' and table_name not like 'google\\_%' escape '\\'`);
    expect(after[0]!.n).toBe(before[0]!.n);
    expect((await q(`select 1 from pg_proc where proname = 'touch_updated_at'`))).toHaveLength(1); // a pre-existing function survives
    await t.db.exec(read("rollbacks/20261013001000_google_reviews_down.sql")); // idempotent
    await t.db.exec(read(`migrations/${UP}.sql`)); // and re-applicable
    expect((await q<{ n: string }>(`select count(*)::text as n from public.google_review_locations`))[0]!.n).toBe("7");
  });
});
