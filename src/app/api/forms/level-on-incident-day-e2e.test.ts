import { rosterResultFor } from "@/test/roster-result";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { AccessScope } from "@/types";
/**
 * ============================================================================
 * A DATED LEVEL IS WEIGHED AGAINST THE INCIDENT'S DAY, AND AN EARLIER ONE IS LISTED (LEVEL_ON_INCIDENT_DAY_ENABLED,
 * HISTORY_LEVEL_PRIOR_ROW_ENABLED, ported from Ask Sunny #970)
 * ============================================================================
 *
 * Gate-Sunny-3's findings on Ask Sunny #970, as QA ruled them (14 Nov 2026), in this app; the person invented.
 * F1: "verbal warning on 11/12/26 for <W>, she was late that day", filed the next day, is a Verbal. F2: "ca for <W>,
 * verbal warning on 9/21. late again for 30 mins today" lists the verbal under Prior actions with its date. The harness
 * is `hr-feedback-oct21-e2e.test.ts`'s (real proposal flow).
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

const state = vi.hoisted(() => ({
  role: "admin",
  scope: null as unknown,
  draft: {} as { values?: Record<string, unknown>; checked?: Record<string, unknown> },
  draftFails: false,
  directory: [] as unknown[],
  /** The official manual the knowledge provider returns, or null for "not in the knowledge base". */
  manual: null as null | { chunks: unknown[] },
}));

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: () => fakeSupabase(store) }));

vi.mock("@/lib/api/respond", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/respond")>();
  return {
    ...actual,
    assertLiveMode: () => {},
    assertNoConfigurationProblems: () => {},
    assertWithinRateLimit: () => {},
  };
});

vi.mock("@/lib/auth/server", async () => {
  const { AuthError } = await import("@/lib/auth/types");
  const { DEFAULT_PERMISSION_MATRIX, hasPermission } = await import("@/lib/permissions");
  return {
    authorizeRequest: async (_request: Request, permission: string) => {
      if (!hasPermission(DEFAULT_PERMISSION_MATRIX, state.role as never, permission as never)) {
        throw new AuthError("forbidden", "Your role does not have permission to do that.");
      }
      return {
        identity: {
          subject: "admin-1",
          email: "admin@example.com",
          displayName: "Admin",
          role: state.role,
          scope: state.scope,
          verified: true,
        },
        permission,
        provider: "supabase",
      };
    },
  };
});

vi.mock("@/lib/ai/anthropic", () => ({
  getAnthropicClient: () => ({
    messages: {
      create: async () => {
        if (state.draftFails) throw new Error("model unavailable");
        return {
          stop_reason: "tool_use",
          content: [{ type: "tool_use", name: "write_form_fields", input: state.draft }],
        };
      },
    },
  }),
}));

vi.mock("@/lib/knowledge/providers/supabase", () => ({
  SupabaseKnowledgeProvider: class {
    async search() {
      return [];
    }
    async fetchRoleGrounding(role: { id: string }) {
      return {
        ok: true,
        grounding: {
          role: { id: role.id },
          documentId: "doc-progression",
          documentTitle: "ASK BUBBLES PERFORMANCE MANAGEMENT FRAMEWORK KB TEXT",
          matchedBy: "tag",
          rows: [
            {
              chunk_id: "pmf-0",
              document_id: "doc-progression",
              document_title: "ASK BUBBLES PERFORMANCE MANAGEMENT FRAMEWORK KB TEXT",
              category: "leadership_coaching",
              locator: "SECTION 2",
              page: null,
              section: null,
              content: "Solve the issue at the lowest appropriate level.",
              similarity: 0,
            },
          ],
        },
      };
    }
    async fetchOfficialPolicyManual() {
      if (!state.manual) return { ok: false, reason: "The official policy manual is not in the knowledge base." };
      return {
        ok: true,
        documentId: "doc-manual",
        documentTitle: "2025 JBA Policy Manual - Edited 5-2025",
        documentCategory: "policies_compliance",
        matchedBy: "tag",
        chunks: state.manual.chunks,
      };
    }
  },
}));

