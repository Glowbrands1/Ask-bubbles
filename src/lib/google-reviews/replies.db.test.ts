import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readGoogleReviewsConfig } from "./config";
import { REFRESH_TOKEN_LABEL, seal } from "./crypto";
import { BUSINESS_SCOPE } from "./oauth";
import { discardReplyDraft, publishReply, saveReplyDraft, type ReplyDependencies, type ReplyResult } from "./replies";
import type { ReplyActor } from "./reply-access";
import { createSupabaseReplyStore, type ReplyStore } from "./reply-store";
import { createSupabaseGoogleStore, type GoogleReviewsStore } from "./store";
import { runGoogleReviewsSync } from "./sync";
import type { AccessScope } from "@/types";
import { allBuffLocations, createGoogleFake, createGoogleTestDatabase, type GoogleFake, type GoogleTestDatabase } from "./test-support";

/**
 * REPLYING TO GOOGLE REVIEWS, END TO END ON THE REAL SCHEMA: PGlite running the repository's own migrations, the
 * real stores, service and Google reply client, against a programmable fake of Google. No network, no real Google.
 */

const KEY = randomBytes(32);
const oauth = { clientId: "client-id", clientSecret: "SECRET-CLIENT-VALUE", redirectUri: "https://askbubbles.example/cb" };
const ENV = { GOOGLE_REVIEWS_SYNC_ENABLED: "true", GOOGLE_REVIEWS_WRITES_ENABLED: "true", GOOGLE_OAUTH_CLIENT_ID: "x", GOOGLE_OAUTH_CLIENT_SECRET: "y", GOOGLE_TOKEN_ENCRYPTION_KEY: "z" };
const ENV_REPLIES = { ...ENV, GOOGLE_REVIEWS_REPLIES_ENABLED: "true" };

const GLOBAL: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const person = (role: ReplyActor["role"], scope: ReplyActor["scope"], verified = true): ReplyActor => ({ label: `user:${role}@example.test`, role, scope, verified });
const admin = person("admin", GLOBAL);
const managerOf66 = person("location_manager", { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: [] });

let d: GoogleTestDatabase;
let googleStore: GoogleReviewsStore;
let replies: ReplyStore;
let fake: GoogleFake;
let clock: { t: number };

const q = async <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await d.db.query<T>(sql, params)).rows;

async function runSync() {
  return runGoogleReviewsSync({
    requestedBy: "admin:tester", config: readGoogleReviewsConfig(ENV), oauth, store: googleStore, fetchImpl: fake.fetchImpl,
    sleep: async (ms) => { clock.t += ms; }, now: () => clock.t, encryptionKey: KEY,
  });
}

const deps = (over: Partial<ReplyDependencies> = {}): ReplyDependencies => ({
  config: readGoogleReviewsConfig(ENV_REPLIES), oauth, replies, connections: googleStore, fetchImpl: fake.fetchImpl,
  now: () => clock.t, encryptionKey: KEY, ...over,
});

/** The database id of a review, by its Google review id. */
const reviewId = async (googleReviewId: string) => (await q<{ id: string }>(`select id from public.google_reviews where google_review_id = $1`, [googleReviewId]))[0]!.id;
const ok = (r: ReplyResult) => { if (!r.ok) throw new Error(`expected ok, got ${r.code}`); return r; };
const code = (r: ReplyResult) => (r.ok ? "ok" : r.code);
const puts = () => fake.calls.filter((c) => c.method === "PUT");

beforeEach(async () => {
  d = await createGoogleTestDatabase();
  googleStore = createSupabaseGoogleStore(d.client);
  replies = createSupabaseReplyStore(d.client);
  clock = { t: 1_800_000_000_000 };
  await googleStore.saveConnection(seal("REFRESH-TOKEN-SECRET", REFRESH_TOKEN_LABEL, KEY), [BUSINESS_SCOPE], "admin@example.invalid");
  const world = allBuffLocations(3);
  // store 66's first review already has an owner reply from before
  world.find((l) => l.storeCode === "66")!.reviews[0]!.reply = "Thanks for visiting!";
  fake = createGoogleFake(world);
  const out = await runSync();
  expect(out).toMatchObject({ status: "succeeded", storesLinked: 7 });
});
afterEach(async () => {
  await d.close();
});

