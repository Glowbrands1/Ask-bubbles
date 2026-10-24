import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import manual151 from "@/test/fixtures/jba-manual-production-151.json";
import { correctiveActionDocument } from "@/lib/forms/library";
import type { AccessScope, ChatMessage } from "@/types";

/**
 * Prod, 24 Oct 2026 (main 102a7f4, FORM_FULL_REMAP on): the remap path built
 * What happened from what was left of the request, lost "previous coaching"
 * and cited no policy. Each case is the manager's turn word for word
 * (conv_mvmz9j622931cj5, conv_mvmz9j6r2uljmug, conv_mvmzaecp2d44t0e,
 * conv_mvmz9ity24bml81, conv_mvmz9j6n2jyzl4o, conv_mvmzj1ok29ilgvt,
 * conv_mvmzjaar2tas38r, conv_mvmzje0z25pbngu, conv_mvmzje9r214nua6,
 * conv_mvmzjg7827rv598), through `answerQuestion` with
 * FORM_FULL_REMAP_ENABLED and REMAP_INCIDENT_FIX_ENABLED on. The extraction
 * model is a stand-in; the manual is the production JBA Policy Manual rows.
 * The people are synthetic.
 *
 * The date fix ("10-1" read out of "10-15-26") is a bug fix in the path that
 * is already on, so it is checked with REMAP_INCIDENT_FIX_ENABLED off too.
 */

const TODAY = "2026-10-24";
const SCOPE: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const FLAGS = ["FORM_FULL_REMAP_ENABLED", "REMAP_INCIDENT_FIX_ENABLED"] as const;

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
let groundFormSlots: typeof import("./form-full-remap").groundFormSlots;

beforeAll(async () => {
  ({ answerQuestion } = await import("./server-ask"));
  ({ groundFormSlots } = await import("./form-full-remap"));
});

beforeEach(() => {
  for (const flag of FLAGS) process.env[flag] = "true";
  model.raw = {};
  model.prompts.length = 0;
});

afterEach(() => {
  for (const flag of FLAGS) delete process.env[flag];
});

function raw(over: Record<string, unknown> = {}) {
  return { templateKey: "dpoa", employeeName: null, observation: null, actionPlan: null, ...over };
}

/** One chat: each manager turn, with the reply before it in the history. */
async function chat(turns: readonly { say: string; raw?: Record<string, unknown> }[]) {
  const history: ChatMessage[] = [];
  let last: Awaited<ReturnType<typeof answerQuestion>> | null = null;
  for (const [index, turn] of turns.entries()) {
    model.raw = raw(turn.raw);
    last = await answerQuestion(
      {
        question: turn.say,
        mode: "standard",
        history,
        scopeId: "bcs-core",
        questionMessageId: `msg-${index}`,
        continueProposalTemplateKey: last?.formProposal?.templateKey,
        context: { userName: "Pat Manager", locationName: "All stores", todayIso: TODAY },
      } as never,
      { role: "admin", scope: SCOPE, subject: undefined, verified: true } as never,
    );
    history.push(
      { id: `u-${index}`, role: "user", content: turn.say, createdAt: TODAY } as ChatMessage,
      { id: `a-${index}`, role: "assistant", content: last.content, createdAt: TODAY } as ChatMessage,
    );
  }
  return last!;
}

function citesPage(response: { content: string; citations: { locator: string; excerpt: string }[] }, heading: string, page: number) {
  expect(response.citations.some((item) => item.locator === `Page ${page}` && item.excerpt.startsWith(heading))).toBe(true);
  expect(response.content).toContain(`${heading} Policy, JBA Policy Manual p.${page}`);
}

