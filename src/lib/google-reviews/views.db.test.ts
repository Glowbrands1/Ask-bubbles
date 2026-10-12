import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readGoogleReviewsConfig } from "./config";
import { classifyDatabaseError } from "./database-error";
import { REFRESH_TOKEN_LABEL, seal } from "./crypto";
import { BUSINESS_SCOPE } from "./oauth";
import { createSupabaseGoogleStore } from "./store";
import { runGoogleReviewsSync } from "./sync";
import { allBuffLocations, buffLocation, createGoogleFake, createGoogleTestDatabase, type GoogleTestDatabase } from "./test-support";
import {
  EMPTY_QUERY,
  PAGE_SIZE,
  centralDayAfter,
  centralDayStart,
  deriveBlocker,
  parseReviewQuery,
  readConnectionState,
  readRecentRuns,
  readReviewPage,
  readStoreSummaries,
  summarize,
  type ConnectionState,
  type RunRow,
} from "./views";

const KEY = randomBytes(32);
const oauth = { clientId: "c", clientSecret: "s", redirectUri: "https://x.example/cb" };
const ENV_ON = { GOOGLE_REVIEWS_SYNC_ENABLED: "true", GOOGLE_REVIEWS_WRITES_ENABLED: "true", GOOGLE_OAUTH_CLIENT_ID: "x", GOOGLE_OAUTH_CLIENT_SECRET: "y", GOOGLE_TOKEN_ENCRYPTION_KEY: "z" };

describe("parseReviewQuery", () => {
  it("accepts only known stores, ratings 1–5, the two reply states, real calendar days and a positive page", () => {
    expect(parseReviewQuery(new URLSearchParams("store=219&rating=4&reply=unanswered&from=2026-09-01&to=2026-09-30&page=3&removed=1"))).toEqual({ store: "219", rating: 4, reply: "unanswered", from: "2026-09-01", to: "2026-09-30", removed: true, page: 3 });
    expect(parseReviewQuery({ store: ["66", "67"], rating: "5" })).toMatchObject({ store: "66", rating: 5 });
  });

  it("turns everything else into 'no filter' — a Sun Tan City store code, injection, impossible dates, out-of-range numbers", () => {
    const q = parseReviewQuery(new URLSearchParams("store=140&rating=9&reply=maybe&from=2026-02-30&to=yesterday&page=-4&removed=yes"));
    expect(q).toEqual(EMPTY_QUERY);
    expect(parseReviewQuery(new URLSearchParams("store=219'%20or%201=1--&rating=1;drop"))).toEqual(EMPTY_QUERY);
    expect(parseReviewQuery(new URLSearchParams("page=999999999"))).toMatchObject({ page: 1 });
    expect(parseReviewQuery({})).toEqual(EMPTY_QUERY);
  });
});

describe("Central-time day bounds", () => {
  it("starts a day at midnight Central, across both daylight-saving transitions", () => {
    expect(centralDayStart("2026-01-15")).toBe("2026-01-15T06:00:00.000Z"); // CST, UTC−6
    expect(centralDayStart("2026-07-15")).toBe("2026-07-15T05:00:00.000Z"); // CDT, UTC−5
    expect(centralDayStart("2026-03-08")).toBe("2026-03-08T06:00:00.000Z"); // the spring-forward day starts in CST
    expect(centralDayStart("2026-03-09")).toBe("2026-03-09T05:00:00.000Z");
    expect(centralDayStart("2026-11-01")).toBe("2026-11-01T05:00:00.000Z"); // the fall-back day starts in CDT
    expect(centralDayStart("2026-11-02")).toBe("2026-11-02T06:00:00.000Z");
  });

  it("the exclusive end bound is the start of the NEXT Central day (so a day is 23, 24 or 25 hours long)", () => {
    expect(centralDayAfter("2026-03-08")).toBe("2026-03-09T05:00:00.000Z");
    expect(Date.parse(centralDayAfter("2026-03-08")) - Date.parse(centralDayStart("2026-03-08"))).toBe(23 * 3600 * 1000);
    expect(Date.parse(centralDayAfter("2026-11-01")) - Date.parse(centralDayStart("2026-11-01"))).toBe(25 * 3600 * 1000);
    expect(Date.parse(centralDayAfter("2026-06-10")) - Date.parse(centralDayStart("2026-06-10"))).toBe(24 * 3600 * 1000);
  });
});