describe("drafting", () => {
  it("creates, edits and versions a draft without ever contacting Google", async () => {
    const id = await reviewId("66-r2");
    const before = fake.calls.length;
    const first = ok(await saveReplyDraft({ actor: managerOf66, reviewId: id, body: "  Thank you so much!  " }, deps()));
    expect(first.reply).toMatchObject({ status: "draft", kind: "new", version: 1, body: "Thank you so much!", baseReplyComment: null, updatedBy: "user:location_manager@example.test" });
    const second = ok(await saveReplyDraft({ actor: managerOf66, reviewId: id, body: "Thank you so much, come again!", expectedVersion: 1 }, deps()));
    expect(second.reply).toMatchObject({ status: "draft", version: 2, body: "Thank you so much, come again!" });
    expect(fake.calls.length).toBe(before);
    expect(await q(`select 1 from public.google_review_replies where review_id = $1`, [id])).toHaveLength(1);
    // an out-of-date editor is refused rather than overwriting
    expect(code(await saveReplyDraft({ actor: managerOf66, reviewId: id, body: "stale edit", expectedVersion: 1 }, deps()))).toBe("reply_conflict");
  });

  it("drafts even while publishing is switched off", async () => {
    const id = await reviewId("66-r2");
    const r = await saveReplyDraft({ actor: managerOf66, reviewId: id, body: "Draft only" }, deps({ config: readGoogleReviewsConfig(ENV) }));
    expect(code(r)).toBe("ok");
  });

  it("rejects empty, over-long and unchanged text, and non-string bodies", async () => {
    const mine = await reviewId("66-r1"); // already has "Thanks for visiting!"
    const id = await reviewId("66-r2");
    expect(code(await saveReplyDraft({ actor: admin, reviewId: id, body: "   " }, deps()))).toBe("reply_empty");
    expect(code(await saveReplyDraft({ actor: admin, reviewId: id, body: "x".repeat(4097) }, deps()))).toBe("reply_too_long");
    expect(code(await saveReplyDraft({ actor: admin, reviewId: id, body: 42 }, deps()))).toBe("invalid_request");
    expect(code(await saveReplyDraft({ actor: admin, reviewId: mine, body: "Thanks for visiting!" }, deps()))).toBe("reply_unchanged");
    expect(await q(`select 1 from public.google_review_replies`)).toHaveLength(0);
  });

  it("discarding a draft frees the review for a new one, and discard is refused while publishing", async () => {
    const id = await reviewId("66-r2");
    const draft = ok(await saveReplyDraft({ actor: admin, reviewId: id, body: "one" }, deps())).reply!;
    expect(ok(await discardReplyDraft({ actor: admin, reviewId: id }, deps())).reply!.status).toBe("discarded");
    expect(code(await discardReplyDraft({ actor: admin, reviewId: id }, deps()))).toBe("reply_missing");
    const again = ok(await saveReplyDraft({ actor: admin, reviewId: id, body: "two" }, deps())).reply!;
    expect(again.id).not.toBe(draft.id);
    await replies.claimPublish(again.id, again.version, "user:x");
    expect(code(await discardReplyDraft({ actor: admin, reviewId: id }, deps()))).toBe("reply_busy");
    expect(code(await saveReplyDraft({ actor: admin, reviewId: id, body: "three" }, deps()))).toBe("reply_busy");
  });
});

describe("who may reply, per salon", () => {
  it("lets a manager answer only the salons in their assignment; admins answer all seven", async () => {
    const own = await reviewId("66-r2");
    const other = await reviewId("219-r2");
    expect(code(await saveReplyDraft({ actor: managerOf66, reviewId: own, body: "ok" }, deps()))).toBe("ok");
    expect(code(await saveReplyDraft({ actor: managerOf66, reviewId: other, body: "no" }, deps()))).toBe("forbidden");
    expect(code(await publishReply({ actor: managerOf66, reviewId: other, version: 1, confirmPublish: true }, deps()))).toBe("forbidden");
    expect(code(await discardReplyDraft({ actor: managerOf66, reviewId: other }, deps()))).toBe("forbidden");
    for (const store of ["219", "225", "236", "264", "338", "66", "67"]) {
      expect(code(await saveReplyDraft({ actor: admin, reviewId: await reviewId(`${store}-r3`), body: `hello ${store}` }, deps()))).toBe("ok");
    }
  });

  it("refuses frontline roles, assistant managers, unverified identities, and an assignment that resolves to no salon", async () => {
    const id = await reviewId("66-r2");
    const scope66: AccessScope = { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: [] };
    for (const actor of [
      person("employee", scope66),
      person("assistant_manager", scope66),
      person("admin", GLOBAL, false),
      person("location_manager", { level: "location", primaryAreaId: null, alsoCoversAreaIds: [] }),
      person("location_manager", { level: "location", primaryAreaId: "loc-999", alsoCoversAreaIds: [] }),
    ]) {
      expect(code(await saveReplyDraft({ actor, reviewId: id, body: "nope" }, deps()))).toBe("forbidden");
    }
    expect(await q(`select 1 from public.google_review_replies`)).toHaveLength(0);
  });

  it("answers 'not found' for an unknown or malformed review id", async () => {
    expect(code(await saveReplyDraft({ actor: admin, reviewId: "00000000-0000-4000-8000-000000000000", body: "x" }, deps()))).toBe("not_found");
    expect(code(await saveReplyDraft({ actor: admin, reviewId: "1; drop table x", body: "x" }, deps()))).toBe("not_found");
  });
});

