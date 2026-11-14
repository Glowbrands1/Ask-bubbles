import { rosterResultFor } from "@/test/roster-result";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { AccessScope } from "@/types";
/**
 * ============================================================================
 * A LEVEL LEADING INTO "FOR <NAME>" IS THE REQUEST (LEVEL_LEADS_REQUEST_ENABLED, ported from Ask Sunny)
 * ============================================================================
 *
 * Gate-Sunny-3's probe, via QA (14 Nov 2026), the wording as given (name invented):
 *   "second verbal for <A>, she was late on 11/12/26"
 * got no card at all: no form word ("CA", "warning") and no issuing verb, so it was not read as a request. QA also
 * asked for "another verbal for …" and "2nd written for …". On: each is a Corrective Action request, and the level it
 * opens with is the card's level ("second", "another", "2nd" count the steps). The word after "for" must be able to
 * be a name. The harness is `hr-feedback-oct21-e2e.test.ts`'s (real proposal flow).
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
  vi.setSystemTime(new Date("2026-11-14T03:30:00Z"));
  delete process.env.LEVEL_LEADS_REQUEST_ENABLED;
  await ensureTemplateLibrary("system");
});

afterEach(() => {
  delete process.env.LEVEL_LEADS_REQUEST_ENABLED;
});

/** The card the form intake gives one manager turn, or null when the turn is not read as a form request at all. */
async function card(said: string) {
  const response = await proposeFormForTurn({
    history: [],
    question: said,
    questionMessageId: "m1",
    actor: { role: state.role as never, scope: state.scope as AccessScope },
    summaries: await listTemplateSummaries(),
    today: "2026-11-14",
  });
  return response?.formProposal ?? null;
}
const ASKED: [string, "verbal" | "written"][] = [
  ["second verbal for pat rivera, she was late on 11/12/26", "verbal"],
  ["another verbal for pat rivera, she was late on 11/12/26", "verbal"],
  ["2nd written for pat rivera, she was late on 11/12/26", "written"],
];

describe('"second verbal for <A>, she was late on 11/12/26" (Gate-Sunny-3 via QA, 14 Nov 2026)', () => {
  it("flag off: no card, as before (the bug)", async () => {
    expect(await card(ASKED[0]![0])).toBeNull();
  });

  for (const [said, level] of ASKED) {
    it(`flag on: "${said}" is a Corrective Action card for Pat Rivera, ${level}`, async () => {
      process.env.LEVEL_LEADS_REQUEST_ENABLED = "true";
      const proposal = await card(said);
      expect(proposal).toMatchObject({ templateKey: "dpoa", employeeName: "Pat Rivera", warningLevel: level, formDate: "2026-11-12" });
    });
  }

  it("flag on: a level leading into a topic, not a person, is still no request", async () => {
    process.env.LEVEL_LEADS_REQUEST_ENABLED = "true";
    expect(await card("verbal for the late opening")).toBeNull();
  });

  it("flag on: an earlier level in the middle of an account is history, not this form's level", async () => {
    process.env.LEVEL_LEADS_REQUEST_ENABLED = "true";
    const proposal = await card("create a ca for pat rivera, she had a verbal for being late last month and was late again on 11/12/26");
    expect(proposal?.templateKey).toBe("dpoa");
    expect(proposal?.warningLevel ?? null).toBeNull();
  });

  // Bubbles' warning-level suite caught this on the first draft: a level dated or "for that" is history, never this form's.
  for (const said of ["verbal warning on 9/21. late again for 30 mins today", "written warning for the same thing, now late today", "verbal for that, late again today"]) {
    it(`flag on: "${said}" states no level for this form`, async () => {
      process.env.LEVEL_LEADS_REQUEST_ENABLED = "true";
      expect((await card(said))?.warningLevel ?? null).toBeNull();
    });
  }
});
