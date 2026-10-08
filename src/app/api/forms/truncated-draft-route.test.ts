import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseFormDocument } from "@/lib/forms/document";
import { TEMPLATE_SEEDS } from "@/lib/forms/library";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * A DRAFT CUT OFF AT THE TOKEN BUDGET IS NEVER STORED (improvement D)
 * ============================================================================
 *
 * The exit form's route harness, with the model returning `stop_reason:
 * "max_tokens"`. A cut-off tool call parses into whatever was finished, so a
 * Details paragraph ending mid-sentence would otherwise be stored and printed.
 *
 * (Harness below copied from the exit-form route test.)
 *
 * ============================================================================
 * DRAFTING THE RESIGNATION/EXIT FORM, EXERCISED THROUGH THE ROUTE
 * ============================================================================
 *
 * The model, the store and every provider are mocked, and the assertions are on
 * WHAT THE MODEL WAS SHOWN and WHAT THE PERSISTENCE CALL RECEIVED — the same
 * approach as `pm-draft-route.test.ts`. The questions:
 *
 *   - are the dates and Resignation Details ticks computed from the manager's
 *     notes, whatever the model returned for them?
 *   - can the model reach the yes/no questions, the involuntary box, or a
 *     signature? (It must not.)
 *   - does Details lose a sentence that answers a question nobody answered?
 *   - are HR's Details lines (resignation date, how and why, and the yes/no
 *     answers) filled from the MANAGER'S words through `applyStatedFacts`,
 *     and never through the model?
 */

const state = vi.hoisted(() => ({
  modelInput: null as Record<string, unknown> | null,
  modelCalls: 0,
  budgets: [] as number[],
  stops: [] as string[],
  toolInput: {} as Record<string, unknown>,
  persisted: [] as { values: Record<string, string>; checked: Record<string, string[]> }[],
  /** Header overrides for one test: the employee, title and salon on the record. */
  instance: {} as Record<string, unknown>,
  stated: [] as {
    values: Record<string, string>;
    checked: Record<string, string[]>;
    keys: ReadonlySet<string> | undefined;
  }[],
}));

vi.mock("@/lib/api/respond", () => ({
  assertLiveMode: () => {},
  assertNoConfigurationProblems: () => {},
  assertWithinRateLimit: () => {},
  errorResponse: (error: unknown) => {
    throw error;
  },
}));

vi.mock("@/lib/forms/instance-scope", () => ({
  InstanceNotVisibleError: class InstanceNotVisibleError extends Error {},
  authorizeInstance: async () => {
    const seed = TEMPLATE_SEEDS.find((entry) => entry.key === "resignation-exit")!;
    return {
      actor: { id: "demo:salon_director:QA", role: "location_manager", verified: false, scope: null },
      loaded: {
        instance: {
          id: "form-1",
          templateKey: seed.key,
          templateName: seed.name,
          layoutFamily: seed.layoutFamily,
          variantKey: null,
          employeeName: "Sarah Jones",
          employeeRole: "Tanning Consultant",
          locationName: null,
          formDate: "2026-09-28",
          status: "draft",
          ...state.instance,
        },
        version: { document: parseFormDocument(seed.document), variants: seed.variants },
      },
    };
  },
}));

vi.mock("@/lib/knowledge/providers/supabase", () => ({
  SupabaseKnowledgeProvider: class {
    async search() {
      throw new Error("the exit form retrieves no policy");
    }
    async fetchRoleGrounding() {
      throw new Error("the exit form is not governed by the performance-management framework");
    }
    async fetchOfficialPolicyManual() {
      throw new Error("the exit form cites no manual");
    }
  },
}));

vi.mock("@/lib/knowledge", () => ({
  /* Server code must search through SupabaseKnowledgeProvider; the browser client cannot run here. */
  getKnowledgeProvider: () => {
    throw new Error("getKnowledgeProvider() is the browser knowledge client and must not be used on the server");
  },
}));

vi.mock("@/lib/forms/instances", () => ({
  applyStatedFacts: async (
    _id: string,
    stated: { values: Record<string, string>; checked: Record<string, string[]> },
    _actor: string,
    keys?: ReadonlySet<string>,
  ) => {
    state.stated.push({ values: stated.values, checked: stated.checked, keys });
    return [...Object.keys(stated.values), ...Object.keys(stated.checked)];
  },
  applyAssistantDraft: async (
    _id: string,
    draft: { values: Record<string, string>; checked: Record<string, string[]> },
  ) => {
    state.persisted.push({ values: draft.values ?? {}, checked: draft.checked ?? {} });
    return {
      accepted: { values: draft.values ?? {}, checked: draft.checked ?? {} },
      rejected: [],
      policyRefused: [],
    };
  },
}));

vi.mock("@/lib/ai/anthropic", () => ({
  getAnthropicClient: () => ({
    messages: {
      create: async (input: Record<string, unknown>) => {
        state.modelCalls += 1;
        state.modelInput = input;
        state.budgets.push(Number(input.max_tokens));
        const stop = state.stops[Math.min(state.modelCalls - 1, state.stops.length - 1)] ?? "tool_use";
        const toolInput =
          stop === "max_tokens"
            ? { values: { details: "Sarah gave two weeks notice on 9/1 and worked thro" } }
            : state.toolInput;
        return { stop_reason: stop, content: [{ type: "tool_use", name: "write_form_fields", input: toolInput }] };
      },
    },
  }),
}));

async function post(notes: string) {
  const { POST } = await import("./instances/[id]/draft/route");
  const request = new Request("http://localhost/api/forms/instances/form-1/draft", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ notes }),
  });
  const response = await POST(request, { params: Promise.resolve({ id: "form-1" }) });
  return (await response.json()) as Record<string, unknown>;
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-28T15:00:00Z"));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  state.modelInput = null;
  state.modelCalls = 0;
  state.budgets = [];
  state.stops = [];
  state.toolInput = {};
  state.persisted = [];
  state.stated = [];
  state.instance = {};
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const NOTES =
  "Create an exit form for Sarah Jones. She gave her two weeks notice on 9/1, worked her full two weeks, and her last day was 9/15.";
const WHOLE = "Sarah gave two weeks notice on 9/1 and worked through her last day, 9/15.";

describe("a draft cut off at the budget", () => {
  it("is drafted again with more room, and only the complete draft is stored", async () => {
    state.stops = ["max_tokens", "tool_use"];
    state.toolInput = { values: { details: WHOLE } };
    await post(NOTES);

    expect(state.budgets).toEqual([4096, 8192]);
    expect(state.persisted).toHaveLength(1);
    // The retry's complete sentence (as the route's own guards word it), never the cut-off one.
    expect(state.persisted[0]!.values.details).toMatch(/worked through .* last day, 9\/15\.$/);
    expect(state.persisted[0]!.values.details).not.toMatch(/worked thro$/);
  });

  it("stores none of the drafted text when the retry is cut off too, and says so", async () => {
    state.stops = ["max_tokens", "max_tokens"];
    const error = await post(NOTES).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "truncated" });
    expect((error as Error).message).toMatch(/cut off before it finished, so none of it was written to the form/);
    expect(state.modelCalls).toBe(2);
    expect(state.persisted).toEqual([]);
  });

  it("is untouched when the model finishes: one call, at the configured budget", async () => {
    state.stops = ["tool_use"];
    state.toolInput = { values: { details: WHOLE } };
    await post(NOTES);

    expect(state.budgets).toEqual([4096]);
    expect(state.persisted).toHaveLength(1);
  });
});