describe("publishing", () => {
  it("publishes once, records it on the reply and the review, and leaves everything else exactly as it was", async () => {
    const id = await reviewId("66-r2");
    const snapshot = async () => q(`select id, google_review_id, star_rating, comment, reviewer_name, review_create_time, review_update_time, content_hash, removed_at from public.google_reviews order by id`);
    const before = await snapshot();
    const replyCountBefore = (await q<{ n: string }>(`select count(*)::text n from public.google_reviews where reply_comment is not null`))[0]!.n;
    const draft = ok(await saveReplyDraft({ actor: managerOf66, reviewId: id, body: "Thank you!" }, deps())).reply!;

    const out = ok(await publishReply({ actor: managerOf66, reviewId: id, version: draft.version, confirmPublish: true }, deps()));
    expect(out.reply).toMatchObject({ status: "published", publishedBy: "user:location_manager@example.test", attempts: 1 });
    expect(puts()).toHaveLength(1);
    expect(puts()[0]!.path).toMatch(/\/v4\/accounts\/10\/locations\/\d+\/reviews\/66-r2\/reply$/);
    expect(fake.knobs.replyWrites).toEqual([{ reviewId: "66-r2", comment: "Thank you!" }]);

    const row = (await q<{ reply_comment: string; has_reply: boolean; content_hash: string }>(`select reply_comment, has_reply, content_hash from public.google_reviews where id = $1`, [id]))[0]!;
    expect(row).toMatchObject({ reply_comment: "Thank you!", has_reply: true });
    const after = await snapshot();
    expect(after).toEqual(before); // reviewer names, ratings, comments, dates and hashes of ALL reviews are untouched
    expect((await q<{ n: string }>(`select count(*)::text n from public.google_reviews where reply_comment is not null`))[0]!.n).toBe(String(Number(replyCountBefore) + 1));
    expect((await q<{ n: string }>(`select count(*)::text n from public.google_reviews`))[0]!.n).toBe("21");
    expect((await q(`select event from public.google_review_reply_events order by id`)).map((e) => e.event)).toEqual(["draft_created", "publish_started", "published"]);
  });

  it("sends nothing without exactly confirmPublish:true, without the confirmed version, or while the switch is off", async () => {
    const id = await reviewId("66-r2");
    const draft = ok(await saveReplyDraft({ actor: admin, reviewId: id, body: "Hello" }, deps())).reply!;
    for (const confirmPublish of [undefined, false, "true", 1, null]) {
      expect(await publishReply({ actor: admin, reviewId: id, version: draft.version, confirmPublish }, deps())).toMatchObject({ ok: false, code: "confirmation_required", field: "confirmPublish" });
    }
    expect(code(await publishReply({ actor: admin, reviewId: id, version: 99, confirmPublish: true }, deps()))).toBe("reply_conflict");
    expect(code(await publishReply({ actor: admin, reviewId: id, version: "1", confirmPublish: true }, deps()))).toBe("invalid_request");
    expect(code(await publishReply({ actor: admin, reviewId: id, version: draft.version, confirmPublish: true }, deps({ config: readGoogleReviewsConfig(ENV) })))).toBe("replies_disabled");
    expect(code(await publishReply({ actor: admin, reviewId: id, version: draft.version, confirmPublish: true }, deps({ config: readGoogleReviewsConfig({ ...ENV_REPLIES, GOOGLE_REVIEWS_SYNC_ENABLED: "false" }) })))).toBe("replies_disabled");
    expect(code(await publishReply({ actor: admin, reviewId: id, version: draft.version, confirmPublish: true }, deps({ oauth: null })))).toBe("not_configured");
    expect(puts()).toHaveLength(0);
    expect((await q<{ status: string }>(`select status from public.google_review_replies`))[0]!.status).toBe("draft");
  });

  it("a draft edited after the person confirmed is not published", async () => {
    const id = await reviewId("66-r2");
    const v1 = ok(await saveReplyDraft({ actor: admin, reviewId: id, body: "Version one" }, deps())).reply!;
    ok(await saveReplyDraft({ actor: managerOf66, reviewId: id, body: "Version two" }, deps()));
    expect(code(await publishReply({ actor: admin, reviewId: id, version: v1.version, confirmPublish: true }, deps()))).toBe("reply_conflict");
    expect(puts()).toHaveLength(0);
  });

  it("two simultaneous publishes (a double click, two tabs) send exactly one reply", async () => {
    const id = await reviewId("66-r2");
    const draft = ok(await saveReplyDraft({ actor: admin, reviewId: id, body: "Only once please" }, deps())).reply!;
    const results = await Promise.all([
      publishReply({ actor: admin, reviewId: id, version: draft.version, confirmPublish: true }, deps()),
      publishReply({ actor: managerOf66, reviewId: id, version: draft.version, confirmPublish: true }, deps()),
    ]);
    expect(results.some((r) => r.ok)).toBe(true);
    expect(fake.knobs.replyWrites).toHaveLength(1);
    expect(await q(`select status from public.google_review_replies where status = 'published'`)).toHaveLength(1);
    expect(await q(`select 1 from public.google_review_replies`)).toHaveLength(1);
    // and once published there is nothing left to publish
    expect(code(await publishReply({ actor: admin, reviewId: id, version: draft.version, confirmPublish: true }, deps()))).toBe("reply_missing");
    expect(fake.knobs.replyWrites).toHaveLength(1);
  });

  it("the database itself allows only one open reply per review", async () => {
    const id = await reviewId("66-r2");
    ok(await saveReplyDraft({ actor: admin, reviewId: id, body: "first" }, deps()));
    const loc = (await q<{ location_id: string }>(`select location_id from public.google_reviews where id = $1`, [id]))[0]!.location_id;
    await expect(d.db.query(`insert into public.google_review_replies (review_id, location_id, kind, status, body, created_by, updated_by) values ($1, $2, 'new', 'draft', 'second', 'x', 'x')`, [id, loc])).rejects.toThrow();
  });
});

