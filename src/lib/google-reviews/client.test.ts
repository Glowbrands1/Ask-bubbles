import { describe, expect, it } from "vitest";

import { GoogleApiError, GoogleBusinessClient, classifyGoogleError } from "./client";

const j = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

/** A scripted fetch: returns queued responses in order and records every request. */
function scripted(...queue: (Response | Error | ((url: string) => Response))[]) {
  const calls: { url: string; method?: string; auth?: string; redirect?: string }[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method, auth: (init?.headers as Record<string, string>)?.Authorization, redirect: init?.redirect });
    const next = queue.shift();
    if (!next) throw new Error(`unexpected extra request to ${url}`);
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(url) : next;
  };
  return { fetchImpl, calls };
}

const make = (s: ReturnType<typeof scripted>, over: Partial<ConstructorParameters<typeof GoogleBusinessClient>[0]> = {}) => {
  const sleeps: number[] = [];
  let t = 1_000_000;
  const client = new GoogleBusinessClient({
    getAccessToken: async () => "TOKEN-1",
    fetchImpl: s.fetchImpl,
    sleep: async (ms) => { sleeps.push(ms); t += ms; },
    now: () => t,
    minRequestIntervalMs: 100,
    baseBackoffMs: 10,
    ...over,
  });
  return { client, sleeps };
};

const review = (n: number) => ({ reviewId: `r${n}`, name: `accounts/1/locations/2/reviews/r${n}`, starRating: "FIVE" });

describe("listReviews", () => {
  it("follows nextPageToken to the end, orders by updateTime desc, and reports COMPLETE", async () => {
    const s = scripted(
      j(200, { reviews: [review(1), review(2)], nextPageToken: "P2", totalReviewCount: 3, averageRating: 4.5 }),
      j(200, { reviews: [review(3)], totalReviewCount: 3, averageRating: 4.5 }),
    );
    const { client } = make(s);
    const page = await client.listReviews("accounts/1", "locations/2");
    expect(page).toMatchObject({ complete: true, pages: 2, totalReviewCount: 3, averageRating: 4.5 });
    expect(page.reviews).toHaveLength(3);
    const first = new URL(s.calls[0]!.url);
    expect(first.origin + first.pathname).toBe("https://mybusiness.googleapis.com/v4/accounts/1/locations/2/reviews");
    expect(first.searchParams.get("pageSize")).toBe("50");
    expect(first.searchParams.get("orderBy")).toBe("updateTime desc");
    expect(new URL(s.calls[1]!.url).searchParams.get("pageToken")).toBe("P2");
    for (const c of s.calls) { expect(c.method).toBe("GET"); expect(c.redirect).toBe("error"); expect(c.auth).toBe("Bearer TOKEN-1"); }
  });

  it("treats a location with no reviews as a COMPLETE empty read", async () => {
    const { client } = make(scripted(j(200, { totalReviewCount: 0 })));
    expect(await client.listReviews("accounts/1", "locations/2")).toMatchObject({ complete: true, reviews: [] });
  });

  it("ends INCOMPLETE — never complete — at the page cap, on a looping token, and past the deadline", async () => {
    const forever = (n: number) => scripted(...Array.from({ length: n }, (_, i) => j(200, { reviews: [review(i)], nextPageToken: `T${i}` })));
    expect(await make(forever(5)).client.listReviews("accounts/1", "locations/2", { maxPages: 3 })).toMatchObject({ complete: false, pages: 3 });
    const loop = scripted(j(200, { reviews: [review(1)], nextPageToken: "SAME" }), j(200, { reviews: [review(2)], nextPageToken: "SAME" }));
    expect(await make(loop).client.listReviews("accounts/1", "locations/2")).toMatchObject({ complete: false, pages: 2 });
    const { client } = make(scripted(j(200, { reviews: [review(1)], nextPageToken: "A" })));
    expect(await client.listReviews("accounts/1", "locations/2", { deadline: 0 })).toMatchObject({ complete: false, pages: 0 });
  });

  it("refuses malformed resource names before any request", async () => {
    const s = scripted();
    const { client } = make(s);
    for (const [a, l] of [["accounts/x", "locations/2"], ["accounts/1", "locations/../../x"], ["accounts/1/locations/2", "locations/2"], ["", ""]]) {
      await expect(client.listReviews(a!, l!)).rejects.toMatchObject({ code: "bad_response" });
    }
    expect(s.calls).toHaveLength(0);
  });
});

