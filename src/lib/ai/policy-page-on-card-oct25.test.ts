import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { correctiveActionDocument } from "@/lib/forms/library";
import type { AccessScope, ChatMessage } from "@/types";

/**
 * ============================================================================
 * THE PRINTED PAGE ON THE FORM CARD — QA, 25 OCT 2026
 * ============================================================================
 *
 * QA (items S4, S7, S22, S24, B1, B5, B7, H13): Corrective Action and Coaching
 * cards said "Policy: Standards of Conduct" with no page (it is p.12), and the
 * same for Late Opening (p.15) and the cell phone policy (p.19). These are
 * the managers' turns word for word from this app's QA chats of 25 Oct 2026
 * (synthetic names), through `answerQuestion` on this app's live form path,
 * the full remap (FORM_FULL_REMAP_ENABLED), with the production JBA Policy
 * Manual rows (src/test/fixtures/jba-manual-production-151.json).
 *
 * POLICY_PAGE_ON_CARD_ENABLED puts the printed page from the manual's chunk
 * metadata beside the policy the card names: "**Policy:** Standards of
 * Conduct (JBA Policy Manual p.12), as you said". Each case also runs with the
 * flag off, and the flag-on card is the flag-off card with only the page
 * added. REMAP_INCIDENT_FIX_ENABLED already cites the manual section with its
 * page on most cards; those cards are checked to stay exactly the same.
 */

const TODAY = "2026-10-25";
const SCOPE: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const FLAG = "POLICY_PAGE_ON_CARD_ENABLED";
const ALL = ["FORM_FULL_REMAP_ENABLED", "REMAP_INCIDENT_FIX_ENABLED", "LATE_OPEN_DATE_ENABLED", FLAG] as const;

const model = vi.hoisted(() => ({
  raw: {} as Record<string, unknown>,
  prompts: [] as { system: string; user: string }[],
}));

const LIBRARY = [
  {
    id: "tpl-dpoa",
    key: "dpoa",
    name: "Corrective Action Form",
    shortName: "CA",
    description: "A corrective action.",
    category: "hr_performance",
    layoutFamily: "corrective",
    requiredPermission: "create_corrective_action",
    active: true,
    displayOrder: 2,
    currentVersion: { id: "v-dpoa", status: "published", document: correctiveActionDocument(), variants: [] },
    draftVersion: null,
    versionCount: 1,
    activeAsset: null,
    assetCount: 0,
  },
];

vi.mock("@/lib/config/server-env", () => ({
  liveReadiness: () => ({ mode: "live", missing: [], problems: [], ready: true }),
  MissingConfigurationError: class MissingConfigurationError extends Error {
    missing: string[] = [];
  },
}));

vi.mock("@/lib/forms/repository", () => ({ listTemplateSummaries: async () => LIBRARY }));

vi.mock("@/lib/forms/employee-roster", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/forms/employee-roster")>()),
  loadScopedRoster: async () => [],
}));

vi.mock("@/lib/knowledge/providers/supabase", async () => {
  const { manualChunkFromRow } = await import("@/lib/knowledge/full-manual-load");
  const rows = (await import("@/test/fixtures/jba-manual-production-151.json")).default;
  return {
    SupabaseKnowledgeProvider: class {
      async match() {
        return [];
      }
      async fetchRoleGrounding() {
        return { ok: false, failure: { code: "missing", detail: "not used", missingGroups: [] } };
      }
      async fetchNamedHandbook() {
        return { ok: false, reason: "not used" };
      }
      async fetchOfficialPolicyManual() {
        return {
          ok: true as const,
          documentId: "doc-jba",
          documentTitle: "2025 JBA Policy Manual - Edited 5-2025",
          documentCategory: "policies_compliance",
          matchedBy: "fallback" as const,
          ownerConfirmed: true,
          chunks: (rows.chunks as Parameters<typeof manualChunkFromRow>[0][]).map(manualChunkFromRow),
        };
      }
    },
  };
});

vi.mock("./call-claude", () => ({
  callClaude: async () => "An answer.",
  callClaudeTool: async () => null,
  callClaudeToolDetailed: async (input: { system: string; messages: { content: string }[] }) => {
    model.prompts.push({ system: input.system, user: input.messages.map((message) => message.content).join("\n") });
    return { input: model.raw, inputTokens: 10, outputTokens: 10 };
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({ insert: async () => ({ error: null }) }),
  }),
}));

let answerQuestion: typeof import("./server-ask").answerQuestion;

beforeAll(async () => {
  ({ answerQuestion } = await import("./server-ask"));
  // The first import loads the whole answer path; a busy machine takes longer than the 10 s default.
}, 120_000);

const saved = new Map<string, string | undefined>();
beforeEach(() => {
  for (const name of ALL) saved.set(name, process.env[name]);
  model.raw = {};
  model.prompts.length = 0;
});
afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

/** One chat with exactly these flags on; every other flag of this file off. */
async function chat(flags: readonly string[], say: string, templateKey = "dpoa"): Promise<{ content: string }> {
  for (const name of ALL) {
    if (flags.includes(name)) process.env[name] = "true";
    else delete process.env[name];
  }
  model.raw = { templateKey, employeeName: /Testy Testerson/.test(say) ? "Testy Testerson" : "Test Employee", observation: null, actionPlan: null };
  const history: ChatMessage[] = [];
  return answerQuestion(
    {
      question: say,
      mode: "standard",
      history,
      scopeId: "bcs-core",
      questionMessageId: "msg-0",
      context: { userName: "Pat Manager", locationName: "All stores", todayIso: TODAY },
    } as never,
    { role: "admin", scope: SCOPE, subject: undefined, verified: true } as never,
  );
}

