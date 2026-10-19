import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * ============================================================================
 * THE ADMINISTRATOR DECISION ROUTES — rehire approval and shadow review
 * ============================================================================
 * Who may call (an administrator, same-origin, rate-limited), that the actor is
 * the verified session and never the body, and that a partial failure is never
 * a success. The database and auth layers are stubbed: they are exercised in
 * `rehire.test.ts` and supabase/tests/woven_disable_terminated_checks.sql.
 */

const MOCKED = ["@/lib/api/respond", "@/lib/auth/server", "@/lib/employees/woven/access/rehire-run", "@/lib/employees/woven/access/shadow-review-run", "@/lib/employees/woven/access/reviewers-run"];
afterEach(() => {
  for (const m of MOCKED) vi.doUnmock(m);
});

interface Seen {
  permissions: string[];
  rateLimited: string[];
  approvals: { input: Record<string, unknown>; approver: string }[];
  reviews: { input: Record<string, unknown>; reviewer: string }[];
  reviewers: { what: string; input: Record<string, unknown>; actor: string }[];
}

async function load(
  route: "rehire" | "termination-review" | "termination-reviewers" | "termination-reviewers/revoke",
  options: { role?: string; rehire?: unknown; review?: unknown; denyPermission?: string } = {},
) {
  vi.resetModules();
  const seen: Seen = { permissions: [], rateLimited: [], approvals: [], reviews: [], reviewers: [] };
  vi.doMock("@/lib/api/respond", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/api/respond")>()),
    assertLiveMode: () => {},
    assertNoConfigurationProblems: () => {},
    assertWithinRateLimit: (_r: Request, name: string) => void seen.rateLimited.push(name),
  }));
  vi.doMock("@/lib/auth/server", () => ({
    authorizeRequest: async (_request: Request, permission: string) => {
      seen.permissions.push(permission);
      if (permission === options.denyPermission) {
        const { AuthError } = await import("@/lib/auth/types");
        throw new AuthError("forbidden", "Your role does not have permission to do that.");
      }
      return { identity: { subject: "11111111-2222-4333-8444-555555555555", email: "admin@example.test", role: options.role ?? "admin" }, permission };
    },
  }));
  vi.doMock("@/lib/employees/woven/access/rehire-run", () => ({
    runRehireApproval: async (input: Record<string, unknown>, approver: string) => {
      seen.approvals.push({ input, approver });
      return options.rehire ?? { status: "rehired" };
    },
  }));
  vi.doMock("@/lib/employees/woven/access/shadow-review-run", () => ({
    loadShadowReviewCandidates: async () => ({ shadowRunId: null, createdAt: null, runStatus: null, guardCodes: [], gate: { ok: false, code: "no_shadow_run" }, employeeIds: [] }),
    runShadowReview: async (input: Record<string, unknown>, reviewer: string) => {
      seen.reviews.push({ input, reviewer });
      return options.review ?? { status: "recorded", reviewId: "99999999-9999-4999-8999-999999999999", employeeCount: 1, idsSha256: "0".repeat(64) };
    },
  }));
  vi.doMock("@/lib/employees/woven/access/reviewers-run", () => ({
    listDesignations: async () => [],
    runDesignateReviewer: async (input: Record<string, unknown>, actor: string) => {
      seen.reviewers.push({ what: "designate", input, actor });
      return options.review ?? { status: "designated", designationId: "99999999-9999-4999-8999-999999999999" };
    },
    runRevokeReviewer: async (input: Record<string, unknown>, actor: string) => {
      seen.reviewers.push({ what: "revoke", input, actor });
      return options.review ?? { status: "revoked", designationId: "99999999-9999-4999-8999-999999999999" };
    },
  }));
  const handlers = (await import(`./${route}/route`)) as Record<string, (req: Request) => Promise<Response>>;
  return { handlers, seen };
}

