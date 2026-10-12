import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readGoogleReviewsConfig } from "./config";
import { REFRESH_TOKEN_LABEL, seal } from "./crypto";
import { BUSINESS_SCOPE } from "./oauth";
import { createSupabaseGoogleStore, type GoogleReviewsStore } from "./store";
import { runGoogleReviewsSync, type SyncOutcome } from "./sync";
import {
  allBuffLocations,
  buffLocation,
  createGoogleFake,
  createGoogleTestDatabase,
  sunTanCityLocations,
  type GoogleFake,
  type GoogleTestDatabase,
} from "./test-support";

/**
 * THE SYNC, END TO END, ON THE REAL SCHEMA: PGlite running the repository's own
 * migration, the real store (RPC calls), the real client, matcher and normalizer
 * — against a programmable fake of Google. No network.
 */

const KEY = randomBytes(32);
const oauth = { clientId: "client-id", clientSecret: "SECRET-CLIENT-VALUE", redirectUri: "https://askbubbles.example/api/admin/google-reviews/callback" };
const ENV_ON = { GOOGLE_REVIEWS_SYNC_ENABLED: "true", GOOGLE_REVIEWS_WRITES_ENABLED: "true", GOOGLE_OAUTH_CLIENT_ID: "x", GOOGLE_OAUTH_CLIENT_SECRET: "y", GOOGLE_TOKEN_ENCRYPTION_KEY: "z" };

let d: GoogleTestDatabase;
let store: GoogleReviewsStore;
let clock: { t: number };

beforeEach(async () => {
  d = await createGoogleTestDatabase();
  store = createSupabaseGoogleStore(d.client);
  clock = { t: 1_800_000_000_000 };
});
afterEach(async () => {
  await d.close();
});

const connect = () => store.saveConnection(seal("REFRESH-TOKEN-SECRET", REFRESH_TOKEN_LABEL, KEY), [BUSINESS_SCOPE], "admin@example.invalid");
const q = async <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await d.db.query<T>(sql, params)).rows;

function sync(fake: GoogleFake, over: Partial<Parameters<typeof runGoogleReviewsSync>[0]> = {}): Promise<SyncOutcome> {
  return runGoogleReviewsSync({
    requestedBy: "admin:tester",
    config: readGoogleReviewsConfig(ENV_ON),
    oauth,
    store,
    fetchImpl: fake.fetchImpl,
    sleep: async (ms) => { clock.t += ms; },
    now: () => clock.t,
    encryptionKey: KEY,
    ...over,
  });
}

const fullWorld = (reviews = 3) => createGoogleFake([...allBuffLocations(reviews), ...sunTanCityLocations()]);
const counts = async () => ({
  reviews: Number((await q<{ n: string }>(`select count(*)::text as n from public.google_reviews`))[0]!.n),
  linked: Number((await q<{ n: string }>(`select count(*)::text as n from public.google_review_locations where google_location_name is not null`))[0]!.n),
});