process.env.NEXT_PUBLIC_DEMO_MODE = "false";

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

/* Synthetic people only. Positions are what Woven would carry. */
const DIRECTORY = [
  { id: "e-1", firstName: "Pat", lastName: "Rivera", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" },
];

beforeEach(async () => {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  state.role = "admin";
  state.scope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
  state.draft = { values: {}, checked: {} };
  state.draftFails = false;
  state.directory = DIRECTORY;
  state.manual = null;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-13T18:00:00Z"));
  delete process.env.LEVEL_ON_INCIDENT_DAY_ENABLED;
  delete process.env.HISTORY_LEVEL_PRIOR_ROW_ENABLED;
  await ensureTemplateLibrary("system");
});

afterEach(() => {
  delete process.env.LEVEL_ON_INCIDENT_DAY_ENABLED;
  delete process.env.HISTORY_LEVEL_PRIOR_ROW_ENABLED;
});

/** The reply the form intake gives one manager turn, filed on 13 Nov 2026. */
async function reply(said: string) {
  return proposeFormForTurn({
    history: [],
    question: said,
    questionMessageId: "m1",
    actor: { role: state.role as never, scope: state.scope as AccessScope },
    summaries: await listTemplateSummaries(),
    today: "2026-11-13",
  });
}

describe("Gate-Sunny-3's findings on Ask Sunny #970, in Ask Bubbles (QA's rulings, 14 Nov 2026)", () => {
  it('flag off: "verbal warning on 11/12/26 for pat rivera, she was late that day", filed the next day, has no level (the bug)', async () => {
    expect((await reply("verbal warning on 11/12/26 for pat rivera, she was late that day"))?.formProposal?.warningLevel ?? null).toBeNull();
  });

  it('F1, flag on: "verbal warning on 11/12/26 for pat rivera, she was late that day", filed the next day, is a Verbal', async () => {
    process.env.LEVEL_ON_INCIDENT_DAY_ENABLED = "true";
    expect((await reply("verbal warning on 11/12/26 for pat rivera, she was late that day"))?.formProposal?.warningLevel).toBe("verbal");
  });

  it('F2, flag off: "ca for pat rivera, verbal warning on 9/21. late again for 30 mins today" lists no Prior actions row (the bug)', async () => {
    const answer = await reply("ca for pat rivera, verbal warning on 9/21. late again for 30 mins today");
    expect(answer?.content).not.toMatch(/Verbal warning — (?:signed )?09\/21\/2026/);
  });

  it('F2 and F3, HISTORY_LEVEL_PRIOR_ROW on: "ca for pat rivera, verbal warning on 9/21. late again for 30 mins today" lists the verbal with its date, level left to the manager', async () => {
    process.env.HISTORY_LEVEL_PRIOR_ROW_ENABLED = "true";
    const answer = await reply("ca for pat rivera, verbal warning on 9/21. late again for 30 mins today");
    expect(answer?.formProposal?.warningLevel ?? null).toBeNull();
    expect(answer?.content).toMatch(/\*\*Prior actions:\*\* Verbal warning — (?:signed )?09\/21\/2026/);
    // Ask Bubbles' own words for F3: the earlier warning is history and the level is the manager's.
    expect(answer?.content).toContain("Is this new corrective action a **Verbal Warning** or a **Written Warning**?");
  });

  it('as "ca for pat rivera, she had a verbal on 10/30. late again for 30 mins today" already does', async () => {
    const answer = await reply("ca for pat rivera, she had a verbal on 10/30. late again for 30 mins today");
    expect(answer?.formProposal?.warningLevel ?? null).toBeNull();
    expect(answer?.content).toMatch(/Verbal warning — (?:signed )?10\/30\/2026/);
  });
});