describe("pacing, retries and token refresh", () => {
  it("waits between requests, retries a 5xx and a dropped connection with backoff, then succeeds", async () => {
    const s = scripted(new TypeError("fetch failed https://x/?access_token=SECRET"), j(503, {}), j(200, { accounts: [{ name: "accounts/9", accountName: "Buff", type: "LOCATION_GROUP" }] }));
    const { client, sleeps } = make(s);
    expect(await client.listAccounts()).toEqual([{ name: "accounts/9", accountName: "Buff", type: "LOCATION_GROUP" }]);
    expect(s.calls).toHaveLength(3);
    expect(sleeps.some((ms) => ms >= 10)).toBe(true);
  });

  it("gives up after maxRetries and reports the failure as a CODE with no URL or token in the message", async () => {
    const s = scripted(...Array.from({ length: 6 }, () => new TypeError("fetch failed https://x/?access_token=SECRET-TOKEN")));
    const { client } = make(s, { maxRetries: 2 });
    try {
      await client.listAccounts();
      throw new Error("should fail");
    } catch (error) {
      expect(error).toBeInstanceOf(GoogleApiError);
      expect((error as GoogleApiError).code).toBe("network_error");
      expect((error as Error).message).not.toMatch(/SECRET|https:/);
    }
    expect(s.calls).toHaveLength(3);
  });

  it("honours Retry-After on a 429 up to the cap, and fails fast when Google asks for longer", async () => {
    const ok = scripted(j(429, { error: { status: "RESOURCE_EXHAUSTED" } }, { "retry-after": "2" }), j(200, { accounts: [] }));
    const a = make(ok);
    await a.client.listAccounts();
    expect(a.sleeps.some((ms) => ms >= 2000)).toBe(true);
    const long = scripted(j(429, { error: { status: "RESOURCE_EXHAUSTED" } }, { "retry-after": "3600" }));
    await expect(make(long).client.listAccounts()).rejects.toMatchObject({ code: "rate_limited" });
    expect(long.calls).toHaveLength(1);
  });

  it("on a 401 forces ONE refresh and retries once; a second 401 is `unauthorized`", async () => {
    let tokens = 0;
    let refreshes = 0;
    const s = scripted(j(401, { error: { status: "UNAUTHENTICATED" } }), j(200, { accounts: [] }));
    const { client } = make(s, { getAccessToken: async () => `T${++tokens}`, forceRefresh: () => { refreshes += 1; } });
    await client.listAccounts();
    expect(refreshes).toBe(1);
    expect(s.calls.map((c) => c.auth)).toEqual(["Bearer T1", "Bearer T2"]);

    const twice = scripted(j(401, {}), j(401, {}));
    await expect(make(twice, { forceRefresh: () => undefined }).client.listAccounts()).rejects.toMatchObject({ code: "unauthorized" });
    expect(twice.calls).toHaveLength(2);
  });

  it("never retries a 403, 404 or 400", async () => {
    for (const [status, code] of [[403, "permission_denied"], [404, "not_found"], [400, "bad_response"]] as const) {
      const s = scripted(j(status, { error: { status: "X" } }), j(200, {}));
      await expect(make(s).client.listAccounts()).rejects.toMatchObject({ code });
      expect(s.calls).toHaveLength(1);
    }
  });
});