/** The card with the flag unset, with the flag set "off", and with it on. */
async function threeWays(profile: readonly string[], say: string, templateKey = "dpoa") {
  const unset = await chat(profile, say, templateKey);
  process.env[FLAG] = "off";
  const off = await chat([...profile], say, templateKey);
  const on = await chat([...profile, FLAG], say, templateKey);
  return { unset: unset.content, off: off.content, on: on.content };
}

const REMAP = ["FORM_FULL_REMAP_ENABLED"] as const;
const REMAP_LATE = ["FORM_FULL_REMAP_ENABLED", "LATE_OPEN_DATE_ENABLED"] as const;
const REMAP_FIX = ["FORM_FULL_REMAP_ENABLED", "REMAP_INCIDENT_FIX_ENABLED", "LATE_OPEN_DATE_ENABLED"] as const;

const STANDARDS =
  "create corrective action for Test Employee for violating standards of conduct policy on 10-20-26. Test failed to acknowledge policies in woven by the 10-15-26 deadline.";
const LATE_OPENING =
  "create verbal ca for Test Employee for opening store late on 10-1-26. previous coaching is jba policy manual 1-1-26. payroll deduct DOES apply and state $25 will be payroll deducted";
const DRESS_CODE = "create a verbal corrective action for Test Employee, team member at dodge for violating dress code on 10-20-26";
const DRESS_CODE_COACHING = "create a coaching citing dress code violation on 10-15-26. Team Members name is Testy Testerson";
const CELL_PHONE = "create a verbal corrective action form for Test Employee. on 10-20-26 Test was talking on her cell phone for over 30 minutes";

describe("QA 25 Oct 2026: the policy on the card carries its printed page (POLICY_PAGE_ON_CARD_ENABLED)", () => {
  it("a Standards of Conduct CA: p.12 beside the policy the manager named, nothing else changes", async () => {
    const card = await threeWays(REMAP, STANDARDS);
    expect(card.off).toContain("**Policy:** Standards of Conduct, as you said");
    expect(card.on).toContain("**Policy:** Standards of Conduct (JBA Policy Manual p.12), as you said");
    expect(card.on).not.toMatch(/p\.13\b/);
    expect(card.on.replace(" (JBA Policy Manual p.12)", "")).toBe(card.off);
    expect(card.off).toBe(card.unset);
  });

  it("a late opening: p.15 beside Late Opening, nothing else changes", async () => {
    const card = await threeWays(REMAP_LATE, LATE_OPENING);
    expect(card.off).toContain("**Policy:** Late Opening, as you said");
    expect(card.on).toContain("**Policy:** Late Opening (JBA Policy Manual p.15), as you said");
    expect(card.on).not.toMatch(/p\.16\b/);
    expect(card.on.replace(" (JBA Policy Manual p.15)", "")).toBe(card.off);
    expect(card.off).toBe(card.unset);
  });

  it("a Dress Code CA: p.15, the page of the manual section the app cites for the box (QA follow-up)", async () => {
    const card = await threeWays(REMAP, DRESS_CODE);
    expect(card.off).toContain("**Policy:** Dress Code, as you said");
    expect(card.on).toContain("**Policy:** Dress Code (JBA Policy Manual p.15), as you said");
    expect(card.on).not.toMatch(/p\.16\b/);
    expect(card.on.replace(" (JBA Policy Manual p.15)", "")).toBe(card.off);
    expect(card.off).toBe(card.unset);
  });

  it("a Dress Code Coaching Form: the same p.15", async () => {
    const card = await threeWays(REMAP, DRESS_CODE_COACHING, "coaching");
    expect(card.off).toContain("**Policy:** Dress Code, as you said");
    expect(card.on).toContain("**Policy:** Dress Code (JBA Policy Manual p.15), as you said");
    expect(card.on.replace(" (JBA Policy Manual p.15)", "")).toBe(card.off);
    expect(card.off).toBe(card.unset);
  });

  it("a cell phone CA: the remap names no policy for it, so the flag adds none", async () => {
    // Not a page problem: with REMAP_INCIDENT_FIX_ENABLED off the remap names a policy only when the manager does
    // (Standards of Conduct, Attendance, Dress Code, …) or for a late opening. The flag adds a page, never a policy.
    const card = await threeWays(REMAP, CELL_PHONE);
    expect(card.off).not.toContain("**Policy:**");
    expect(card.on).toBe(card.off);
    expect(card.off).toBe(card.unset);
  });

  it("the proposal flow (the remap off or not filling the turn): the same line gets the same page", async () => {
    const card = await threeWays([], STANDARDS);
    expect(card.off).toContain("**Policy:** Standards of Conduct, as you said.");
    expect(card.on).toContain("**Policy:** Standards of Conduct (JBA Policy Manual p.12), as you said.");
    expect(card.on.replace(" (JBA Policy Manual p.12)", "")).toBe(card.off);
    expect(card.off).toBe(card.unset);
  });

  it.each([
    ["a Standards of Conduct CA", STANDARDS, "Standards of Conduct Policy, JBA Policy Manual p.12"],
    ["a late opening", LATE_OPENING, "Late Opening Policy, JBA Policy Manual p.15"],
    ["a cell phone CA", CELL_PHONE, "Cell Phone/Smart Watch Policy, JBA Policy Manual p.19"],
  ])("with REMAP_INCIDENT_FIX_ENABLED, %s already cites the page; the flag changes nothing", async (_name, say, cited) => {
    const card = await threeWays(REMAP_FIX, say);
    expect(card.off).toContain(cited);
    expect(card.on).toBe(card.off);
    expect(card.on.match(/JBA Policy Manual p\.\d+/g)).toHaveLength(1);
    expect(card.off).toBe(card.unset);
  });
});
