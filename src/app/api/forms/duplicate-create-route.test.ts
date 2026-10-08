import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AccessScope } from "@/types";

/**
 * ============================================================================
 * POST /api/forms/instances — A REPEATED CREATE FROM CHAT RETURNS THE DRAFT
 * ============================================================================
 *
 * The route asks `findRecentAssistantDraft` before it writes anything. These
 * tests drive the real route with the body `createInlineForm` sends and assert
 * the side effect that matters: whether a second record is created.
 *
 * The lookup is keyed on the AUTHENTICATED manager and the CARD the create
 * came from (`proposalId`), runs only after the stale-card and location
 * checks, and never runs without a card id — so a reused draft is never a way
 * around either check, and a new request for the same person always creates.
 */

const ORIGINAL = { ...process.env };
const GLOBAL: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };

async function load(existing: { id: string } | null) {
  process.env.NEXT_PUBLIC_DEMO_MODE = "false";
  vi.resetModules();
  const created: Record<string, unknown>[] = [];
  const lookups: Record<string, unknown>[] = [];

  vi.doMock("@/lib/auth/server", async () => ({
    authorizeRequest: async (_request: Request, permission: string) => ({
      identity: { subject: "manager-1", email: "m@example.com", displayName: "Manager", role: "admin", scope: GLOBAL, verified: true },
      permission,
      provider: "supabase",
    }),
  }));
  vi.doMock("@/lib/forms/repository", () => ({
    getTemplateByKey: async (key: string) =>
      key === "coaching"
        ? { id: "tpl-coaching", key: "coaching", name: "Coaching Form", requiredPermission: "create_coaching_form", active: true }
        : null,
  }));
  vi.doMock("@/lib/forms/instances", () => ({
    createInstance: async (input: Record<string, unknown>) => {
      created.push(input);
      return { id: "inst-new", ...input };
    },
    findRecentAssistantDraft: async (input: Record<string, unknown>) => {
      lookups.push(input);
      return existing;
    },
    listInstances: async () => [],
    findDemoInstances: async () => ({ deletable: [], protected: [] }),
    deleteDemoInstances: async () => ({ deleted: 0 }),
    InstanceProtectedError: class extends Error {},
  }));

  const route = await import("./instances/route");
  return { route, created, lookups };
}

function post(body: Record<string, unknown>): Request {
  return new Request("https://app.test/api/forms/instances", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const BODY = {
  templateKey: "coaching",
  employeeName: "Avery Testperson",
  variantKey: null,
  employeeRole: null,
  locationId: null,
  source: "assistant",
  // A forged identity in the body is ignored; the lookup uses the session.
  createdBy: "someone-else",
  proposalId: "proposal-1111",
  conversation: [{ id: "m1", role: "user", content: "coaching form for Avery Testperson" }],
};

beforeEach(() => vi.resetModules());
afterEach(() => {
  process.env = { ...ORIGINAL };
  for (const mod of ["@/lib/auth/server", "@/lib/forms/repository", "@/lib/forms/instances"]) vi.doUnmock(mod);
  vi.resetModules();
});

describe("a create from chat that repeats one just made", () => {
  it("returns the existing draft, marked reused, and creates nothing", async () => {
    const { route, created, lookups } = await load({ id: "inst-existing" });
    const response = await route.POST(post(BODY));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { instance: { id: string }; reused?: boolean };
    expect(body.instance.id).toBe("inst-existing");
    expect(body.reused).toBe(true);
    expect(created).toEqual([]);
    expect(lookups).toEqual([
      { templateKey: "coaching", employeeName: "Avery Testperson", createdBy: "manager-1", locationId: null, proposalId: "proposal-1111" },
    ]);
  });

  it("creates as before when there is no such draft", async () => {
    const { route, created } = await load(null);
    const response = await route.POST(post(BODY));
    expect(response.status).toBe(200);
    expect(((await response.json()) as { reused?: boolean }).reused).toBeUndefined();
    expect(created).toHaveLength(1);
  });

  it("a stale card is still refused before any draft is looked up or returned", async () => {
    const { route, created, lookups } = await load({ id: "inst-existing" });
    const response = await route.POST(
      post({
        ...BODY,
        conversation: [
          { id: "m1", role: "user", content: "coaching form for Avery Testperson" },
          { id: "m2", role: "assistant", content: "Here is what I would put on a Coaching Form." },
          { id: "m3", role: "user", content: "No, not Avery Testperson. Jordan Testperson." },
        ],
      }),
    );
    expect(response.status).toBe(409);
    expect(lookups).toEqual([]);
    expect(created).toEqual([]);
  });

  it("a create without a card id is never matched, and records nothing to match later", async () => {
    const { route, created, lookups } = await load({ id: "inst-existing" });
    const withoutCard: Record<string, unknown> = { ...BODY };
    delete withoutCard.proposalId;
    const response = await route.POST(post(withoutCard));
    expect(response.status).toBe(200);
    expect(lookups).toEqual([]);
    expect(created).toHaveLength(1);
    expect(created[0]!.proposalId).toBeUndefined();
  });

  it("the new form records its card, so a repeated press can find it", async () => {
    const { route, created } = await load(null);
    await route.POST(post(BODY));
    expect(created[0]!.proposalId).toBe("proposal-1111");
  });

  it("a manual create never reuses a draft", async () => {
    const { route, created, lookups } = await load({ id: "inst-existing" });
    const response = await route.POST(post({ ...BODY, source: "manual", conversation: undefined }));
    expect(response.status).toBe(200);
    expect(lookups).toEqual([]);
    expect(created).toHaveLength(1);
  });
});