describe("error classification", () => {
  it("recognises a project not yet approved for the Business Profile APIs (429 with a quota limit of 0) and does not retry it", async () => {
    const body = { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded for quota metric 'Requests' ...", details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "RATE_LIMIT_EXCEEDED", metadata: { quota_limit_value: "0", service: "mybusinessaccountmanagement.googleapis.com" } }] } };
    expect(classifyGoogleError(429, body)).toMatchObject({ code: "api_access_pending", status: 429 });
    const s = scripted(j(429, body), j(200, { accounts: [] }));
    await expect(make(s).client.listAccounts()).rejects.toMatchObject({ code: "api_access_pending" });
    expect(s.calls).toHaveLength(1);
  });

  it("distinguishes a disabled API, a daily quota, a scope problem and ordinary rate limiting", () => {
    expect(classifyGoogleError(403, { error: { status: "PERMISSION_DENIED", details: [{ reason: "SERVICE_DISABLED" }] } }).code).toBe("api_disabled");
    expect(classifyGoogleError(403, { error: { message: "My Business Account Management API has not been used in project 123 before or it is disabled." } }).code).toBe("api_disabled");
    expect(classifyGoogleError(429, { error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded ... per day" } }).code).toBe("quota_exceeded");
    expect(classifyGoogleError(429, { error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded ... per minute", details: [{ metadata: { quota_limit_value: "300" } }] } }).code).toBe("rate_limited");
    expect(classifyGoogleError(403, { error: { status: "PERMISSION_DENIED", details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }] } }).code).toBe("permission_denied");
    expect(classifyGoogleError(500, null).code).toBe("server_error");
    expect(classifyGoogleError(418, null).code).toBe("bad_response");
  });

  it("keeps nothing from Google's error body — not the message, the project number or a token — in the thrown error", async () => {
    const body = { error: { status: "PERMISSION_DENIED", message: "for consumer 'project_number:987654321' account bob@example.invalid ya29.SECRET" } };
    try {
      await make(scripted(j(403, body))).client.listAccounts();
      throw new Error("should fail");
    } catch (error) {
      expect(JSON.stringify(error)).not.toMatch(/987654321|bob@|ya29/);
      expect((error as Error).message).not.toMatch(/987654321|bob@|ya29/);
    }
  });
});

describe("listAccounts and listLocations", () => {
  it("pages accounts, keeps only well-formed names, and stops a looping token", async () => {
    const s = scripted(
      j(200, { accounts: [{ name: "accounts/1" }, { name: "evil/../x" }, { name: 5 }], nextPageToken: "n" }),
      j(200, { accounts: [{ name: "accounts/2", accountName: "B" }] }),
    );
    expect((await make(s).client.listAccounts()).map((a) => a.name)).toEqual(["accounts/1", "accounts/2"]);
    const loop = scripted(j(200, { accounts: [], nextPageToken: "x" }), j(200, { accounts: [], nextPageToken: "x" }));
    await expect(make(loop).client.listAccounts()).rejects.toMatchObject({ code: "bad_response" });
  });

  it("lists locations with the field mask, parses store code and address, and drops malformed entries", async () => {
    const s = scripted(j(200, { locations: [
      { name: "locations/10", title: "Buff City Soap", storeCode: " 219 ", storefrontAddress: { addressLines: ["2050 NW Lowenstein Dr", "Ste C"], locality: "Lee's Summit", administrativeArea: "MO", postalCode: "64081" } },
      { name: "locations/11", title: "No code" },
      { name: "bad", title: "x" },
    ] }));
    const out = await make(s).client.listLocations("accounts/1");
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ accountName: "accounts/1", locationName: "locations/10", title: "Buff City Soap", storeCode: "219", address: { lines: ["2050 NW Lowenstein Dr", "Ste C"], locality: "Lee's Summit", administrativeArea: "MO", postalCode: "64081" } });
    expect(out[1]).toMatchObject({ storeCode: null, address: null });
    const u = new URL(s.calls[0]!.url);
    expect(u.origin + u.pathname).toBe("https://mybusinessbusinessinformation.googleapis.com/v1/accounts/1/locations");
    expect(u.searchParams.get("readMask")).toBe("name,title,storeCode,storefrontAddress");
    expect(u.searchParams.get("pageSize")).toBe("100");
  });
});

describe("the client can only read", () => {
  it("has no method that could write, and its source uses GET exactly once", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./client.ts", import.meta.url), "utf8");
    expect([...src.matchAll(/method:\s*"([A-Z]+)"/g)].map((m) => m[1])).toEqual(["GET"]);
    expect(src).not.toMatch(/"(POST|PUT|PATCH|DELETE)"/);
    expect(Object.getOwnPropertyNames(GoogleBusinessClient.prototype).filter((n) => !["constructor", "getJson", "nextToken"].includes(n)).sort()).toEqual(["listAccounts", "listLocations", "listReviews"]);
  });
});
