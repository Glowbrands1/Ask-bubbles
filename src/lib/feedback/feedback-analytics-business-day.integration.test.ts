import { readdirSync } from "node:fs";
import { join } from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  createMigratedTestDatabase,
  type KnowledgeTestDatabase,
} from "@/test/pglite-knowledge-db";
import type { AccessScope } from "@/types";

/**
 * =============================================================================
 * A RATING BELONGS TO THE CENTRAL TIME DAY IT WAS LEFT ON
 * =============================================================================
 *
 * The defect: Admin → Analytics → Conversation Feedback bounded every window
 * at UTC midnight. UTC midnight is 7pm Central in summer and 6pm in winter, so
 * a rating left at 9:30pm on the 9th was outside "the 9th" and inside "the
 * 10th", and a "last 7 days" read at 9:45pm left out that whole evening. The
 * trend chart's days split at the same wrong moment, because `date_trunc` on a
 * `timestamptz` truncates in the database session zone, which is UTC.
 *
 * Driven through the application's own loaders (`loadFeedbackAnalytics`,
 * `loadAnalytics`) and the repository's own SQL, every migration applied
 * verbatim on a real Postgres (PGlite). The only thing set by hand is WHEN each
 * rating happened: `created_at` and the answer's `occurred_at` are moved to
 * fixed instants around Central midnights, in Central Daylight Time, Central
 * Standard Time and on both daylight-saving changeover days of 2026.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const ALL_MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => file.replace(/\.sql$/, ""));

/** Supabase platform objects the earlier migrations reach for. */
const PLATFORM = `
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
`;

let harness: KnowledgeTestDatabase;

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => harness.client,
}));

vi.mock("@/config/company/locations", () => ({
  LOCATION_CODE_PATTERN: /^[A-Za-z0-9][A-Za-z0-9-]{0,15}$/,
  COMPANY_LOCATION_ENTRIES: [{ code: "101", name: "Testville Downtown", state: "TN", districtId: "dist-east" }],
  COMPANY_DISTRICT_ENTRIES: [{ id: "dist-east", name: "East", regionId: null }],
  COMPANY_REGION_ENTRIES: [],
  COMPANY_LOCATION_NICKNAMES: {},
  COMPANY_LOCATION_ABBREVIATIONS: {},
}));

vi.mock("@/lib/analytics/telemetry", () => ({
  logTurnEvent: () => {},
}));

const MANAGER = {
  id: "b0000000-0000-4000-8000-000000000001",
  role: "location_manager" as const,
  scope: { level: "location", primaryAreaId: "loc-101", alsoCoversAreaIds: [] } satisfies AccessScope,
};

let record: typeof import("@/lib/analytics/record");
let store: typeof import("@/lib/feedback/store");
let feedbackQueries: typeof import("@/lib/analytics/feedback-queries");
let usageQueries: typeof import("@/lib/analytics/queries");
let filters: typeof import("@/lib/analytics/filters");

/** One answered turn, rated, both stamped at `instant` (UTC ISO). */
async function ratedAt(instant: string): Promise<string> {
  const turnId = await record.openTurn({
    feature: "chat",
    category: "general_guidance",
    turnKind: "question",
    surface: "main_chat",
    actorId: MANAGER.id,
    actorRole: MANAGER.role,
    scope: MANAGER.scope,
  });
  await record.closeTurn(turnId, { category: "policy_question", succeeded: true, latencyMs: 900 });
  await store.saveFeedback({ turnId, userId: MANAGER.id, rating: 4, gotWhatNeeded: "yes", comment: "" });
  await harness.db.query(`update public.activity_events set occurred_at = $2 where id = $1`, [turnId, instant]);
  await harness.db.query(`update public.assistant_feedback set created_at = $2 where activity_event_id = $1`, [turnId, instant]);
  return turnId;
}

/** One business day, as the custom range a manager picks: first and last day the same. */
const day = (date: string) => ({ ...filters.EMPTY_FILTERS, from: date, to: date });

async function ratingsOn(date: string): Promise<number> {
  return (await feedbackQueries.loadFeedbackAnalytics(day(date))).summary.responses;
}