describe("remap path: What happened is the incident, not the request (prod, 24 Oct 2026)", () => {
  it("conv_mvmz9j622931cj5: a bare request leaves What happened empty and asks; Yes does not echo it as the plan", async () => {
    const first = await chat([{ say: "create a corrective action form for Test Employee", raw: { employeeName: "Test Employee" } }]);
    expect(first.formProposal?.issue ?? null).toBeNull();
    expect(first.content).toContain("What happened?");
    expect(first.content).not.toMatch(/What happened:\*\*\s*create/i);

    const yes = await chat([
      { say: "create a corrective action form for Test Employee", raw: { employeeName: "Test Employee" } },
      // The model copied the request back as the plan on the bare "Yes" (prod trace).
      { say: "Yes", raw: { employeeName: "Test Employee", actionPlan: "create a corrective action form for" } },
    ]);
    expect(yes.formProposal?.issue ?? null).toBeNull();
    expect(yes.content).not.toMatch(/Action plan:\*\*\s*create a corrective action form for/i);
    expect(yes.content).not.toMatch(/What happened:\*\*/);
  });

  it("conv_mvmz9j6r2uljmug: previous coaching is the prior actions, and an inferred policy is not 'as you said'", async () => {
    const response = await chat([
      {
        say: "create a written CA for Test Employee for not attending the monthly meeting on 10-20-26. previous coaching: jba policy manual 1-1-26, verbal ca 9-1-26",
        raw: { employeeName: "Test Employee" },
      },
    ]);
    expect(response.formProposal?.issue).toBe("not attending the monthly meeting");
    expect(response.formProposal?.priorActions).toBe("JBA Policy Manual acknowledgement 1-1-26\nverbal CA 9-1-26");
    expect(response.formProposal?.formDate).toBe("2026-10-20");
    expect(response.content).not.toMatch(/Attendance, as you said/);
    expect(response.content).toContain("**Prior actions:** JBA Policy Manual acknowledgement 1-1-26; verbal CA 9-1-26");
  });

  it("conv_mvmzaecp2d44t0e / conv_mvmzj1ok29ilgvt: the woven deadline keeps its whole date and cites Standards of Conduct p.12", async () => {
    const response = await chat([
      { say: "create a verbal CA for Test Employee for missing the 10-15-26 woven deadline", raw: { employeeName: "Test Employee" } },
    ]);
    expect(response.formProposal?.issue).toBe("missing the 10-15-26 woven deadline");
    citesPage(response, "Standards of Conduct", 12);
    expect(response.content).not.toMatch(/Standards of Conduct[^\n]*as you said/);
  });

  it("conv_mvmzjaar2tas38r: the policy acknowledgement account cites Standards of Conduct p.12, as the manager said", async () => {
    const response = await chat([
      {
        say: "create corrective action for Test Employee for violating standards of conduct policy on 10-20-26. Test failed to acknowledge policies in woven by the 10-15-26 deadline.",
        raw: { employeeName: "Test Employee" },
      },
    ]);
    expect(response.formProposal?.issue).toBe("failed to acknowledge policies in woven by the 10-15-26 deadline");
    citesPage(response, "Standards of Conduct", 12);
  });

  it("conv_mvmzje9r214nua6: late for shift is the incident, Attendance p.14 is cited, previous coaching is listed", async () => {
    const response = await chat([
      {
        say: "write a verbal CA for Team Member, Test Employee at Dodge, NE. On 10-20-26 Test was late for shift and did not call supervisor as outlined in attendance policy. payroll deduct is not applicable. previous coaching is JBA Manual 1-1-25",
        raw: { employeeName: "Test Employee" },
      },
    ]);
    expect(response.formProposal?.issue).toBe("late for shift and did not call supervisor as outlined in attendance policy");
    expect(response.formProposal?.issue).not.toMatch(/write a|Team Member/i);
    expect(response.formProposal?.priorActions).toBe("JBA Policy Manual acknowledgement 1-1-25");
    citesPage(response, "Attendance", 14);
  });

  it("conv_mvmzjg7827rv598: cleaning duties keep their words and cite Care and Cleaning p.21", async () => {
    const response = await chat([
      {
        say: "create a CA for Test Employee for cleaning duties not being completed on 10-20-26",
        raw: { employeeName: "Test Employee", policySection: "Care and Cleaning of Equipment and Facilities" },
      },
    ]);
    expect(response.formProposal?.issue).toBe("cleaning duties not being completed");
    citesPage(response, "Care and Cleaning of Equipment and Facilities", 21);
    // The extraction chose the heading from the manual's own list.
    expect(model.prompts.at(-1)?.user).toContain("- Care and Cleaning of Equipment and Facilities");
  });

  it("conv_mvmzje0z25pbngu: opening the store late is what happened, Late Opening p.15, and the manual acknowledgement is a prior action", async () => {
    const response = await chat([
      {
        say: "create verbal ca for Test Employee for opening store late on 10-1-26. previous coaching is jba policy manual 1-1-26. payroll deduct DOES apply and state $25 will be payroll deducted",
        raw: { employeeName: "Test Employee" },
      },
    ]);
    expect(response.formProposal?.issue).toBe("opening store late");
    expect(response.content).not.toMatch(/\nWhat happened\?/);
    expect(response.formProposal?.priorActions).toBe("JBA Policy Manual acknowledgement 1-1-26");
    citesPage(response, "Late Opening", 15);
  });

  it("conv_mvmz9ity24bml81: the store line is not what happened, Empire is not invented, and the turn-1 policy is cited", async () => {
    const response = await chat([
      { say: "cite animals in the workplace policy", raw: { templateKey: null } },
      { say: "store location is empire, sd. create corrective action" },
    ]);
    expect(response.formProposal?.issue ?? null).toBeNull();
    expect(response.formProposal?.locationId ?? null).toBeNull();
    expect(response.formProposal?.locationName ?? "").not.toMatch(/empire/i);
    expect(response.formProposal?.employeeRole ?? null).toBeNull();
    citesPage(response, "Animals in the Workplace", 30);
  });

  it("conv_mvmz9j6n2jyzl4o: 'out of dress code' keeps 'out of', and the prior action is in the reply on every later turn", async () => {
    const turns = [
      { say: "CA for Test Employee at Kearney, out of dress code 10/11", raw: { employeeName: "Test Employee" } },
      { say: "verbal, prior = manual ack 9/01, no payroll", raw: { employeeName: "Test Employee" } },
      { say: "Use Kearney as the location", raw: { employeeName: "Test Employee" } },
    ];
    const second = await chat(turns.slice(0, 2));
    expect(second.formProposal?.issue).toBe("out of dress code");
    expect(second.formProposal?.priorActions).toBe("manual acknowledgement 9/01");
    expect(second.content.match(/manual acknowledgement 9\/01/g)?.length).toBe(1);
    const third = await chat(turns);
    expect(third.formProposal?.issue).toBe("out of dress code");
    expect(third.formProposal?.priorActions).toBe("manual acknowledgement 9/01");
    expect(third.content.match(/manual acknowledgement 9\/01/g)?.length).toBe(1);
  });

  it("previous coaching is jba policy manual 1-1-26 fills the prior actions on its own", async () => {
    const response = await chat([
      {
        say: "create verbal ca for Test Employee for opening store late on 10-1-26. previous coaching is jba policy manual 1-1-26",
        raw: { employeeName: "Test Employee" },
      },
    ]);
    expect(response.formProposal?.priorActions).toBe("JBA Policy Manual acknowledgement 1-1-26");
  });
});

