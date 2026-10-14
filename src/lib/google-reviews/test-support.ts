import type { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";

import { APPROVED_GOOGLE_STORES, approvedStoreByCode } from "@/config/company/google-reviews";
import { createMigratedTestDatabase, type KnowledgeTestDatabase } from "@/test/pglite-knowledge-db";

/**
 * TEST SUPPORT for the Google Reviews integration: the real migration on PGlite,
 * a client whose `rpc` follows PostgREST's rules, and a programmable fake of the
 * Google APIs. Nothing here touches a network.
 */

const BASE = ["20260829000100_extensions", "20260829000200_knowledge_schema"] as const;
export const GOOGLE_MIGRATION = "20261013001000_google_reviews";

export interface GoogleTestDatabase {
  t: KnowledgeTestDatabase;
  db: PGlite;
  client: SupabaseClient;
  close(): Promise<void>;
}

/** PostgREST semantics: JSON values go in as jsonb, a scalar result comes back as the scalar. */
async function postgrestRpc(db: PGlite, fn: string, args: Record<string, unknown>) {
  const types = (
    await db.query<{ name: string; udt: string }>(
      `select p.parameter_name as name, p.udt_name as udt from information_schema.parameters p
         join information_schema.routines r on r.specific_name = p.specific_name
        where r.routine_schema = 'public' and r.routine_name = $1 and p.parameter_mode = 'IN'`,
      [fn],
    )
  ).rows;
  const typeOf = new Map(types.map((r) => [r.name, r.udt]));
  const params: unknown[] = [];
  const named = Object.entries(args).map(([name, value]) => {
    if (value === null || value === undefined) return `${name} => null`;
    const udt = typeOf.get(name);
    if (udt === "jsonb") {
      params.push(JSON.stringify(value));
      return `${name} => $${params.length}::jsonb`;
    }
    if (udt === "_text") {
      params.push(value);
      return `${name} => $${params.length}::text[]`;
    }
    params.push(value);
    return `${name} => $${params.length}`;
  });
  try {
    const result = await db.query<{ result: unknown }>(`select public.${fn}(${named.join(", ")}) as result`, params);
    const data = result.rows[0]?.result;
    return { data: data === "" || data === undefined ? null : data, error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : String(error), code: (error as { code?: string }).code } };
  }
}

export async function createGoogleTestDatabase(): Promise<GoogleTestDatabase> {
  const t = await createMigratedTestDatabase([...BASE, GOOGLE_MIGRATION, "20261014001000_google_reviews_history", "20261015001000_google_review_goals", "20261016001000_google_review_replies"]);
  const client = {
    from: (table: string) => (t.client as unknown as { from: (name: string) => unknown }).from(table),
    rpc: (fn: string, args: Record<string, unknown>) => postgrestRpc(t.db, fn, args),
  } as unknown as SupabaseClient;
  return { t, db: t.db, client, close: () => t.close() };
}

// ---------------------------------------------------------------------------------------------
// a programmable Google
// ---------------------------------------------------------------------------------------------

export interface FakeReview {
  id: string;
  rating?: "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE";
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reply?: string;
  /** Override the resource name (cross-store tests). */
  nameOverride?: string;
}

export interface FakeLocation {
  accountId: string;
  locationId: string;
  title: string;
  storeCode: string | null;
  address: { lines: string[]; locality: string; administrativeArea: string; postalCode: string } | null;
  reviews: FakeReview[];
}

