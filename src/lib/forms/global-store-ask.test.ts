import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DirectoryRosterRow } from "@/lib/forms/employee-roster";
import { COMPANY_LOCATIONS } from "@/lib/locations";
import { buildStoreIndex, type StoreIndex } from "@/lib/stores/resolver";
import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import { rosterResultFor } from "@/test/roster-result";
import type { AccessScope, ChatMessage, Role } from "@/types";

import { GLOBAL_STORE_ASK_TAG } from "./global-store-ask";

/**
 * A global-scope district manager is asked once which store. The card stays
 * ready. An admin is not asked. Empire, SD is not a store.
 */

const store: FakeStore = {
  form_instances: [],
  form_instance_values: [],
  form_instance_events: [],
  form_template_versions: [],
  form_templates: [],
  form_template_current: [],
  form_template_assets: [],
};
const state = vi.hoisted(() => ({ directory: [] as unknown[] }));

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: () => fakeSupabase(store) }));
vi.mock("@/lib/forms/employee-roster", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/forms/employee-roster")>();
  return {
    ...actual,
    loadScopedRoster: async (scope: AccessScope | null) => actual.scopeRoster(state.directory as never, scope),
    loadScopedRosterResult: async (scope: AccessScope | null) =>
      rosterResultFor(actual.scopeRoster, state.directory as never, scope),
  };
});

const { ensureTemplateLibrary, listTemplateSummaries } = await import("@/lib/forms/repository");
const { proposeFormForTurn } = await import("@/lib/ai/form-proposal");
const { createInstance } = await import("@/lib/forms/instances");
const { authorizeLocation } = await import("./location-scope");

const TODAY = "2026-10-24";
const GLOBAL: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const ASK = "Build me a coaching form for Sarah Test for that.";

const NICKNAMES = buildStoreIndex({ stores: COMPANY_LOCATIONS, nicknames: { "the island": "236" } });

async function propose(input: {
  role: Role;
  question?: string;
  history?: ChatMessage[];
  antiLoop?: boolean;
  ask?: boolean;
  typedName?: boolean;
  storeIndex?: StoreIndex;
}) {
  process.env.GLOBAL_STORE_ASK_ENABLED = input.ask === false ? "false" : "1";
  if (input.antiLoop) process.env.ANTI_LOOP_ENABLED = "1";
  else delete process.env.ANTI_LOOP_ENABLED;
  if (input.typedName) process.env.TYPED_NAME_ENABLED = "1";
  else delete process.env.TYPED_NAME_ENABLED;
  delete process.env.SELF_CHECK_ENABLED;
  return proposeFormForTurn({
    history: input.history ?? [],
    question: input.question ?? ASK,
    questionMessageId: "u1",
    actor: { role: input.role, scope: GLOBAL },
    summaries: await listTemplateSummaries(),
    today: TODAY,
    ...(input.storeIndex ? { storeIndex: input.storeIndex } : {}),
    ...(input.history?.some((message) => message.formProposal)
      ? { continueTemplateKey: "coaching" }
      : {}),
  });
}

function historyFrom(
  question: string,
  response: { content: string; formProposal?: ChatMessage["formProposal"] } | null,
): ChatMessage[] {
  return [
    { id: "u1", role: "user", content: question, createdAt: "2026-10-24T18:00:00Z" },
    {
      id: "a1",
      role: "assistant",
      content: response?.content ?? "",
      createdAt: "2026-10-24T18:00:01Z",
      formProposal: response?.formProposal ?? undefined,
    },
  ] as ChatMessage[];
}

beforeEach(async () => {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  state.directory = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-24T18:00:00Z"));
  await ensureTemplateLibrary("system");
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.GLOBAL_STORE_ASK_ENABLED;
  delete process.env.ANTI_LOOP_ENABLED;
  delete process.env.TYPED_NAME_ENABLED;
  delete process.env.SELF_CHECK_ENABLED;
});