describe("date bug fix in the remap path that is already on (REMAP_INCIDENT_FIX_ENABLED off)", () => {
  it("never reads '10-1' out of '10-15-26' or '10-2' out of '10-20-26'", () => {
    delete process.env.REMAP_INCIDENT_FIX_ENABLED;
    const woven = groundFormSlots({
      raw: raw({ employeeName: "Test Employee" }),
      history: [],
      question: "create a verbal CA for Test Employee for missing the 10-15-26 woven deadline",
      today: TODAY,
      people: [],
    });
    expect(woven.slots.observation ?? "").not.toMatch(/5-26/);
    const cleaning = groundFormSlots({
      raw: raw({ employeeName: "Test Employee" }),
      history: [],
      question: "create a CA for Test Employee for cleaning duties not being completed on 10-20-26",
      today: TODAY,
      people: [],
    });
    expect(cleaning.slots.observation ?? "").not.toMatch(/0-26/);
    const prior = groundFormSlots({
      raw: raw({ employeeName: "Test Employee" }),
      history: [],
      question:
        "create a written CA for Test Employee for not attending the monthly meeting on 10-20-26. previous coaching: jba policy manual 1-1-26, verbal ca 9-1-26",
      today: TODAY,
      people: [],
    });
    expect(prior.slots.observation).not.toBe("9-1-26");
  });

  it("keeps the remap path as it was with the fix flag off", () => {
    delete process.env.REMAP_INCIDENT_FIX_ENABLED;
    const { response } = groundFormSlots({
      raw: raw({ employeeName: "Test Employee" }),
      history: [],
      question: "CA for Test Employee at Kearney, out of dress code 10/11",
      today: TODAY,
      people: [],
    });
    expect(response.formProposal?.issue).toBe("dress code");
    expect(response.citations).toEqual([]);
  });
});

// The fixture is the production manual; this guards that the test still reads it.
it("reads the production manual rows", () => {
  expect((manual151.chunks as unknown[]).length).toBeGreaterThan(100);
});