const SAME = { origin: "https://ask-bubbles.test", host: "ask-bubbles.test", "content-type": "application/json" };
const post = (route: string, body: unknown, headers: Record<string, string> = SAME) =>
  new Request(`https://ask-bubbles.test/api/admin/employees/woven/${route}`, { method: "POST", headers, body: JSON.stringify(body) });

const REHIRE = { appUserId: "00000000-0000-4000-8000-000000000001", externalEmployeeId: "E1", reason: "Rehired, confirmed with HR" };
const REVIEW = { shadowRunId: "11111111-1111-4111-8111-111111111111", employeeIds: ["E1"], reason: "checked" };

describe.each([
  { route: "rehire" as const, body: REHIRE },
  { route: "termination-review" as const, body: REVIEW },
])("POST $route", ({ route, body }) => {
  it("refuses a cross-origin or origin-less request before anything runs", async () => {
    for (const headers of [{ ...SAME, origin: "https://evil.example" }, { "content-type": "application/json" }, { ...SAME, "sec-fetch-site": "cross-site" }]) {
      const { handlers, seen } = await load(route);
      const response = await handlers.POST!(post(route, body, headers));
      expect(response.status).toBe(403);
      expect(seen.approvals).toEqual([]);
      expect(seen.reviews).toEqual([]);
    }
  });

  it("is administrator-only: a manager (even holding the permissions) and a caller lacking a permission are refused", async () => {
    for (const role of ["location_manager", "district_manager", "regional_manager", "assistant_manager", "employee"]) {
      const { handlers, seen } = await load(route, { role });
      expect((await handlers.POST!(post(route, body))).status).toBe(403);
      expect(seen.approvals).toEqual([]);
      expect(seen.reviews).toEqual([]);
    }
    const { handlers, seen } = await load(route, { denyPermission: "manage_users" });
    expect((await handlers.POST!(post(route, body))).status).toBe(403);
    expect(seen.approvals.length + seen.reviews.length).toBe(0);
  });

  it("is rate limited", async () => {
    const { handlers, seen } = await load(route);
    await handlers.POST!(post(route, body));
    expect(seen.rateLimited).toEqual(["mutate"]);
  });

  it("takes the actor from the verified session, never from the body", async () => {
    const { handlers, seen } = await load(route);
    const response = await handlers.POST!(post(route, { ...body, approverUserId: "attacker", reviewedBy: "attacker", actor: "attacker", approver: "attacker" }));
    expect(response.status).toBe(200);
    const actor = [...seen.approvals.map((a) => a.approver), ...seen.reviews.map((r) => r.reviewer)];
    expect(actor).toEqual(["11111111-2222-4333-8444-555555555555"]);
    const input = [...seen.approvals.map((a) => a.input), ...seen.reviews.map((r) => r.input)][0]!;
    expect(JSON.stringify(input)).not.toContain("attacker");
  });

  it("requires a written reason", async () => {
    const { handlers, seen } = await load(route);
    const response = await handlers.POST!(post(route, { ...body, reason: "  " }));
    expect(response.status).toBe(400);
    expect(seen.approvals.length + seen.reviews.length).toBe(0);
  });
});

describe("POST rehire outcomes", () => {
  it("a refusal is 409 with the short code", async () => {
    const { handlers } = await load("rehire", { rehire: { status: "refused", code: "rehire_not_active_in_latest_read" } });
    const response = await handlers.POST!(post("rehire", REHIRE));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ status: "refused", code: "rehire_not_active_in_latest_read" });
  });

  it("an INCOMPLETE rehire (ban not lifted, or not recorded) is a 502 — never a success", async () => {
    const { handlers } = await load("rehire", { rehire: { status: "incomplete", code: "unban_failed_reverted" } });
    const response = await handlers.POST!(post("rehire", REHIRE));
    expect(response.status).toBe(502);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe("incomplete");
  });

  it("success and an idempotent repeat are 200", async () => {
    for (const status of ["rehired", "already_rehired"]) {
      const { handlers } = await load("rehire", { rehire: { status } });
      const response = await handlers.POST!(post("rehire", REHIRE));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status });
    }
  });
});