/* Every instant below, with its Central wall-clock time. */
const MOMENTS = {
  /* Central Daylight Time (UTC-5): 9 October 2026 runs 05:00Z → 05:00Z. */
  cdtBeforeMidnight: "2026-10-09T04:30:00Z", // Thu 8 Oct, 11:30pm CDT
  cdtMidnight: "2026-10-09T05:00:00Z", //       Fri 9 Oct, 12:00am CDT
  cdtLateEvening: "2026-10-10T02:30:00Z", //    Fri 9 Oct,  9:30pm CDT  ← the reported case
  cdtLastSecond: "2026-10-10T04:59:59Z", //     Fri 9 Oct, 11:59:59pm CDT
  cdtNextMidnight: "2026-10-10T05:00:00Z", //   Sat 10 Oct, 12:00am CDT
  /* Central Standard Time (UTC-6): 15 December 2026 runs 06:00Z → 06:00Z. */
  cstBeforeMidnight: "2026-12-15T05:30:00Z", // Mon 14 Dec, 11:30pm CST
  cstEvening: "2026-12-16T01:15:00Z", //        Tue 15 Dec,  7:15pm CST (after UTC midnight)
  cstLateNight: "2026-12-16T05:30:00Z", //      Tue 15 Dec, 11:30pm CST
  cstNextMidnight: "2026-12-16T06:00:00Z", //   Wed 16 Dec, 12:00am CST
  /* Spring forward, Sun 8 March 2026: a 23-hour day, 06:00Z → 05:00Z. */
  springBefore: "2026-03-08T05:30:00Z", //      Sat 7 Mar, 11:30pm CST
  springAfterChange: "2026-03-08T08:30:00Z", // Sun 8 Mar,  3:30am CDT
  springLateNight: "2026-03-09T04:30:00Z", //   Sun 8 Mar, 11:30pm CDT
  springNextDay: "2026-03-09T05:15:00Z", //     Mon 9 Mar, 12:15am CDT
  /* Fall back, Sun 1 November 2026: a 25-hour day, 05:00Z → 06:00Z. */
  fallBefore: "2026-11-01T04:30:00Z", //        Sat 31 Oct, 11:30pm CDT
  fallRepeatedHour: "2026-11-01T06:30:00Z", //  Sun 1 Nov,  1:30am CST (the second 1:30)
  fallLateNight: "2026-11-02T05:30:00Z", //     Sun 1 Nov, 11:30pm CST
  fallNextDay: "2026-11-02T06:00:00Z", //       Mon 2 Nov, 12:00am CST
  /* The month boundary for "This month" (1 October 2026 starts at 05:00Z). */
  septemberLastEvening: "2026-10-01T03:00:00Z", // Wed 30 Sep, 10:00pm CDT
} as const;

beforeAll(async () => {
  harness = await createMigratedTestDatabase(ALL_MIGRATIONS, { platform: PLATFORM });
  await harness.db.query(`insert into auth.users (id) values ($1)`, [MANAGER.id]);
  await harness.db.query(
    `insert into public.app_users (id, email, display_name, role, status, scope_level, scope_primary_area_id)
     values ($1, 'lm@example.test', 'Test Location Manager', 'location_manager', 'active', 'location', 'loc-101')`,
    [MANAGER.id],
  );

  record = await import("@/lib/analytics/record");
  store = await import("@/lib/feedback/store");
  feedbackQueries = await import("@/lib/analytics/feedback-queries");
  usageQueries = await import("@/lib/analytics/queries");
  filters = await import("@/lib/analytics/filters");

  for (const instant of Object.values(MOMENTS)) await ratedAt(instant);
}, 180_000);

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await harness?.close();
});

describe("Conversation Feedback counts a rating on its Central Time day", () => {
  it("Central Daylight Time: the 9:30pm rating is on the 9th, and the day ends at Central midnight", async () => {
    /* cdtMidnight, cdtLateEvening, cdtLastSecond. Was 1 (only cdtMidnight) at UTC bounds. */
    expect(await ratingsOn("2026-10-09")).toBe(3);
    /* cdtBeforeMidnight is the 8th's; cdtNextMidnight is the 10th's. */
    expect(await ratingsOn("2026-10-08")).toBe(1);
    expect(await ratingsOn("2026-10-10")).toBe(1);
  });

  it("Central Standard Time: a 7:15pm and an 11:30pm rating are both on the 15th", async () => {
    expect(await ratingsOn("2026-12-15")).toBe(2);
    expect(await ratingsOn("2026-12-14")).toBe(1);
    expect(await ratingsOn("2026-12-16")).toBe(1);
  });

  it("spring forward: the 23-hour 8 March keeps its own late evening and nothing of the 7th", async () => {
    expect(await ratingsOn("2026-03-08")).toBe(2);
    expect(await ratingsOn("2026-03-07")).toBe(1);
    expect(await ratingsOn("2026-03-09")).toBe(1);
  });

  it("fall back: the 25-hour 1 November includes its repeated hour and its late evening", async () => {
    expect(await ratingsOn("2026-11-01")).toBe(2);
    expect(await ratingsOn("2026-10-31")).toBe(1);
    expect(await ratingsOn("2026-11-02")).toBe(1);
  });

  it("every rating lands on exactly one day: the single days add up to the whole range", async () => {
    const whole = await feedbackQueries.loadFeedbackAnalytics({
      ...filters.EMPTY_FILTERS,
      from: "2026-03-01",
      to: "2026-12-31",
    });
    expect(whole.summary.responses).toBe(Object.keys(MOMENTS).length);
  });
});

