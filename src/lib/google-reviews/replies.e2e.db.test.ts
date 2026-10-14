import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REFRESH_TOKEN_LABEL, seal } from "./crypto";
import { BUSINESS_SCOPE } from "./oauth";
import { createSupabaseGoogleStore } from "./store";
import { allBuffLocations, createGoogleFake, createGoogleTestDatabase, type GoogleFake, type GoogleTestDatabase } from "./test-support";
import type { AccessScope, Role } from "@/types";

/**
 * THE WHOLE WORKFLOW, THE WAY STAFF USE IT, in a safe test environment: the real route handlers, the real service, stores and
 * migrations (PGlite), the real dashboard loader — with only the identity provider and the network replaced
 * (a programmable fake of Google; nothing reaches the real Google or the real database).
 */

const KEY = randomBytes(32);
const ENV_KEYS = ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_TOKEN_ENCRYPTION_KEY", "NEXT_PUBLIC_SITE_URL", "GOOGLE_REVIEWS_SYNC_ENABLED", "GOOGLE_REVIEWS_WRITES_ENABLED", "GOOGLE_REVIEWS_REPLIES_ENABLED"] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

let d: GoogleTestDatabase;
let fake: GoogleFake;
let who: { role: Role; scope: AccessScope; verified: boolean; email: string };

const GLOBAL: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const loc = (id: string): AccessScope => ({ level: "location", primaryAreaId: id, alsoCoversAreaIds: [] });
const q = async <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await d.db.query<T>(sql, params)).rows;

beforeEach(async () => {
  vi.resetModules();
  d = await createGoogleTestDatabase();
  process.env.GOOGLE_OAUTH_CLIENT_ID = "client-id";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "CLIENT-SECRET-VALUE";
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = KEY.toString("base64");
  process.env.NEXT_PUBLIC_SITE_URL = "https://askbubbles.example";
  process.env.GOOGLE_REVIEWS_SYNC_ENABLED = "true";
  process.env.GOOGLE_REVIEWS_WRITES_ENABLED = "true";
  process.env.GOOGLE_REVIEWS_REPLIES_ENABLED = "true";
  who = { role: "location_manager", scope: loc("loc-66"), verified: true, email: "kearney.manager@example.test" };

  vi.doMock("@/lib/supabase/server", () => ({ getSupabaseAdmin: () => d.client }));
  vi.doMock("@/lib/api/respond", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/api/respond")>()),
    assertLiveMode: () => {},
    assertNoConfigurationProblems: () => {},
    assertWithinRateLimit: () => {},
  }));
  // The identity provider is the only thing replaced: the permission decision is the SERVER's real matrix.
  vi.doMock("@/lib/auth/server", async () => {
    const { DEFAULT_PERMISSION_MATRIX, hasPermission } = await import("@/lib/permissions");
    const { AuthError } = await import("@/lib/auth/types");
    return {
      authorizeRequest: async (_request: Request, permission: string) => {
        if (!who.verified) throw new AuthError("unauthenticated", "Sign in.");
        if (!hasPermission(DEFAULT_PERMISSION_MATRIX, who.role, permission as never)) throw new AuthError("forbidden", "Your role does not have permission to do that.");
        return { identity: { subject: "u", email: who.email, role: who.role, scope: who.scope, verified: who.verified, displayName: "Test" }, permission, provider: "supabase" };
      },
    };
  });
  vi.doMock("@/lib/auth/page", () => ({
    pageIdentity: async () => (who.verified ? { subject: "u", email: who.email, role: who.role, scope: who.scope, verified: true, displayName: "Test" } : null),
  }));

  const store = createSupabaseGoogleStore(d.client);
  await store.saveConnection(seal("REFRESH-TOKEN-SECRET", REFRESH_TOKEN_LABEL, KEY), [BUSINESS_SCOPE], "admin@example.invalid");
  const world = allBuffLocations(3);
  world.find((l) => l.storeCode === "66")!.reviews[0]!.reply = "Thanks for visiting!";
  fake = createGoogleFake(world);
  vi.stubGlobal("fetch", fake.fetchImpl);
  const { runGoogleReviewsSync } = await import("./sync");
  const out = await runGoogleReviewsSync({ requestedBy: "admin:tester" });
  expect(out).toMatchObject({ status: "succeeded", storesLinked: 7 });
});

afterEach(async () => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
  for (const mod of ["@/lib/supabase/server", "@/lib/api/respond", "@/lib/auth/server", "@/lib/auth/page"]) vi.doUnmock(mod);
  await d.close();
});