describe("editing an existing owner reply", () => {
  it("needs the extra confirmation, replaces the reply, and keeps the old text as the draft's base", async () => {
    const id = await reviewId("66-r1"); // holds "Thanks for visiting!"
    const draft = ok(await saveReplyDraft({ actor: managerOf66, reviewId: id, body: "Thanks for visiting us!" }, deps())).reply!;
    expect(draft).toMatchObject({ kind: "edit", baseReplyComment: "Thanks for visiting!" });

    expect(await publishReply({ actor: managerOf66, reviewId: id, version: draft.version, confirmPublish: true }, deps())).toMatchObject({ ok: false, code: "confirmation_required", field: "confirmReplace" });
    expect(await publishReply({ actor: managerOf66, reviewId: id, version: draft.version, confirmPublish: true, confirmReplace: "yes" }, deps())).toMatchObject({ ok: false, field: "confirmReplace" });
    expect(puts()).toHaveLength(0);

    ok(await publishReply({ actor: managerOf66, reviewId: id, version: draft.version, confirmPublish: true, confirmReplace: true }, deps()));
    expect(fake.knobs.replyWrites).toEqual([{ reviewId: "66-r1", comment: "Thanks for visiting us!" }]);
    expect((await q<{ reply_comment: string }>(`select reply_comment from public.google_reviews where id = $1`, [id]))[0]!.reply_comment).toBe("Thanks for visiting us!");
  });

  it("is refused when the reply on Google changed after the draft was started — nothing is overwritten", async () => {
    const id = await reviewId("66-r1");
    const draft = ok(await saveReplyDraft({ actor: admin, reviewId: id, body: "Our version" }, deps())).reply!;
    fake.locations.find((l) => l.storeCode === "66")!.reviews[0]!.reply = "Someone else edited this on Google";
    const out = await publishReply({ actor: admin, reviewId: id, version: draft.version, confirmPublish: true, confirmReplace: true }, deps());
    expect(out).toMatchObject({ ok: false, code: "reply_changed" });
    expect(puts()).toHaveLength(0);
    expect((await q<{ status: string }>(`select status from public.google_review_replies`))[0]!.status).toBe("draft");
  });

  it("a first reply is refused if someone has meanwhile answered on Google", async () => {
    const id = await reviewId("66-r2");
    const draft = ok(await saveReplyDraft({ actor: admin, reviewId: id, body: "Mine" }, deps())).reply!;
    fake.locations.find((l) => l.storeCode === "66")!.reviews[1]!.reply = "Already answered elsewhere";
    expect(code(await publishReply({ actor: admin, reviewId: id, version: draft.version, confirmPublish: true }, deps()))).toBe("reply_changed");
    expect(puts()).toHaveLength(0);
  });
});