export interface GoogleFake {
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;
  calls: { method: string; host: string; path: string; search: string }[];
  locations: FakeLocation[];
  /** Per-run knobs; assign before a sync. */
  knobs: {
    pageSize: number;
    tokenStatus: number; // status of the OAuth token endpoint
    tokenError: string | null;
    quotaZero: boolean; // every Business Profile call answers 429 with a zero quota
    unauthorizedOnce: boolean; // the next Business Profile call answers 401 once
    failReviewsFor: Set<string>; // location ids whose reviews endpoint answers 500
    loopPagesFor: Set<string>; // location ids whose reviews endpoint never ends
    refreshes: number;
    accessTokensIssued: string[];
    /** Reply writes: answer the PUT with this HTTP status instead of accepting it. */
    replyPutStatus: number | null;
    /** Reply writes: APPLY the reply, then drop the connection (the answer never arrives). */
    replyPutDropAfterApply: boolean;
    /** Single-review reads answer with this HTTP status. */
    getReviewStatus: number | null;
    /** Every accepted reply write, in order: review id and the comment. */
    replyWrites: { reviewId: string; comment: string }[];
  };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

export function reviewJson(l: FakeLocation, r: FakeReview) {
  return {
    name: r.nameOverride ?? `accounts/${l.accountId}/locations/${l.locationId}/reviews/${r.id}`,
    reviewId: r.id,
    reviewer: { displayName: "Zzreviewer Person", profilePhotoUrl: "https://example.invalid/p.jpg", isAnonymous: false },
    starRating: r.rating ?? "FIVE",
    comment: r.comment ?? `Review ${r.id}`,
    createTime: r.createTime ?? "2026-09-01T12:00:00Z",
    updateTime: r.updateTime ?? r.createTime ?? "2026-09-01T12:00:00Z",
    ...(r.reply ? { reviewReply: { comment: r.reply, updateTime: "2026-09-02T12:00:00Z" } } : {}),
  };
}

export function createGoogleFake(locations: FakeLocation[]): GoogleFake {
  const calls: GoogleFake["calls"] = [];
  const knobs: GoogleFake["knobs"] = {
    pageSize: 50, tokenStatus: 200, tokenError: null, quotaZero: false, unauthorizedOnce: false,
    failReviewsFor: new Set(), loopPagesFor: new Set(), refreshes: 0, accessTokensIssued: [],
    replyPutStatus: null, replyPutDropAfterApply: false, getReviewStatus: null, replyWrites: [],
  };
  const fake: GoogleFake = { fetchImpl: async () => json(500, {}), calls, locations, knobs };

  fake.fetchImpl = async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    calls.push({ method: init?.method ?? "GET", host: url.host, path: url.pathname, search: url.search });

    if (url.host === "oauth2.googleapis.com" && url.pathname === "/token") {
      if (knobs.tokenStatus !== 200) return json(knobs.tokenStatus, { error: knobs.tokenError ?? "invalid_grant", error_description: "bob@example.invalid" });
      knobs.refreshes += 1;
      const token = `ACCESS-TOKEN-${knobs.refreshes}`;
      knobs.accessTokensIssued.push(token);
      return json(200, { access_token: token, expires_in: 3600 });
    }

    if (knobs.unauthorizedOnce) {
      knobs.unauthorizedOnce = false;
      return json(401, { error: { status: "UNAUTHENTICATED" } });
    }
    if (knobs.quotaZero) {
      return json(429, { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded for quota metric 'Requests'", details: [{ reason: "RATE_LIMIT_EXCEEDED", metadata: { quota_limit_value: "0" } }] } });
    }

    if (url.host === "mybusinessaccountmanagement.googleapis.com") {
      const accountIds = [...new Set(locations.map((l) => l.accountId))];
      return json(200, { accounts: accountIds.map((id) => ({ name: `accounts/${id}`, accountName: `Account ${id}`, type: "LOCATION_GROUP" })) });
    }

    if (url.host === "mybusinessbusinessinformation.googleapis.com") {
      const account = /\/v1\/accounts\/(\d+)\/locations$/.exec(url.pathname)?.[1];
      const mine = locations.filter((l) => l.accountId === account);
      const start = Number(url.searchParams.get("pageToken") ?? 0);
      const size = Number(url.searchParams.get("pageSize") ?? 100);
      const page = mine.slice(start, start + size);
      return json(200, {
        locations: page.map((l) => ({
          name: `locations/${l.locationId}`, title: l.title, ...(l.storeCode ? { storeCode: l.storeCode } : {}),
          ...(l.address ? { storefrontAddress: { addressLines: l.address.lines, locality: l.address.locality, administrativeArea: l.address.administrativeArea, postalCode: l.address.postalCode, regionCode: "US" } } : {}),
        })),
        ...(start + size < mine.length ? { nextPageToken: String(start + size) } : {}),
      });
    }

    if (url.host === "mybusiness.googleapis.com") {
      // one review (GET) and its owner reply (PUT)
      const one = /\/v4\/accounts\/(\d+)\/locations\/(\d+)\/reviews\/([^/]+?)(\/reply)?$/.exec(url.pathname);
      if (one) {
        const loc1 = locations.find((l) => l.accountId === one[1] && l.locationId === one[2]);
        const rev = loc1?.reviews.find((r) => r.id === one[3]);
        if (!loc1 || !rev) return json(404, { error: { status: "NOT_FOUND" } });
        if (one[4]) {
          if ((init?.method ?? "GET") !== "PUT") return json(405, {});
          if (knobs.replyPutStatus !== null) return json(knobs.replyPutStatus, { error: { status: "INTERNAL", message: "secret detail about accounts/10" } });
          const comment = (JSON.parse(String(init?.body ?? "{}")) as { comment?: string }).comment ?? "";
          rev.reply = comment;
          knobs.replyWrites.push({ reviewId: rev.id, comment });
          if (knobs.replyPutDropAfterApply) throw new TypeError("fetch failed https://mybusiness.googleapis.com/secret");
          return json(200, { comment, updateTime: "2026-10-16T12:00:00Z" });
        }
        if (knobs.getReviewStatus !== null) return json(knobs.getReviewStatus, { error: { status: "INTERNAL" } });
        return json(200, reviewJson(loc1, rev));
      }
      const m = /\/v4\/accounts\/(\d+)\/locations\/(\d+)\/reviews$/.exec(url.pathname);
      const loc = locations.find((l) => l.accountId === m?.[1] && l.locationId === m?.[2]);
      if (!loc) return json(404, { error: { status: "NOT_FOUND" } });
      if (knobs.failReviewsFor.has(loc.locationId)) return json(500, { error: { status: "INTERNAL" } });
      if (knobs.loopPagesFor.has(loc.locationId)) return json(200, { reviews: loc.reviews.slice(0, 1).map((r) => reviewJson(loc, r)), nextPageToken: "LOOP", totalReviewCount: loc.reviews.length });
      const start = Number(url.searchParams.get("pageToken") ?? 0);
      const size = Math.min(Number(url.searchParams.get("pageSize") ?? 50), knobs.pageSize);
      const page = loc.reviews.slice(start, start + size);
      const avg = loc.reviews.length ? loc.reviews.reduce((a, r) => a + ({ ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }[r.rating ?? "FIVE"]), 0) / loc.reviews.length : 0;
      return json(200, {
        reviews: page.map((r) => reviewJson(loc, r)), averageRating: avg, totalReviewCount: loc.reviews.length,
        ...(start + size < loc.reviews.length ? { nextPageToken: String(start + size) } : {}),
      });
    }
    return json(404, {});
  };
  return fake;
}

let nextLocationId = 5000;
export function buffLocation(code: string, reviews: FakeReview[] = [], over: Partial<FakeLocation> = {}): FakeLocation {
  const s = approvedStoreByCode(code)!;
  nextLocationId += 1;
  return {
    accountId: "10",
    locationId: String(nextLocationId),
    title: `Buff City Soap - ${s.city}`,
    storeCode: s.code,
    address: { lines: [s.addressLine2 ? `${s.addressLine1}, ${s.addressLine2}` : s.addressLine1], locality: s.city, administrativeArea: s.state, postalCode: s.postalCode },
    reviews,
    ...over,
  };
}

export function allBuffLocations(reviewsPerStore = 3): FakeLocation[] {
  return APPROVED_GOOGLE_STORES.map((s) => buffLocation(s.code, Array.from({ length: reviewsPerStore }, (_, i) => ({ id: `${s.code}-r${i + 1}`, rating: (["ONE", "TWO", "THREE", "FOUR", "FIVE"] as const)[i % 5], comment: `${s.code} review ${i + 1}` }))));
}

export function sunTanCityLocations(withReviews = true): FakeLocation[] {
  const codes = ["140", "141", "143", "144", "145", "146", "147", "148", "231", "254", "306", "307", "314", "373", "409"];
  return codes.map((c, i) => {
    nextLocationId += 1;
    return {
      accountId: "10",
      locationId: String(nextLocationId),
      title: `Sun Tan City - Test ${c}`,
      storeCode: c,
      address: { lines: [`${100 + i} Synthetic Way`], locality: "Testville", administrativeArea: "KS", postalCode: `66${100 + i}` },
      reviews: withReviews ? [{ id: `stc-${c}-1`, comment: `SUNTANCITY SECRET REVIEW ${c}` }] : [],
    };
  });
}
