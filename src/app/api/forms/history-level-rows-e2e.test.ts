import { rosterResultFor } from "@/test/roster-result";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { AccessScope } from "@/types";
/**
 * ============================================================================
 * THE PRIOR ACTIONS ROWS A MANAGER'S DATED HISTORY GIVES (HISTORY_LEVEL_ROWS_ENABLED, ported from Ask Sunny)
 * ============================================================================
 *
 * QA's follow-ups to both gates on Ask Sunny #970 and this app's #898 (14 Nov 2026): every dated earlier level is a
 * row, "her first verbal was 9/21" is one, an identical row is listed once, and a level dated on the incident's own day
 * is this form's level and not a row as well. The harness is `hr-feedback-oct21-e2e.test.ts`'s (real proposal flow).
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
  delete process.env.HISTORY_LEVEL_ROWS_ENABLED;
  await ensureTemplateLibrary("system");
});

afterEach(() => {
  delete process.env.LEVEL_ON_INCIDENT_DAY_ENABLED;
  delete process.env.HISTORY_LEVEL_PRIOR_ROW_ENABLED;
  delete process.env.HISTORY_LEVEL_ROWS_ENABLED;
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

/** #898's two flags, which these build on, and HISTORY_LEVEL_ROWS when `rows`. */
function flags(rows: boolean) {
  process.env.LEVEL_ON_INCIDENT_DAY_ENABLED = "true";
  process.env.HISTORY_LEVEL_PRIOR_ROW_ENABLED = "true";
  if (rows) process.env.HISTORY_LEVEL_ROWS_ENABLED = "true";
}

/** The rows the card reads back under Prior actions, in order. */
function priorRows(content: string | undefined): string[] {
  const line = /\*\*Prior actions:\*\* (.*?), as you said\./.exec(content ?? "")?.[1];
  return line ? line.split("; ") : [];
}

/*
 * QA's follow-ups to both gates on Ask Sunny #970 / this app's #898 (14 Nov 2026), in QA's wordings, the person
 * invented (HISTORY_LEVEL_ROWS_ENABLED, ported from Ask Sunny).
 */
describe("QA's follow-ups: the Prior actions rows a manager's dated history gives", () => {
  const CASES: [string, string, string[], string[], ("verbal" | null)?][] = [
    ["(1) every dated earlier level", "ca for pat rivera, verbal warning on 9/21, written warning on 10/15. late again today", [], ["Verbal warning — signed 09/21/2026", "Written warning — signed 10/15/2026"]],
    ["(2) \"first verbal was <date>\"", "ca for pat rivera, late again today. her first verbal was 9/21", [], ["Verbal warning — signed 09/21/2026"]],
    ["(3) an identical row once", "ca for pat rivera, late again today. she had a verbal on 9/21, verbal warning on 9/21", ["Verbal warning — signed 09/21/2026", "Verbal warning — signed 09/21/2026"], ["Verbal warning — signed 09/21/2026"]],
    ["(4) the incident day's level is this form's, not a row", "pat rivera was late on 11/12/26, verbal warning 11/12/26", ["Verbal warning — signed 11/12/2026"], [], "verbal"],
  ];
  for (const [name, said, before, after, level] of CASES) {
    it(`${name}, flag off: "${said}" (the bug)`, async () => {
      flags(false);
      const answer = await reply(said);
      expect(priorRows(answer?.content)).toEqual(before);
      expect(answer?.formProposal?.warningLevel ?? null).toBeNull();
    });
    it(`${name}: "${said}"`, async () => {
      flags(true);
      const answer = await reply(said);
      expect(priorRows(answer?.content)).toEqual(after);
      expect(answer?.formProposal?.warningLevel ?? null).toBe(level ?? null);
    });
  }
});