describe("termination-review", () => {
  it("a database refusal is 409 with the short code", async () => {
    const { handlers } = await load("termination-review", { review: { status: "refused", code: "review_not_latest_run" } });
    const response = await handlers.POST!(post("termination-review", REVIEW));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ status: "refused", code: "review_not_latest_run" });
  });

  it("GET shows the gate and the candidate ids to an authorised caller, and needs manage_users + manage_integrations", async () => {
    const { handlers, seen } = await load("termination-review");
    const response = await handlers.GET!(new Request("https://ask-bubbles.test/api/admin/employees/woven/termination-review"));
    expect(response.status).toBe(200);
    expect(seen.permissions).toEqual(["manage_users"]);
    const denied = await load("termination-review", { denyPermission: "manage_users" });
    expect((await denied.handlers.GET!(new Request("https://ask-bubbles.test/x"))).status).toBe(403);
  });
});

const REVIEWER = { userId: "00000000-0000-4000-8000-0000000000a1", reason: "synthetic test designation" };

describe.each([
  { route: "termination-reviewers" as const, what: "designate" },
  { route: "termination-reviewers/revoke" as const, what: "revoke" },
])("POST $route (who may review enforcement)", ({ route, what }) => {
  it("refuses a cross-origin or origin-less request before anything runs", async () => {
    for (const headers of [{ ...SAME, origin: "https://evil.example" }, { "content-type": "application/json" }, { ...SAME, "sec-fetch-site": "cross-site" }]) {
      const { handlers, seen } = await load(route);
      expect((await handlers.POST!(post(route, REVIEWER, headers))).status).toBe(403);
      expect(seen.reviewers).toEqual([]);
    }
  });

  it("is administrator-only", async () => {
    for (const role of ["location_manager", "district_manager", "regional_manager", "assistant_manager", "employee"]) {
      const { handlers, seen } = await load(route, { role });
      expect((await handlers.POST!(post(route, REVIEWER))).status).toBe(403);
      expect(seen.reviewers).toEqual([]);
    }
  });

  it("is rate limited, takes the actor from the verified session and never the body, and needs a written reason", async () => {
    const { handlers, seen } = await load(route);
    const response = await handlers.POST!(post(route, { ...REVIEWER, actor: "attacker", designatedBy: "attacker", approver: "attacker" }));
    expect(response.status).toBe(200);
    expect(seen.rateLimited).toEqual(["mutate"]);
    expect(seen.reviewers).toHaveLength(1);
    expect(seen.reviewers[0]).toMatchObject({ what, actor: "11111111-2222-4333-8444-555555555555" });
    expect(JSON.stringify(seen.reviewers[0]!.input)).not.toContain("attacker");

    const blank = await load(route);
    expect((await blank.handlers.POST!(post(route, { ...REVIEWER, reason: "  " }))).status).toBe(400);
    expect(blank.seen.reviewers).toEqual([]);
  });

  it("a database refusal is 409 with the short code", async () => {
    const { handlers } = await load(route, { review: { status: "refused", code: "designate_self" } });
    const response = await handlers.POST!(post(route, REVIEWER));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ status: "refused", code: "designate_self" });
  });
});

describe("GET termination-reviewers", () => {
  it("lists designations to an authorised caller (manage_users + manage_integrations) and nobody else", async () => {
    const { handlers, seen } = await load("termination-reviewers");
    const response = await handlers.GET!(new Request("https://ask-bubbles.test/api/admin/employees/woven/termination-reviewers"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ designations: [] });
    expect(seen.permissions).toEqual(["manage_users"]);
    const denied = await load("termination-reviewers", { denyPermission: "manage_users" });
    expect((await denied.handlers.GET!(new Request("https://ask-bubbles.test/x"))).status).toBe(403);
  });
});