describe("summaries and the blocker", () => {
  const store = (over: object) => ({ matchStatus: "matched", reviewCount: 0, averageRating: null, unansweredCount: 0, ...over }) as Parameters<typeof summarize>[0][number];

  it("totals reviews, a review-weighted average, unanswered and linked stores", () => {
    const s = summarize([store({ reviewCount: 10, averageRating: 5, unansweredCount: 2 }), store({ reviewCount: 30, averageRating: 3, unansweredCount: 5, matchStatus: "confirmed" }), store({ matchStatus: "candidate" })]);
    expect(s).toEqual({ reviews: 40, average: 3.5, unanswered: 7, storesLinked: 2, storesTotal: 3 });
    expect(summarize([]).average).toBeNull();
  });

  const ok = { enabled: true, credentialsReady: true, missingCredentials: [] as string[], connection: { state: "active", connectedAt: "t", connectedBy: "a", lastUsedAt: null } as ConnectionState, lastRun: null as RunRow | null };
  const run = (status: RunRow["status"], errorCode: string | null) => ({ status, errorCode } as RunRow);

  it("names the single blocking step in priority order, and is null when nothing blocks", () => {
    expect(deriveBlocker({ ...ok, credentialsReady: false, missingCredentials: ["GOOGLE_OAUTH_CLIENT_ID"] })).toEqual({ code: "not_configured", missing: ["GOOGLE_OAUTH_CLIENT_ID"] });
    expect(deriveBlocker({ ...ok, enabled: false })).toEqual({ code: "disabled" });
    expect(deriveBlocker({ ...ok, connection: { state: "none" } })).toEqual({ code: "not_connected" });
    expect(deriveBlocker({ ...ok, connection: { state: "expired", endedAt: null, errorCode: "invalid_grant" } })).toEqual({ code: "authorization_expired" });
    expect(deriveBlocker({ ...ok, lastRun: run("failed", "api_access_pending") })).toEqual({ code: "api_access_pending" });
    expect(deriveBlocker({ ...ok, lastRun: run("failed", "api_disabled") })).toEqual({ code: "api_disabled" });
    expect(deriveBlocker({ ...ok, lastRun: run("failed", "network_error") })).toEqual({ code: "last_run_failed", errorCode: "network_error" });
    expect(deriveBlocker({ ...ok, lastRun: run("failed", "busy") })).toBeNull();
    expect(deriveBlocker({ ...ok, lastRun: run("succeeded", null) })).toBeNull();
    expect(deriveBlocker(ok)).toBeNull();
  });

  it("tells a missing table from an unreachable database", () => {
    expect(classifyDatabaseError({ code: "42P01", message: "x" })).toBe("missing");
    expect(classifyDatabaseError({ code: "PGRST205", message: "x" })).toBe("missing");
    expect(classifyDatabaseError({ message: 'relation "public.google_reviews" does not exist' })).toBe("missing");
    expect(classifyDatabaseError({ code: "08006", message: "connection failure" })).toBe("unavailable");
    expect(classifyDatabaseError(null)).toBe("unavailable");
  });
});