describe("the preset ranges, read late on a Central evening", () => {
  it("“Last 7 days” at 9:45pm CDT on the 9th includes that evening's ratings", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-10T02:45:00Z"), toFake: ["Date"] });
    const snapshot = await feedbackQueries.loadFeedbackAnalytics({ ...filters.EMPTY_FILTERS, range: "7d" });
    expect(snapshot.window.fromDate).toBe("2026-10-03");
    expect(snapshot.window.toDate).toBe("2026-10-10");
    /* 8 Oct 11:30pm, 9 Oct 12:00am, 9:30pm, 11:59:59pm — and not the 30th of September. */
    expect(snapshot.summary.responses).toBe(4);
  });

  it("“This month” starts at Central midnight on the 1st, and the prior period gets the 30th's evening", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-10T02:45:00Z"), toFake: ["Date"] });
    const snapshot = await feedbackQueries.loadFeedbackAnalytics({ ...filters.EMPTY_FILTERS, range: "mtd" });
    expect(snapshot.window.from).toBe("2026-10-01T05:00:00.000Z");
    expect(snapshot.summary.responses).toBe(4);
    expect(snapshot.window.previousFromDate).toBe("2026-09-22");
    expect(snapshot.previousSummary.responses).toBe(1);
  });
});

/*
 * `point.date` is sliced because PGlite hands a `date` column back as a full
 * ISO instant where PostgREST sends "yyyy-mm-dd"; the day itself is the SQL's.
 */
describe("the usage charts use Central days and hours too", () => {
  it("the trend puts the 9:30pm answer on the 9th, not the 10th", async () => {
    const snapshot = await usageQueries.loadAnalytics({
      ...filters.EMPTY_FILTERS,
      from: "2026-10-09",
      to: "2026-10-10",
    });
    expect(snapshot.trend.map((point) => [point.date.slice(0, 10), point.events])).toEqual([
      ["2026-10-09", 3],
      ["2026-10-10", 1],
    ]);
  });

  it("the trend's days are 23 and 25 hours long across the changeovers", async () => {
    const spring = await usageQueries.loadAnalytics({ ...filters.EMPTY_FILTERS, from: "2026-03-07", to: "2026-03-09" });
    expect(spring.trend.map((point) => [point.date.slice(0, 10), point.events])).toEqual([
      ["2026-03-07", 1],
      ["2026-03-08", 2],
      ["2026-03-09", 1],
    ]);
    const fall = await usageQueries.loadAnalytics({ ...filters.EMPTY_FILTERS, from: "2026-10-31", to: "2026-11-02" });
    expect(fall.trend.map((point) => [point.date.slice(0, 10), point.events])).toEqual([
      ["2026-10-31", 1],
      ["2026-11-01", 2],
      ["2026-11-02", 1],
    ]);
  });

  it("“when people ask” reads the 9:30pm answer as Friday at 21:00 Central", async () => {
    const snapshot = await feedbackQueries.loadFeedbackAnalytics(day("2026-10-09"));
    expect(snapshot.when).toEqual(
      expect.arrayContaining([
        { dayOfWeek: 5, hourOfDay: 0, events: 1 },
        { dayOfWeek: 5, hourOfDay: 21, events: 1 },
        { dayOfWeek: 5, hourOfDay: 23, events: 1 },
      ]),
    );
    expect(snapshot.when.reduce((sum, row) => sum + row.events, 0)).toBe(3);
  });
});

describe("the database functions fall back to Central, never Eastern", () => {
  it("an unknown or missing zone buckets in America/Chicago", async () => {
    const from = "2026-10-09T05:00:00Z";
    const to = "2026-10-10T05:00:00Z";
    const unknown = await harness.db.query<{ hour_of_day: number }>(
      `select hour_of_day from public.analytics_when($1, $2, 'Not/AZone') order by hour_of_day`,
      [from, to],
    );
    expect(unknown.rows.map((row) => row.hour_of_day)).toEqual([0, 21, 23]);

    const trend = await harness.db.query<{ bucket_start: string | Date }>(
      `select bucket_start from public.analytics_trend($1, $2) order by 1`,
      [from, to],
    );
    const dates = trend.rows.map((row) =>
      row.bucket_start instanceof Date ? row.bucket_start.toISOString().slice(0, 10) : String(row.bucket_start),
    );
    expect(dates).toEqual(["2026-10-09"]);
  });

  it("neither function can be called by the browser roles", async () => {
    const grants = await harness.db.query<{ fn: string; anon: boolean; authenticated: boolean; service: boolean }>(
      `select p.proname as fn,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
              has_function_privilege('service_role', p.oid, 'execute') as service
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('analytics_trend', 'analytics_when')
        order by 1`,
    );
    expect(grants.rows).toEqual([
      { fn: "analytics_trend", anon: false, authenticated: false, service: true },
      { fn: "analytics_when", anon: false, authenticated: false, service: true },
    ]);
  });
});