describe("a full, healthy sync", () => {
  it("links all seven Buff City Soap stores, saves every review, and never touches the fifteen Sun Tan City profiles", async () => {
    await connect();
    const fake = fullWorld(3);
    const out = await sync(fake);

    expect(out).toMatchObject({ status: "succeeded", mode: "save", code: null, storesLinked: 7, storesTotal: 7, accountsListed: 1, googleLocationsSeen: 22, blockedOtherBrand: 15 });
    expect(out.totals).toMatchObject({ fetched: 21, inserted: 21, updated: 0, unchanged: 0, removed: 0, rejected: 0 });
    expect(out.stores.map((s) => [s.storeCode, s.link, s.read, s.complete])).toEqual(["219", "225", "236", "264", "338", "66", "67"].map((c) => [c, "matched", true, true]));
    expect(await counts()).toEqual({ reviews: 21, linked: 7 });

    // nothing from another brand reached the database, in any column
    const dump = JSON.stringify(await q(`select * from public.google_reviews`)) + JSON.stringify(await q(`select * from public.google_review_locations`)) + JSON.stringify(await q(`select * from public.google_review_audit`));
    expect(dump).not.toMatch(/SUNTANCITY|Sun Tan City|stc-/);
    // and the reviewer's identity was never stored
    expect(dump).not.toMatch(/Zzreviewer|example\.invalid\/p\.jpg|isAnonymous/);
    // the Google review endpoint was requested for the seven stores only
    const reviewCalls = fake.calls.filter((c) => c.host === "mybusiness.googleapis.com");
    expect(new Set(reviewCalls.map((c) => c.path)).size).toBe(7);
    // read-only against Google: every call is a GET (the token endpoint is the OAuth refresh)
    expect(fake.calls.filter((c) => c.host !== "oauth2.googleapis.com").every((c) => c.method === "GET")).toBe(true);
  });

  it("is idempotent: a second run changes nothing, and the run history records both", async () => {
    await connect();
    const fake = fullWorld(3);
    await sync(fake);
    const second = await sync(fake);
    expect(second).toMatchObject({ status: "succeeded" });
    expect(second.totals).toMatchObject({ fetched: 21, inserted: 0, updated: 0, unchanged: 21, removed: 0 });
    expect((await counts()).reviews).toBe(21);
    expect((await q(`select status from public.google_review_sync_runs order by started_at`)).map((r) => r.status)).toEqual(["succeeded", "succeeded"]);
  });

  it("pages through large review lists (page size 50 → many pages) and stores them all", async () => {
    await connect();
    const fake = createGoogleFake([buffLocation("219", Array.from({ length: 137 }, (_, i) => ({ id: `big-${i}` })))]);
    const out = await sync(fake);
    expect(out.stores.find((s) => s.storeCode === "219")).toMatchObject({ read: true, complete: true, reviewsFetched: 137 });
    expect((await counts()).reviews).toBe(137);
    expect(fake.calls.filter((c) => c.host === "mybusiness.googleapis.com").length).toBe(3);
    // the other six stores are not in this Google account: partial, never a pretend success
    expect(out.status).toBe("partial");
    expect(out.stores.filter((s) => s.link === "unmatched")).toHaveLength(6);
  });

  it("the outcome carries codes and counts only: no review text, reviewer, token or Google body", async () => {
    await connect();
    const out = JSON.stringify(await sync(fullWorld(2)));
    expect(out).not.toMatch(/review \d|Zzreviewer|REFRESH-TOKEN|ACCESS-TOKEN|SECRET-CLIENT|bob@example/);
  });
});

