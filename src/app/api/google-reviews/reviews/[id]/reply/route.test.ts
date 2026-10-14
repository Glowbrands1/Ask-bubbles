import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * THE REPLY ROUTE — who may call it, that the acting person comes from the session and never the body, how results become
 * HTTP, and what is never returned. Auth and the service are mocked; the real route code runs.
 */

afterEach(() => {
  for (const mod of ["@/lib/api/respond", "@/lib/auth/server", "@/lib/google-reviews/replies"]) vi.doUnmock(mod);
});

async function load(options: { permitted?: boolean; result?: unknown } = {}) {
  vi.resetModules();
  const seen = { permissions: [] as string[], calls: [] as { fn: string; input: Record<string, unknown> }[], rateLimited: 0 };
  vi.doMock("@/lib/api/respond", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/api/respond")>()),
    assertLiveMode: () => {},
    assertNoConfigurationProblems: () => {},
    assertWithinRateLimit: () => { seen.rateLimited += 1; },
  }));
  vi.doMock("@/lib/auth/server", () => ({
    authorizeRequest: async (_request: Request, permission: string) => {
      seen.permissions.push(permission);
      if (options.permitted === false) {
        const { AuthError } = await import("@/lib/auth/types");
        throw new AuthError("forbidden", "Your role does not have permission to do that.");
      }
      return { identity: { subject: "u-1", email: "manager@example.test", role: "location_manager", verified: true, scope: { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: [] } } };
    },
  }));
  vi.doMock("@/lib/google-reviews/replies", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/lib/google-reviews/replies")>();
    const record = (fn: string) => async (input: Record<string, unknown>) => { seen.calls.push({ fn, input }); return options.result ?? { ok: true, reply: { id: "d1", status: "draft", version: 1, body: "Hi" } }; };
    return { ...original, saveReplyDraft: record("save"), discardReplyDraft: record("discard"), publishReply: record("publish") };
  });
  return { seen, route: await import("./route") };
}

const ctx = { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) };
const req = (method: string, body?: unknown) => new Request("https://askbubbles.example/api/google-reviews/reviews/x/reply", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

describe("authorization", () => {
  it("asks for reply_to_reviews on every verb, rate-limits writes, and passes the verified session as the actor — never the body", async () => {
    const { seen, route } = await load();
    await route.PUT(req("PUT", { body: "Hi", version: 2, actor: { label: "user:attacker", role: "admin" }, label: "user:attacker" }), ctx);
    await route.DELETE(req("DELETE"), ctx);
    await route.POST(req("POST", { version: 2, confirmPublish: true, actor: "user:attacker" }), ctx);
    expect(seen.permissions).toEqual(["reply_to_reviews", "reply_to_reviews", "reply_to_reviews"]);
    expect(seen.rateLimited).toBe(3);
    for (const call of seen.calls) {
      expect(call.input.actor).toEqual({ label: "user:manager@example.test", role: "location_manager", verified: true, scope: { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: [] } });
      expect(call.input.reviewId).toBe("11111111-1111-4111-8111-111111111111");
    }
    expect(seen.calls.map((c) => c.fn)).toEqual(["save", "discard", "publish"]);
    expect(seen.calls[2]!.input).toMatchObject({ version: 2, confirmPublish: true });
  });

  it("a role without the permission gets 403 and reaches no service", async () => {
    const { seen, route } = await load({ permitted: false });
    for (const response of [await route.PUT(req("PUT", { body: "x" }), ctx), await route.DELETE(req("DELETE"), ctx), await route.POST(req("POST", { version: 1, confirmPublish: true }), ctx)]) {
      expect(response.status).toBe(403);
    }
    expect(seen.calls).toEqual([]);
  });
});

describe("results", () => {
  it("maps failures to HTTP with a code and a sentence, never Google's words", async () => {
    for (const [code, status] of [["forbidden", 403], ["reply_conflict", 409], ["reply_changed", 409], ["reply_busy", 409], ["confirmation_required", 400], ["replies_disabled", 503], ["rate_limited", 429], ["network_error", 502], ["not_found", 404]] as const) {
      const { route } = await load({ result: { ok: false, code, field: code === "confirmation_required" ? "confirmPublish" : undefined } });
      const response = await route.POST(req("POST", { version: 1 }), ctx);
      const json = await response.json();
      expect(response.status, code).toBe(status);
      expect(json).toMatchObject({ status: "failed", code });
      expect(typeof json.reason).toBe("string");
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("returns the person's own draft on success and reports a reconcile honestly", async () => {
    const { route } = await load({ result: { ok: true, reply: { id: "d1", status: "published" }, alreadyOnGoogle: true } });
    const json = await (await route.POST(req("POST", { version: 1, confirmPublish: true }), ctx)).json();
    expect(json).toEqual({ status: "ok", reply: { id: "d1", status: "published" }, alreadyOnGoogle: true });
  });

  it("an unreadable body is a 400, not a crash", async () => {
    const { route } = await load();
    const response = await route.POST(new Request("https://x.example", { method: "POST", body: "not json" }), ctx);
    expect(response.status).toBe(400);
  });
});
