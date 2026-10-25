import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AccessScope } from "@/types";

/**
 * CROSS_CHAT_DRAFT_DEDUPE_ENABLED reuses an open draft from another chat.
 * The card-id match still runs first. Nothing here reaches Supabase.
 */

const ORIGINAL = { ...process.env };
const GLOBAL: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };

async function load(options: {
  existingCard?: { id: string } | null;
  crossChat?: { id: string } | null;
}) {
  process.env.NEXT_PUBLIC_DEMO_MODE = "false";
  vi.resetModules();
  const created: Record<string, unknown>[] = [];
  const crossChatCalls: Record<string, unknown>[] = [];

  vi.doMock("@/lib/auth/server", async () => ({
    authorizeRequest: async (_request: Request, permission: string) => ({
      identity: {
        subject: "manager-1",
        email: "m@example.com",
        displayName: "Manager",
        role: "district_manager",
        scope: GLOBAL,
        verified: true,
      },
      permission,
      provider: "supabase",
    }),
  }));
  vi.doMock("@/lib/forms/repository", () => ({
    getTemplateByKey: async (key: string) =>
      key === "dpoa"
        ? {
            id: "tpl-dpoa",
            key: "dpoa",
            name: "Corrective Action Form",
            requiredPermission: "create_coaching_form",
            active: true,
          }
        : null,
  }));
  vi.doMock("@/lib/forms/instances", () => ({
    createInstance: async (input: Record<string, unknown>) => {
      created.push(input);
      return { id: "inst-new", ...input };
    },
    findRecentAssistantDraft: async () => options.existingCard ?? null,
    listInstances: async () => [],
    findDemoInstances: async () => ({ deletable: [], protected: [] }),
    deleteDemoInstances: async () => ({ deleted: 0 }),
    InstanceProtectedError: class extends Error {},
  }));
  vi.doMock("@/lib/forms/draft-reopen", () => ({
    findResentDraft: async () => null,
    findAccountResentDraft: async () => null,
    rememberDraftIncident: async () => undefined,
    findCrossChatOpenDraft: async (input: Record<string, unknown>) => {
      crossChatCalls.push(input);
      return options.crossChat ?? null;
    },
  }));

  const route = await import("./instances/route");
  return { route, created, crossChatCalls };
}

function post(body: Record<string, unknown>): Request {
  return new Request("https://app.test/api/forms/instances", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const BODY = {
  templateKey: "dpoa",
  employeeName: "Paisley Example",
  variantKey: null,
  employeeRole: null,
  locationId: null,
  source: "assistant",
  formDate: "2026-10-20",
  proposalId: "proposal-2222",
  conversation: [{ id: "m1", role: "user", content: "CA for Paisley Example on 10-20-26" }],
};

beforeEach(() => vi.resetModules());
afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.doUnmock("@/lib/auth/server");
  vi.doUnmock("@/lib/forms/repository");
  vi.doUnmock("@/lib/forms/instances");
  vi.doUnmock("@/lib/forms/draft-reopen");
  vi.resetModules();
});

describe("cross-chat open draft on create", () => {
  it("returns the other chat's draft and creates nothing when the flag is on", async () => {
    process.env.CROSS_CHAT_DRAFT_DEDUPE_ENABLED = "1";
    const { route, created, crossChatCalls } = await load({ crossChat: { id: "inst-other-chat" } });
    const response = await route.POST(post(BODY));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { instance: { id: string }; reused?: boolean };
    expect(body.instance.id).toBe("inst-other-chat");
    expect(body.reused).toBe(true);
    expect(created).toEqual([]);
    /*
     * Changed on purpose (ported from Ask Sunny, conv_mvh1m29j25aig2n): the
     * lookup now also carries the caller, so only their own draft at a store
     * they may open is reused. See `draft-reopen-scope-e2e.test.ts`.
     */
    expect(crossChatCalls).toHaveLength(1);
    expect(crossChatCalls[0]).toMatchObject({
      templateKey: "dpoa",
      employeeName: "Paisley Example",
      formDate: "2026-10-20",
      createdBy: "manager-1",
      actor: { id: "manager-1" },
    });
  });

  it("does not look across chats when the flag is off", async () => {
    delete process.env.CROSS_CHAT_DRAFT_DEDUPE_ENABLED;
    const { route, created, crossChatCalls } = await load({ crossChat: { id: "inst-other-chat" } });
    const response = await route.POST(post(BODY));
    expect(response.status).toBe(200);
    expect(created).toHaveLength(1);
    expect(crossChatCalls).toEqual([]);
  });

  it("keeps the card-id match first", async () => {
    process.env.CROSS_CHAT_DRAFT_DEDUPE_ENABLED = "1";
    const { route, created, crossChatCalls } = await load({
      existingCard: { id: "inst-card" },
      crossChat: { id: "inst-other-chat" },
    });
    const response = await route.POST(post(BODY));
    const body = (await response.json()) as { instance: { id: string } };
    expect(body.instance.id).toBe("inst-card");
    expect(created).toEqual([]);
    expect(crossChatCalls).toEqual([]);
  });

  it("still creates when the manager asked for a separate document", async () => {
    process.env.CROSS_CHAT_DRAFT_DEDUPE_ENABLED = "1";
    const { route, created, crossChatCalls } = await load({ crossChat: { id: "inst-other-chat" } });
    const response = await route.POST(
      post({
        ...BODY,
        conversation: [{ id: "m1", role: "user", content: "I need another form for Paisley Example" }],
      }),
    );
    expect(response.status).toBe(200);
    expect(created).toHaveLength(1);
    expect(crossChatCalls).toEqual([]);
  });
});