describe("reconciliation of changed reviews", () => {
  it("updates a review whose rating, text or reply changed, restores one that returns, and marks one that vanished removed (only on a complete read)", async () => {
    await connect();
    const loc = buffLocation("66", Array.from({ length: 12 }, (_, i) => ({ id: `k${i}`, comment: `text ${i}` })));
    const fake = createGoogleFake([loc]);
    await sync(fake);

    loc.reviews[0] = { id: "k0", comment: "text 0 (edited)", rating: "TWO", updateTime: "2026-10-05T00:00:00Z", reply: "Thanks for the feedback" };
    const removed = loc.reviews.splice(5, 1)[0]!;
    const out = await sync(fake);
    expect(out.stores.find((s) => s.storeCode === "66")!.applied).toMatchObject({ updated: 1, unchanged: 10, removed: 1, restored: 0 });
    const row = (await q(`select comment, star_rating, reply_comment, has_reply from public.google_reviews where google_review_id = 'k0'`))[0]!;
    expect(row).toMatchObject({ comment: "text 0 (edited)", star_rating: 2, reply_comment: "Thanks for the feedback", has_reply: true });
    expect((await q(`select google_review_id from public.google_reviews where removed_at is not null`)).map((r) => r.google_review_id)).toEqual([removed.id]);

    loc.reviews.push(removed);
    const back = await sync(fake);
    expect(back.stores.find((s) => s.storeCode === "66")!.applied).toMatchObject({ restored: 1, removed: 0 });
    expect(await q(`select 1 from public.google_reviews where removed_at is not null`)).toHaveLength(0);
  });

  it("never marks anything removed after an INCOMPLETE read (a looping page token) — and reports the store as incomplete", async () => {
    await connect();
    const loc = buffLocation("67", Array.from({ length: 10 }, (_, i) => ({ id: `b${i}` })));
    const fake = createGoogleFake([loc]);
    await sync(fake);
    fake.knobs.loopPagesFor.add(loc.locationId);
    const out = await sync(fake);
    expect(out.stores.find((s) => s.storeCode === "67")).toMatchObject({ read: true, complete: false });
    expect(await q(`select 1 from public.google_reviews where removed_at is not null`)).toHaveLength(0);
    expect(out.status).toBe("partial");
  });

  it("a review Google returned under a DIFFERENT store's location is rejected, makes the read incomplete, and is never stored", async () => {
    await connect();
    const a = buffLocation("219", [{ id: "a1" }, { id: "a2", nameOverride: "accounts/10/locations/99999/reviews/a2" }]);
    const fake = createGoogleFake([a]);
    const out = await sync(fake);
    expect(out.stores.find((s) => s.storeCode === "219")).toMatchObject({ reviewsFetched: 1, rejected: 1, complete: false });
    expect((await q(`select google_review_id from public.google_reviews`)).map((r) => r.google_review_id)).toEqual(["a1"]);
  });

  it("the mass-removal guard refuses a 'complete' read that would remove most reviews; the store is reported failed and nothing changes", async () => {
    await connect();
    const loc = buffLocation("225", Array.from({ length: 20 }, (_, i) => ({ id: `m${i}` })));
    const fake = createGoogleFake([loc]);
    await sync(fake);
    loc.reviews.splice(1); // Google now answers with 1 of 20 — and says its total is 1
    const out = await sync(fake);
    expect(out.stores.find((s) => s.storeCode === "225")).toMatchObject({ failure: "removal_guard" });
    expect((await counts()).reviews).toBe(20);
    expect(await q(`select 1 from public.google_reviews where removed_at is not null`)).toHaveLength(0);
    expect((await q(`select last_sync_status, last_sync_error from public.google_review_locations where store_code = '225'`))[0]).toMatchObject({ last_sync_status: "failed", last_sync_error: "removal_guard" });
  });

  it("a review count smaller than Google's own total is treated as incomplete", async () => {
    await connect();
    const loc = buffLocation("236", [{ id: "t1" }, { id: "t2" }, { id: "t3" }]);
    const fake = createGoogleFake([loc]);
    const original = fake.fetchImpl;
    fake.fetchImpl = async (url, init) => {
      const res = await original(url, init);
      if (!url.includes("/reviews")) return res;
      const body = (await res.json()) as Record<string, unknown>;
      return new Response(JSON.stringify({ ...body, totalReviewCount: 10 }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const out = await sync(fake);
    expect(out.stores.find((s) => s.storeCode === "236")).toMatchObject({ reviewsFetched: 3, complete: false });
  });
});

describe("linking stores to Google locations", () => {
  it("an address-only match (no store code in the profile) is a CANDIDATE: not read, shown for confirmation; once an administrator confirms it, it is read", async () => {
    await connect();
    const loc = buffLocation("264", [{ id: "o1" }], { storeCode: null });
    const fake = createGoogleFake([loc]);
    const first = await sync(fake);
    expect(first.stores.find((s) => s.storeCode === "264")).toMatchObject({ link: "candidate", read: false });
    expect((await counts()).reviews).toBe(0);
    const evidence = await store.getLocationEvidence("264");
    expect(evidence).toMatchObject({ matchStatus: "candidate" });
    expect((evidence!.evidence.candidate as Record<string, unknown>).location).toBe(`locations/${loc.locationId}`);

    await store.recordLink("264", "accounts/10", `locations/${loc.locationId}`, "confirmed", "high", { confirmed: true }, "admin@example.invalid");
    const second = await sync(fake);
    expect(second.stores.find((s) => s.storeCode === "264")).toMatchObject({ link: "confirmed", read: true, complete: true });
    expect((await counts()).reviews).toBe(1);
    // a later automatic result never downgrades the confirmation
    expect((await q(`select match_status from public.google_review_locations where store_code = '264'`))[0]!.match_status).toBe("confirmed");
  });

  it("a confirmed link whose Google location has vanished is skipped and reported, never downgraded", async () => {
    await connect();
    await store.recordLink("66", "accounts/10", "locations/424242", "confirmed", "high", {}, "admin");
    const out = await sync(createGoogleFake([buffLocation("219", [{ id: "x" }])]));
    expect(out.stores.find((s) => s.storeCode === "66")).toMatchObject({ link: "confirmed", read: false, failure: "confirmed_link_not_found" });
    expect((await q(`select match_status from public.google_review_locations where store_code = '66'`))[0]!.match_status).toBe("confirmed");
  });

  it("a Sun Tan City profile that borrows an approved store's code and address is BLOCKED by its title and links nothing", async () => {
    await connect();
    const real = buffLocation("219", [{ id: "r1" }]);
    const impostor = buffLocation("219", [{ id: "SUNTANCITY-LEAK" }], { title: "Sun Tan City - Lee's Summit" });
    const out = await sync(createGoogleFake([impostor, real]));
    expect(out.blockedOtherBrand).toBe(1);
    expect(out.stores.find((s) => s.storeCode === "219")).toMatchObject({ link: "matched", complete: true });
    expect(JSON.stringify(await q(`select * from public.google_reviews`))).not.toMatch(/SUNTANCITY/);
    expect((await q(`select google_location_name from public.google_review_locations where store_code = '219'`))[0]!.google_location_name).toBe(`locations/${real.locationId}`);
  });

  it("two stores can never end up linked to the same Google location (the second is reported, the run continues)", async () => {
    await connect();
    await store.recordLink("225", "accounts/10", "locations/777", "matched", "high", {}, "t");
    await expect(store.recordLink("338", "accounts/10", "locations/777", "matched", "high", {}, "t")).rejects.toThrow();
  });
});

describe("authorization and Google availability", () => {
  it("with no connection, fails as not_connected and writes only its run row", async () => {
    const out = await sync(fullWorld());
    expect(out).toMatchObject({ status: "failed", code: "not_connected" });
    expect(await counts()).toEqual({ reviews: 0, linked: 0 });
  });

  it("a revoked grant (invalid_grant) ends the connection as expired and fails as authorization_expired", async () => {
    await connect();
    const fake = fullWorld();
    fake.knobs.tokenStatus = 400;
    fake.knobs.tokenError = "invalid_grant";
    const out = await sync(fake);
    expect(out).toMatchObject({ status: "failed", code: "authorization_expired" });
    expect(await store.getActiveConnection()).toBeNull();
    expect((await q(`select status, last_error_code from public.google_business_connections`))[0]).toMatchObject({ status: "expired", last_error_code: "invalid_grant" });
    expect(JSON.stringify(out)).not.toMatch(/bob@example/);
  });

  it("a project Google has not approved (429, quota 0) fails as api_access_pending, keeps the connection, and writes nothing", async () => {
    await connect();
    const fake = fullWorld();
    fake.knobs.quotaZero = true;
    const out = await sync(fake);
    expect(out).toMatchObject({ status: "failed", code: "api_access_pending" });
    expect(out.reason).toMatch(/has not yet approved/);
    expect(await store.getActiveConnection()).not.toBeNull();
    expect(await counts()).toEqual({ reviews: 0, linked: 0 });
    // not retried as if it were a rate limit
    expect(fake.calls.filter((c) => c.host !== "oauth2.googleapis.com")).toHaveLength(1);
  });

  it("an expired access token mid-run (401) is refreshed once and the run completes", async () => {
    await connect();
    const fake = fullWorld(2);
    fake.knobs.unauthorizedOnce = true;
    const out = await sync(fake);
    expect(out.status).toBe("succeeded");
    expect(fake.knobs.refreshes).toBe(2);
  });

  it("one store's failing review endpoint does not stop the others: the run is PARTIAL and names the failure", async () => {
    await connect();
    const fake = fullWorld(2);
    const broken = fake.locations.find((l) => l.storeCode === "338")!;
    fake.knobs.failReviewsFor.add(broken.locationId);
    const out = await sync(fake, { sleep: async () => undefined });
    expect(out.status).toBe("partial");
    expect(out.stores.find((s) => s.storeCode === "338")).toMatchObject({ failure: "server_error", read: false });
    expect(out.stores.filter((s) => s.read && s.complete)).toHaveLength(6);
    expect((await counts()).reviews).toBe(12);
    expect((await q(`select last_sync_status, last_sync_error from public.google_review_locations where store_code = '338'`))[0]).toMatchObject({ last_sync_status: "failed", last_sync_error: "server_error" });
  });

  it("stops starting new reads when the time budget runs out and reports the run partial", async () => {
    await connect();
    const fake = fullWorld(1);
    let ticks = 0;
    const out = await sync(fake, { now: () => clock.t + ticks++ * 100_000, limits: { readBudgetMs: 150_000 } });
    expect(out.status).toBe("partial");
    expect(out.code).toBe("time_budget_exceeded");
    expect(out.stores.some((s) => s.failure === "time_budget_exceeded")).toBe(true);
  });
});

describe("switches and the run lock", () => {
  it("is disabled by default, refuses a save without the writes switch, and demands credentials", async () => {
    const fake = fullWorld();
    expect(await sync(fake, { config: readGoogleReviewsConfig({}) })).toMatchObject({ status: "disabled", code: "disabled" });
    expect(await sync(fake, { config: readGoogleReviewsConfig({ ...ENV_ON, GOOGLE_REVIEWS_WRITES_ENABLED: "false" }) })).toMatchObject({ status: "refused", code: "writes_disabled" });
    const noCreds = await sync(fake, { config: readGoogleReviewsConfig({ GOOGLE_REVIEWS_SYNC_ENABLED: "true", GOOGLE_REVIEWS_WRITES_ENABLED: "true" }), oauth: null });
    expect(noCreds).toMatchObject({ status: "not_configured", missing: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_TOKEN_ENCRYPTION_KEY"] });
    expect(fake.calls).toHaveLength(0); // nothing reached Google
  });

  it("only one run at a time: a second concurrent claim is `busy`", async () => {
    await connect();
    const held = await store.claimRun("someone-else", "save");
    expect(held).toBeTruthy();
    expect(await sync(fullWorld())).toMatchObject({ status: "busy", code: "busy" });
  });

  it("a DRY RUN reads Google and reports, but links nothing and saves nothing", async () => {
    await connect();
    const fake = fullWorld(3);
    const out = await sync(fake, { dryRun: true, config: readGoogleReviewsConfig({ ...ENV_ON, GOOGLE_REVIEWS_WRITES_ENABLED: "false" }) });
    expect(out).toMatchObject({ status: "succeeded", mode: "dry_run" });
    expect(out.totals.fetched).toBe(21);
    expect(await counts()).toEqual({ reviews: 0, linked: 0 });
    expect(await q(`select 1 from public.google_review_audit where action like 'link_%'`)).toHaveLength(0);
    expect((await q(`select mode, status from public.google_review_sync_runs`))[0]).toMatchObject({ mode: "dry_run", status: "succeeded" });
  });

  it("the sealed refresh token is never stored in the clear and cannot be opened with another key", async () => {
    await connect();
    expect(JSON.stringify(await q(`select * from public.google_business_connections`))).not.toContain("REFRESH-TOKEN-SECRET");
    const out = await sync(fullWorld(1), { encryptionKey: randomBytes(32) });
    expect(out).toMatchObject({ status: "failed", code: "not_configured" });
    expect(await store.getActiveConnection()).not.toBeNull(); // a key mix-up does not destroy the connection
  });
});