const reviewId = async (googleReviewId: string) => (await q<{ id: string }>(`select id from public.google_reviews where google_review_id = $1`, [googleReviewId]))[0]!.id;
const call = async (verb: "PUT" | "DELETE" | "POST", id: string, body?: unknown) => {
  const route = await import("@/app/api/google-reviews/reviews/[id]/reply/route");
  const request = new Request("https://askbubbles.example/api/google-reviews/reviews/x/reply", { method: verb, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const response = await route[verb](request, { params: Promise.resolve({ id }) });
  return { status: response.status, json: (await response.json()) as Record<string, unknown> & { reply?: Record<string, unknown>; code?: string } };
};
const loadRows = async () => {
  const views = await import("./views");
  return (await views.readReviewPage(views.EMPTY_QUERY)).rows;
};
const puts = () => fake.calls.filter((c) => c.method === "PUT");

describe("a manager answers a review at their own salon", () => {
  it("sees Reply controls only on their salon, drafts, edits, publishes after confirming, and the dashboard then shows the reply", async () => {
    const { loadReplyState } = await import("@/features/reviews/load-replies");
    const id = await reviewId("66-r2");

    // 1. what the dashboard would draw for this person
    let rows = await loadRows();
    let state = await loadReplyState(rows);
    expect(state.access).toEqual({ available: true, publishingEnabled: true, stores: ["66"] });
    expect(state.byReview).toEqual({});

    // 2. draft, then edit
    const first = await call("PUT", id, { body: "Thank you for the kind words!" });
    expect(first.status).toBe(200);
    expect(first.json.reply).toMatchObject({ status: "draft", version: 1 });
    const second = await call("PUT", id, { body: "Thank you for the kind words — see you soon!", version: 1 });
    expect(second.json.reply).toMatchObject({ status: "draft", version: 2 });
    expect(puts()).toHaveLength(0); // nothing has left Ask Bubbles

    state = await loadReplyState(await loadRows());
    expect(state.byReview[id]).toMatchObject({ status: "draft", version: 2, kind: "new", stale: false, body: "Thank you for the kind words — see you soon!" });

    // 3. without a confirmation nothing is sent
    expect((await call("POST", id, { version: 2 })).status).toBe(400);
    expect(puts()).toHaveLength(0);

    // 4. confirmed publish
    const done = await call("POST", id, { version: 2, confirmPublish: true });
    expect(done.status).toBe(200);
    expect(done.json.reply).toMatchObject({ status: "published", publishedBy: "user:kearney.manager@example.test" });
    expect(fake.knobs.replyWrites).toEqual([{ reviewId: "66-r2", comment: "Thank you for the kind words — see you soon!" }]);

    // 5. the dashboard now shows it as the review's owner reply, with everything else intact
    rows = await loadRows();
    const row = rows.find((r) => r.id === id)!;
    expect(row).toMatchObject({ replyComment: "Thank you for the kind words — see you soon!", hasReply: true, reviewerName: "Zzreviewer Person", starRating: 2, comment: "66 review 2" });
    state = await loadReplyState(rows);
    expect(state.byReview[id]).toBeUndefined(); // no open reply any more
    expect((await q<{ n: string }>(`select count(*)::text n from public.google_reviews`))[0]!.n).toBe("21");

    // 6. a second publish is a no-op
    expect((await call("POST", id, { version: 2, confirmPublish: true })).json.code).toBe("reply_missing");
    expect(fake.knobs.replyWrites).toHaveLength(1);
  });

  it("edits an existing owner reply only with both confirmations, and nothing else on the review changes", async () => {
    const id = await reviewId("66-r1");
    const before = (await loadRows()).find((r) => r.id === id)!;
    expect(before.replyComment).toBe("Thanks for visiting!");
    const draft = await call("PUT", id, { body: "Thanks so much for visiting us!" });
    expect(draft.json.reply).toMatchObject({ kind: "edit", baseReplyComment: "Thanks for visiting!" });
    expect((await call("POST", id, { version: 1, confirmPublish: true })).json).toMatchObject({ code: "confirmation_required", field: "confirmReplace" });
    expect((await call("POST", id, { version: 1, confirmPublish: true, confirmReplace: true })).status).toBe(200);
    const after = (await loadRows()).find((r) => r.id === id)!;
    expect(after).toMatchObject({ replyComment: "Thanks so much for visiting us!", reviewerName: before.reviewerName, starRating: before.starRating, comment: before.comment, createdAt: before.createdAt });
  });
});

describe("salon permissions through the whole stack", () => {
  it("a manager cannot read, draft, publish or discard for another salon, even with the right permission and a valid id", async () => {
    const other = await reviewId("219-r2");
    for (const [verb, body] of [["PUT", { body: "x" }], ["POST", { version: 1, confirmPublish: true }], ["DELETE", undefined]] as const) {
      const r = await call(verb, other, body);
      expect(r.status, verb).toBe(403);
      expect(r.json.code).toBe("forbidden");
    }
    expect(await q(`select 1 from public.google_review_replies`)).toHaveLength(0);
    expect(puts()).toHaveLength(0);
    const { loadReplyState } = await import("@/features/reviews/load-replies");
    expect((await loadReplyState(await loadRows())).access.stores).toEqual(["66"]);
  });

  it("an admin answers any of the seven salons", async () => {
    who = { role: "admin", scope: GLOBAL, verified: true, email: "admin@example.test" };
    const { loadReplyState } = await import("@/features/reviews/load-replies");
    expect((await loadReplyState(await loadRows())).access.stores).toEqual(["219", "225", "236", "264", "338", "66", "67"]);
    for (const s of ["219", "225", "236", "264", "338", "66", "67"]) {
      expect((await call("PUT", await reviewId(`${s}-r3`), { body: `Hello ${s}` })).status, s).toBe(200);
    }
  });

  it("an employee or assistant manager gets 403 from the route and no controls on the page; an anonymous caller gets 401", async () => {
    const id = await reviewId("66-r2");
    const { loadReplyState } = await import("@/features/reviews/load-replies");
    for (const role of ["employee", "assistant_manager"] as const) {
      who = { role, scope: loc("loc-66"), verified: true, email: `${role}@example.test` };
      expect((await call("PUT", id, { body: "x" })).status, role).toBe(403);
      expect((await loadReplyState(await loadRows())).access.available).toBe(false);
    }
    who = { ...who, verified: false };
    expect((await call("PUT", id, { body: "x" })).status).toBe(401);
    expect((await loadReplyState(await loadRows())).access.available).toBe(false);
    expect(await q(`select 1 from public.google_review_replies`)).toHaveLength(0);
  });

  it("a manager with no salon assigned can do nothing", async () => {
    who = { role: "location_manager", scope: { level: "location", primaryAreaId: null, alsoCoversAreaIds: [] }, verified: true, email: "nowhere@example.test" };
    expect((await call("PUT", await reviewId("66-r2"), { body: "x" })).status).toBe(403);
    const { loadReplyState } = await import("@/features/reviews/load-replies");
    expect((await loadReplyState(await loadRows())).access.available).toBe(false);
  });
});

describe("safety through the whole stack", () => {
  it("with publishing switched off drafts still work, Publish is refused, and the page says publishing is unavailable", async () => {
    process.env.GOOGLE_REVIEWS_REPLIES_ENABLED = "false";
    const id = await reviewId("66-r2");
    expect((await call("PUT", id, { body: "Draft while off" })).status).toBe(200);
    const refused = await call("POST", id, { version: 1, confirmPublish: true });
    expect(refused.status).toBe(503);
    expect(refused.json.code).toBe("replies_disabled");
    expect(puts()).toHaveLength(0);
    const { loadReplyState } = await import("@/features/reviews/load-replies");
    expect((await loadReplyState(await loadRows())).access).toMatchObject({ available: true, publishingEnabled: false });
  });

  it("a Google failure surfaces as a safe code and sentence; the draft survives; nothing from Google or the token leaks", async () => {
    const id = await reviewId("66-r2");
    await call("PUT", id, { body: "Will fail once" });
    fake.knobs.replyPutStatus = 500;
    const failed = await call("POST", id, { version: 1, confirmPublish: true });
    expect(failed.status).toBe(502);
    expect(failed.json).toMatchObject({ status: "failed", code: "server_error", reply: { status: "failed", body: "Will fail once" } });
    expect(JSON.stringify(failed.json)).not.toMatch(/secret detail|accounts\/10|REFRESH-TOKEN|ACCESS-TOKEN|CLIENT-SECRET/);
    const { loadReplyState } = await import("@/features/reviews/load-replies");
    expect((await loadReplyState(await loadRows())).byReview[id]).toMatchObject({ status: "failed", lastErrorCode: "server_error" });
    fake.knobs.replyPutStatus = null;
    expect((await call("POST", id, { version: 1, confirmPublish: true })).status).toBe(200);
    expect(fake.knobs.replyWrites).toHaveLength(1);
  });

  it("the dashboard keeps working (no controls) if the reply tables do not exist yet — i.e. before the migration is applied", async () => {
    await d.db.exec(`drop function public.google_review_replies_open(uuid[]);`);
    const { loadReplyState } = await import("@/features/reviews/load-replies");
    const state = await loadReplyState(await loadRows());
    expect(state.access.available).toBe(false);
    expect(state.byReview).toEqual({});
  });

  it("an open draft whose base reply changed (a sync brought in someone else's reply) is flagged stale and cannot be published", async () => {
    const id = await reviewId("66-r2");
    await call("PUT", id, { body: "Mine" });
    await d.db.query(`update public.google_reviews set reply_comment = 'Another person answered', reply_update_time = now() where id = $1`, [id]);
    const { loadReplyState } = await import("@/features/reviews/load-replies");
    expect((await loadReplyState(await loadRows())).byReview[id]).toMatchObject({ stale: true });
    fake.locations.find((l) => l.storeCode === "66")!.reviews[1]!.reply = "Another person answered";
    expect((await call("POST", id, { version: 1, confirmPublish: true, confirmReplace: true })).json.code).toBe("reply_changed");
    expect(puts()).toHaveLength(0);
  });
});