describe("failures are handled safely", () => {
  it("a Google refusal marks the reply failed with a code, keeps the text, never leaks Google's body, and a retry can succeed", async () => {
    const id = await reviewId("66-r2");
    const draft = ok(await saveReplyDraft({ actor: admin, reviewId: id, body: "Please retry me" }, deps())).reply!;
    fake.knobs.replyPutStatus = 500;
    const failed = await publishReply({ actor: admin, reviewId: id, version: draft.version, confirmPublish: true }, deps());
    expect(failed).toMatchObject({ ok: false, code: "server_error", reply: { status: "failed", lastErrorCode: "server_error", body: "Please retry me" } });
    expect(JSON.stringify(failed)).not.toMatch(/secret detail|accounts\/10|REFRESH-TOKEN|ACCESS-TOKEN/);
    expect((await q<{ reply_comment: string | null }>(`select reply_comment from public.google_reviews where id = $1`, [id]))[0]!.reply_comment).toBeNull();

    fake.knobs.replyPutStatus = null;
    const retry = ok(await publishReply({ actor: admin, reviewId: id, version: draft.version, confirmPublish: true }, deps()));
    expect(retry.reply).toMatchObject({ status: "published", attempts: 2 });
    expect(fake.knobs.replyWrites).toHaveLength(1);
  });

  it("a failed reply can be edited back into a draft", async () => {
    const id = await reviewId("66-r2");
    const draft = ok(await saveReplyDraft({ actor: admin, reviewId: id, body: "v1" }, deps())).reply!;
    fake.knobs.replyPutStatus = 403;
    expect(code(await publishReply({ actor: admin, reviewId: id, version: draft.version, confirmPublish: true }, deps()))).toBe("permission_denied");
    const edited = ok(await saveReplyDraft({ actor: admin, reviewId: id, body: "v2" }, deps())).reply!;
    expect(edited).toMatchObject({ status: "draft", version: 2, lastErrorCode: null });
  });

  it("when the answer never arrives, the retry finds the reply already on Google and does not send it again", async () => {
    const id = await reviewId("66-r2");
    const draft = ok(await saveReplyDraft({ actor: admin, reviewId: id, body: "Posted but unconfirmed" }, deps())).reply!;
    fake.knobs.replyPutDropAfterApply = true;
    const lost = await publishReply({ actor: admin, reviewId: id, version: draft.version, confirmPublish: true }, deps());
    expect(lost).toMatchObject({ ok: false, code: "network_error", reply: { status: "failed" } });
    expect(JSON.stringify(lost)).not.toMatch(/secret/);
    expect(fake.knobs.replyWrites).toHaveLength(1); // it did reach Google

    fake.knobs.replyPutDropAfterApply = false;
    const retry = ok(await publishReply({ actor: admin, reviewId: id, version: draft.version, confirmPublish: true }, deps()));
    expect(retry).toMatchObject({ alreadyOnGoogle: true, reply: { status: "published" } });
    expect(fake.knobs.replyWrites).toHaveLength(1); // not twice
    expect((await q(`select event from public.google_review_reply_events order by id`)).map((e) => e.event)).toEqual(["draft_created", "publish_started", "publish_failed", "publish_reconciled"]);
  });

  it("a publish that died mid-flight blocks others for two minutes, then is reconciled rather than assumed", async () => {
    const id = await reviewId("66-r2");
    const draft = ok(await saveReplyDraft({ actor: admin, reviewId: id, body: "Crashed mid-publish" }, deps())).reply!;
    await replies.claimPublish(draft.id, draft.version, "user:crashed"); // the process then died
    expect(code(await publishReply({ actor: admin, reviewId: id, version: draft.version, confirmPublish: true }, deps()))).toBe("reply_busy");
    expect(puts()).toHaveLength(0);

    await d.db.query(`update public.google_review_replies set publish_started_at = now() - interval '10 minutes'`);
    const out = ok(await publishReply({ actor: admin, reviewId: id, version: draft.version, confirmPublish: true }, deps()));
    expect(out.reply!.status).toBe("published");
    expect(fake.knobs.replyWrites).toHaveLength(1);
    expect((await q(`select event from public.google_review_reply_events order by id`)).map((e) => e.event)).toContain("publish_outcome_unknown");
  });

  it("survives one expired access token (401) by refreshing once", async () => {
    const id = await reviewId("66-r2");
    const draft = ok(await saveReplyDraft({ actor: admin, reviewId: id, body: "After a refresh" }, deps())).reply!;
    fake.knobs.unauthorizedOnce = true;
    ok(await publishReply({ actor: admin, reviewId: id, version: draft.version, confirmPublish: true }, deps()));
    expect(fake.knobs.replyWrites).toHaveLength(1);
  });

  it("with no Google connection nothing is sent and the draft stays a draft", async () => {
    const id = await reviewId("66-r2");
    const draft = ok(await saveReplyDraft({ actor: admin, reviewId: id, body: "No connection" }, deps())).reply!;
    await googleStore.endConnection("revoked", null, "admin");
    expect(code(await publishReply({ actor: admin, reviewId: id, version: draft.version, confirmPublish: true }, deps()))).toBe("not_connected");
    expect(puts()).toHaveLength(0);
    expect((await q<{ status: string }>(`select status from public.google_review_replies`))[0]!.status).toBe("draft");
  });

  it("a review Google no longer returns cannot be answered", async () => {
    const id = await reviewId("66-r2");
    const draft = ok(await saveReplyDraft({ actor: admin, reviewId: id, body: "Too late" }, deps())).reply!;
    await d.db.query(`update public.google_reviews set removed_at = now() where id = $1`, [id]);
    expect(code(await publishReply({ actor: admin, reviewId: id, version: draft.version, confirmPublish: true }, deps()))).toBe("review_unavailable");
    expect(code(await saveReplyDraft({ actor: admin, reviewId: id, body: "edit" }, deps()))).toBe("review_unavailable");
    expect(puts()).toHaveLength(0);
  });
});