describe("global store ask", () => {
  it("asks a district manager once, and the card stays ready", async () => {
    const first = await propose({ role: "district_manager" });
    expect(first?.formProposal?.status).toBe("ready");
    expect(first?.formProposal?.status).not.toBe("needs_location");
    expect(first?.formProposal?.supportsInlineDraft).toBe(true);
    expect(first?.formProposal?.locationId).toBeNull();
    expect(first?.content).toContain(GLOBAL_STORE_ASK_TAG);
    expect(first?.content).toMatch(/Create the draft here when you're ready/);
    expect(first?.content).not.toMatch(/won't name one/i);

    const history = [
      { id: "u1", role: "user", content: ASK, createdAt: "2026-10-24T18:00:00Z" },
      {
        id: "a1",
        role: "assistant",
        content: first?.content ?? "",
        createdAt: "2026-10-24T18:00:01Z",
        formProposal: first?.formProposal ?? undefined,
      },
    ] as ChatMessage[];
    const second = await propose({
      role: "district_manager",
      question: "she was talking about customers",
      history,
    });
    expect(second?.formProposal?.status).toBe("ready");
    expect(second?.content ?? "").not.toContain(GLOBAL_STORE_ASK_TAG);
  });

  it("does not ask an admin, and does not ask when the flag is off", async () => {
    const admin = await propose({ role: "admin" });
    expect(admin?.formProposal?.status).toBe("ready");
    expect(admin?.content).toMatch(/covers every store, so this form won't name one/i);
    expect(admin?.content).not.toContain(GLOBAL_STORE_ASK_TAG);

    const owner = await propose({ role: "owner" });
    expect(owner?.content).not.toContain(GLOBAL_STORE_ASK_TAG);

    const off = await propose({ role: "district_manager", ask: false });
    expect(off?.formProposal?.status).toBe("ready");
    expect(off?.content).toMatch(/won't name one/i);
    expect(off?.content).not.toContain(GLOBAL_STORE_ASK_TAG);
  });

  it("stays ready with the anti-loop store rule, and skips the ask once a store is named", async () => {
    const open = await propose({ role: "district_manager", antiLoop: true });
    expect(open?.formProposal?.status).toBe("ready");
    expect(open?.formProposal?.locationId).toBeNull();
    expect(open?.content).toContain(GLOBAL_STORE_ASK_TAG);

    const admin = await propose({ role: "admin", antiLoop: true });
    expect(admin?.formProposal?.status).toBe("ready");
    expect(admin?.content).not.toContain(GLOBAL_STORE_ASK_TAG);
    expect(admin?.content).toMatch(/store is blank/i);

    const named = await propose({
      role: "district_manager",
      antiLoop: true,
      question: "Build me a coaching form for Sarah Test at Kearney for that.",
    });
    expect(named?.formProposal?.locationId).toBe("loc-66");
    expect(named?.content).not.toContain(GLOBAL_STORE_ASK_TAG);
  });

  it("does not treat Empire, SD as a store", async () => {
    const response = await propose({
      role: "district_manager",
      antiLoop: true,
      question: "Build me a coaching form for Sarah Test at Empire SD for that.",
    });
    expect(response?.formProposal?.status).toBe("ready");
    expect(response?.formProposal?.locationId).toBeNull();
    expect(response?.formProposal?.locationName ?? "").not.toMatch(/empire/i);
    expect(response?.content).toContain(GLOBAL_STORE_ASK_TAG);
    expect(response?.formProposal?.supportsInlineDraft).toBe(true);
  });

  it.each([
    ["in the same message", "Build me a coaching form for Sarah Test at Kearney for that.", "loc-66", "Kearney, NE", undefined],
    ["by nickname", "Build me a coaching form for Sarah Test at the island for that.", "loc-236", "Grand Island, NE", NICKNAMES],
    ["with a typo", "Build me a coaching form for Sarah Test at Kearny", "loc-66", "Kearney, NE", undefined],
  ] as const)("names the store %s, asks nothing, and keeps that store on the next turn", async (_label, question, locationId, locationName, storeIndex) => {
    const first = await propose({ role: "district_manager", question, storeIndex });
    expect(first?.formProposal?.status).toBe("ready");
    expect(first?.formProposal?.supportsInlineDraft).toBe(true);
    expect(first?.formProposal?.locationId).toBe(locationId);
    expect(first?.formProposal?.locationName).toBe(locationName);
    expect(first?.content ?? "").not.toContain(GLOBAL_STORE_ASK_TAG);
    expect(first?.content ?? "").not.toMatch(/is that the store\?/i);

    const second = await propose({
      role: "district_manager",
      question: "she was talking about customers",
      history: historyFrom(question, first),
      storeIndex,
    });
    expect(second?.formProposal?.status).toBe("ready");
    expect(second?.formProposal?.supportsInlineDraft).toBe(true);
    expect(second?.formProposal?.locationId).toBe(locationId);
    expect(second?.formProposal?.locationName).toBe(locationName);
    expect(second?.content ?? "").not.toContain(GLOBAL_STORE_ASK_TAG);
  });

  it("keeps a store named on an earlier turn", async () => {
    const opening = "Build me a coaching form for Sarah Test at Kearney for that.";
    const first = await propose({ role: "district_manager", question: opening });
    expect(first?.formProposal?.locationId).toBe("loc-66");
    const second = await propose({
      role: "district_manager",
      question: "she was late again today",
      history: historyFrom(opening, first),
    });
    expect(second?.formProposal?.status).toBe("ready");
    expect(second?.formProposal?.supportsInlineDraft).toBe(true);
    expect(second?.formProposal?.locationId).toBe("loc-66");
    expect(second?.formProposal?.locationName).toBe("Kearney, NE");
    expect(second?.content ?? "").not.toContain(GLOBAL_STORE_ASK_TAG);
  });

  it("asks at most once, even when the next turns ignore the question or answer something else", async () => {
    const turns = [
      ASK,
      "ok",
      "she was talking about customers",
      "payroll deduct is no",
    ];
    const replies: string[] = [];
    let history: ChatMessage[] = [];
    for (const [index, question] of turns.entries()) {
      const response = await propose({ role: "district_manager", question, history });
      replies.push(response?.content ?? "");
      if (response?.formProposal) {
        expect(response.formProposal.status, question).toBe("ready");
        expect(response.formProposal.supportsInlineDraft, question).toBe(true);
        expect(response.formProposal.employeeName, question).toBe("Sarah Test");
      }
      history = [
        ...history,
        { id: `u${index}`, role: "user", content: question, createdAt: "2026-10-24T18:00:00Z" },
        {
          id: `a${index}`,
          role: "assistant",
          content: response?.content ?? "",
          createdAt: "2026-10-24T18:00:01Z",
          formProposal: response?.formProposal ?? undefined,
        },
      ] as ChatMessage[];
    }
    const asked = replies.filter((reply) => reply.includes(GLOBAL_STORE_ASK_TAG));
    expect(asked).toHaveLength(1);
    expect(replies[0]).toContain(GLOBAL_STORE_ASK_TAG);
  });

  it("keeps the card ready so the draft can be created without a store answer", async () => {
    const response = await propose({ role: "district_manager" });
    const proposal = response?.formProposal;
    expect(proposal?.employeeName).toBe("Sarah Test");
    expect(proposal?.status).toBe("ready");
    expect(proposal?.supportsInlineDraft).toBe(true);
    expect(proposal?.locationId ?? null).toBeNull();
    expect(response?.content).toContain(GLOBAL_STORE_ASK_TAG);
    expect(authorizeLocation(GLOBAL, proposal?.locationId ?? null).kind).not.toBe("refused");

    const created = await createInstance({
      templateKey: proposal!.templateKey,
      variantKey: proposal!.variantKey ?? null,
      employeeName: proposal!.employeeName!,
      employeeRole: proposal!.employeeRole,
      locationId: proposal!.locationId,
      createdBy: "manager-1",
      createdByRole: "district_manager",
      source: "assistant",
      formDate: TODAY,
      proposalId: proposal!.proposalId,
    });
    expect(created.status).toBe("draft");
    expect(created.employeeName).toBe("Sarah Test");
    expect(created.locationId).toBeNull();
    expect(created.id).toBeTruthy();
  });

  it("uses a typed name that is not in Woven, and the store question still does not block the form", async () => {
    const woven: DirectoryRosterRow = {
      id: "e-jane",
      firstName: "Jane",
      lastName: "Doe",
      preferredFirstName: null,
      employmentStatus: "active",
      locationIds: ["loc-264"],
      positionName: "Team Member",
      lastSyncedAt: "2026-10-24T17:00:00Z",
    };
    state.directory = [woven];
    const response = await propose({ role: "district_manager", typedName: true });
    const proposal = response?.formProposal;
    expect(proposal?.employeeName).toBe("Sarah Test");
    expect(proposal?.employeeName).not.toBe("Jane Doe");
    expect(proposal?.status).toBe("ready");
    expect(proposal?.status).not.toBe("needs_employee");
    expect(proposal?.supportsInlineDraft).toBe(true);
    expect(response?.content).toContain(GLOBAL_STORE_ASK_TAG);
    expect(response?.content ?? "").not.toMatch(/Did you mean/i);
    expect(response?.content ?? "").not.toMatch(/not on the form/i);
    expect(authorizeLocation(GLOBAL, proposal?.locationId ?? null).kind).not.toBe("refused");

    const created = await createInstance({
      templateKey: proposal!.templateKey,
      variantKey: proposal!.variantKey ?? null,
      employeeName: proposal!.employeeName!,
      employeeRole: proposal!.employeeRole,
      locationId: proposal!.locationId,
      createdBy: "manager-1",
      createdByRole: "district_manager",
      source: "assistant",
      formDate: TODAY,
      proposalId: proposal!.proposalId,
    });
    expect(created.status).toBe("draft");
    expect(created.employeeName).toBe("Sarah Test");
    expect(created.locationId).toBeNull();

    const later = await propose({
      role: "district_manager",
      typedName: true,
      question: "she was talking about customers",
      history: historyFrom(ASK, response),
    });
    expect(later?.formProposal?.employeeName).toBe("Sarah Test");
    expect(later?.formProposal?.status).toBe("ready");
    expect(later?.formProposal?.supportsInlineDraft).toBe(true);
    expect(later?.content ?? "").not.toContain(GLOBAL_STORE_ASK_TAG);
  });

  it("does not ask again after the store is given", async () => {
    const opening = await propose({ role: "district_manager" });
    expect(opening?.content).toContain(GLOBAL_STORE_ASK_TAG);
    const named = await propose({
      role: "district_manager",
      question: "Kearney",
      history: historyFrom(ASK, opening),
    });
    expect(named?.formProposal?.locationId).toBe("loc-66");
    expect(named?.formProposal?.locationName).toBe("Kearney, NE");
    expect(named?.formProposal?.status).toBe("ready");
    expect(named?.formProposal?.supportsInlineDraft).toBe(true);
    expect(named?.content ?? "").not.toContain(GLOBAL_STORE_ASK_TAG);

    const later = await propose({
      role: "district_manager",
      question: "she was late again today",
      history: [
        ...historyFrom(ASK, opening),
        { id: "u2", role: "user", content: "Kearney", createdAt: "2026-10-24T18:01:00Z" },
        {
          id: "a2",
          role: "assistant",
          content: named?.content ?? "",
          createdAt: "2026-10-24T18:01:01Z",
          formProposal: named?.formProposal ?? undefined,
        },
      ] as ChatMessage[],
    });
    expect(later?.formProposal?.locationId).toBe("loc-66");
    expect(later?.content ?? "").not.toContain(GLOBAL_STORE_ASK_TAG);
  });

  it("still asks before using a typo when the flag is off", async () => {
    const response = await propose({
      role: "district_manager",
      ask: false,
      question: "Build me a coaching form for Sarah Test at Kearny",
    });
    expect(response?.content ?? "").toMatch(/is that the store\?/i);
    expect(response?.formProposal?.locationId ?? null).toBeNull();
  });
});