describe("reads over a real sync's data", () => {
  let d: GoogleTestDatabase;
  beforeEach(async () => {
    d = await createGoogleTestDatabase();
  });
  afterEach(async () => {
    await d.close();
  });

  async function populate() {
    const store = createSupabaseGoogleStore(d.client);
    await store.saveConnection(seal("REFRESH", REFRESH_TOKEN_LABEL, KEY), [BUSINESS_SCOPE], "admin@example.invalid");
    const locations = allBuffLocations(0);
    // a spread of ratings, replies and dates across two stores; one store with no reviews at all; one address-only candidate
    locations[0]!.reviews = [
      { id: "a1", rating: "FIVE", createTime: "2026-10-03T15:00:00Z" },
      { id: "a2", rating: "ONE", createTime: "2026-10-02T15:00:00Z", reply: "We are sorry" },
      { id: "a3", rating: "THREE", createTime: "2026-09-10T15:00:00Z" },
    ];
    locations[1]!.reviews = Array.from({ length: 45 }, (_, i) => ({ id: `b${i}`, rating: "FOUR" as const, createTime: new Date(Date.UTC(2026, 8, 1, 12, i)).toISOString() }));
    locations[5] = buffLocation("66", [], { storeCode: null }); // Kearney: address only → candidate
    const fake = createGoogleFake(locations);
    await runGoogleReviewsSync({ requestedBy: "admin:test", config: readGoogleReviewsConfig(ENV_ON), oauth, store, fetchImpl: fake.fetchImpl, sleep: async () => undefined, encryptionKey: KEY });
  }

  it("store summaries carry totals, the rating spread, the unanswered count and — for a candidate — what to decide on", async () => {
    await populate();
    const stores = await readStoreSummaries(d.client);
    expect(stores.map((s) => s.storeCode)).toEqual(["219", "225", "236", "264", "338", "66", "67"]); // the allowlist's own order
    const s219 = stores[0]!;
    expect(s219).toMatchObject({ matchStatus: "matched", reviewCount: 3, unansweredCount: 2, ratings: [1, 0, 1, 0, 1], lastSyncStatus: "complete" });
    expect(s219.averageRating).toBeCloseTo(3, 1);
    expect(s219.address).toBe("2050 NW Lowenstein Dr, Ste C, Lee's Summit, MO 64081");
    expect(stores[1]).toMatchObject({ reviewCount: 45, unansweredCount: 45 });
    const kearney = stores.find((s) => s.storeCode === "66")!;
    expect(kearney.matchStatus).toBe("candidate");
    expect(kearney.candidate).toMatchObject({ title: "Buff City Soap - Kearney", city: "Kearney", state: "NE" });
    expect(kearney.reviewCount).toBe(0);
    const total = summarize(stores);
    expect(total).toMatchObject({ reviews: 48, storesLinked: 6, storesTotal: 7, unanswered: 47 });
  });

  it("the review page filters, pages and counts on the server, newest first", async () => {
    await populate();
    const all = await readReviewPage(EMPTY_QUERY, d.client);
    expect(all).toMatchObject({ total: 48, page: 1, pageSize: PAGE_SIZE });
    expect(all.rows).toHaveLength(PAGE_SIZE);
    expect(all.rows[0]).toMatchObject({ storeCode: "219", starRating: 5 }); // Oct 3 is the newest
    expect(Object.keys(all.rows[0]!).sort()).toEqual(["comment", "createdAt", "hasReply", "id", "removedAt", "replyComment", "replyUpdatedAt", "starRating", "storeCode", "storeName", "updatedAt"]);
    const page3 = await readReviewPage({ ...EMPTY_QUERY, page: 3 }, d.client);
    expect(page3.rows).toHaveLength(8); // 48 − 40
    expect((await readReviewPage({ ...EMPTY_QUERY, store: "225" }, d.client)).total).toBe(45);
    expect((await readReviewPage({ ...EMPTY_QUERY, rating: 1 }, d.client)).rows.map((r) => r.replyComment)).toEqual(["We are sorry"]);
    expect((await readReviewPage({ ...EMPTY_QUERY, reply: "answered" }, d.client)).total).toBe(1);
    // Central-time day filter: Oct 2 15:00 UTC is Oct 2 10:00 Central
    expect((await readReviewPage({ ...EMPTY_QUERY, from: "2026-10-02", to: "2026-10-02" }, d.client)).rows.map((r) => r.starRating)).toEqual([1]);
    expect((await readReviewPage({ ...EMPTY_QUERY, store: "236" }, d.client)).rows).toEqual([]); // a linked store with no reviews
  });

  it("reads the run history and the connection state", async () => {
    await populate();
    const runs = await readRecentRuns(10, d.client);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: "partial", mode: "save", reviewsFetched: 48, reviewsInserted: 48, locationsComplete: 6 });
    expect(await readConnectionState(d.client)).toMatchObject({ state: "active", connectedBy: "admin@example.invalid" });
    await createSupabaseGoogleStore(d.client).endConnection("expired", "invalid_grant", "system");
    expect(await readConnectionState(d.client)).toMatchObject({ state: "expired", errorCode: "invalid_grant" });
  });

  it("an empty database reads as no connection, no runs, seven unlinked stores and an empty page", async () => {
    expect(await readConnectionState(d.client)).toEqual({ state: "none" });
    expect(await readRecentRuns(10, d.client)).toEqual([]);
    const stores = await readStoreSummaries(d.client);
    expect(stores).toHaveLength(7);
    expect(stores.every((s) => s.matchStatus === "unmatched" && s.reviewCount === 0 && s.averageRating === null)).toBe(true);
    expect(await readReviewPage(EMPTY_QUERY, d.client)).toMatchObject({ total: 0, rows: [] });
  });
});