describe("history and the audit trail", () => {
  it("the event log is append-only and holds lengths and codes, never reply text", async () => {
    const id = await reviewId("66-r2");
    const draft = ok(await saveReplyDraft({ actor: admin, reviewId: id, body: "A very private sentence" }, deps())).reply!;
    ok(await publishReply({ actor: admin, reviewId: id, version: draft.version, confirmPublish: true }, deps()));
    const events = await q<{ detail: unknown }>(`select detail from public.google_review_reply_events`);
    expect(JSON.stringify(events)).not.toMatch(/private sentence/);
    await expect(d.db.query(`update public.google_review_reply_events set actor = 'x'`)).rejects.toThrow(/append-only/);
    await expect(d.db.query(`delete from public.google_review_reply_events`)).rejects.toThrow(/append-only/);
  });

  it("a later sync keeps the published reply, whether or not Google has caught up, and never duplicates reviews", async () => {
    const id = await reviewId("66-r2");
    const draft = ok(await saveReplyDraft({ actor: admin, reviewId: id, body: "Synced later" }, deps())).reply!;
    ok(await publishReply({ actor: admin, reviewId: id, version: draft.version, confirmPublish: true }, deps()));

    // 1) Google's list has not caught up yet (the review still reads without a reply)
    const loc = fake.locations.find((l) => l.storeCode === "66")!;
    loc.reviews[1]!.reply = undefined;
    await runSync();
    expect((await q<{ reply_comment: string | null }>(`select reply_comment from public.google_reviews where id = $1`, [id]))[0]!.reply_comment).toBe("Synced later");
    // 2) Google has caught up
    loc.reviews[1]!.reply = "Synced later";
    await runSync();
    expect((await q<{ reply_comment: string | null }>(`select reply_comment from public.google_reviews where id = $1`, [id]))[0]!.reply_comment).toBe("Synced later");
    expect((await q<{ n: string }>(`select count(*)::text n from public.google_reviews`))[0]!.n).toBe("21");
  });
});
