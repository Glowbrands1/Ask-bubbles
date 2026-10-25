import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import manual151 from "@/test/fixtures/jba-manual-production-151.json";
import { priorActionsParseEnabled } from "@/lib/config/chat-quality-flags";
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

/*
 * PRIOR ACTIONS, QA decision of 25 Oct 2026. A prior-action line holds no word
 * the manager did not say. This file runs with PRIOR_ACTIONS_PARSE_ENABLED off,
 * where the "previous coaching: …" list reader writes the line: "jba policy
 * manual 1-1-26" is "JBA Policy Manual 1-1-26" (it was "JBA Policy Manual
 * acknowledgement 1-1-26"; nobody typed "acknowledgement"). With
 * PRIOR_ACTIONS_PARSE_ENABLED also on, the parser's structured line wins:
 * "Coaching — JBA Policy Manual — 01/01/2026", with no "signed" unless the
 * manager wrote it. QA confirmed rule (a) on 25 Oct 2026: dropping the untyped
 * "acknowledgement" when only REMAP_INCIDENT_FIX_ENABLED is on is intended,
 * because a prior-action line uses only words the manager typed. `priorLine`
 * picks the expectation for the flags in force,
 * so the same cases pass on their own and in the both-flags-on probe.
 */
function priorLine(list: string, parsed: string): string {
  // The flag's own reader: "off", "0" and "" are off (the flags-off parity run sets them so).
  return priorActionsParseEnabled() ? parsed : list;
}

let answerQuestion: typeof import("./server-ask").answerQuestion;
let groundFormSlots: typeof import("./form-full-remap").groundFormSlots;

beforeAll(async () => {
  ({ answerQuestion } = await import("./server-ask"));
  ({ groundFormSlots } = await import("./form-full-remap"));
  // The first import loads the whole answer path; a busy machine takes longer than the 10 s default.
}, 120_000);

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
    // Changed on purpose (was "JBA Policy Manual acknowledgement …"): with REMAP_INCIDENT_FIX_ENABLED alone the list
    // reader no longer adds "acknowledgement", because a prior-action line uses only words the manager typed (rule (a),
    // QA, 25 Oct 2026). The parser's line when PRIOR_ACTIONS_PARSE_ENABLED is on (see priorLine).
    const prior = priorLine(
      "JBA Policy Manual 1-1-26\nverbal CA 9-1-26",
      "Coaching — JBA Policy Manual — 01/01/2026\nVerbal corrective action — 09/01/2026",
    );
    expect(response.formProposal?.priorActions).toBe(prior);
    expect(response.formProposal?.formDate).toBe("2026-10-20");
    expect(response.content).not.toMatch(/Attendance, as you said/);
    expect(response.content).toContain(`**Prior actions:** ${prior.split("\n").join("; ")}`);
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
    // Changed on purpose (was "JBA Policy Manual acknowledgement 1-1-25"): "JBA Manual" reads as the manual's title, and
    // "acknowledgement" is dropped because a prior-action line uses only words the manager typed (rule (a), QA,
    // 25 Oct 2026). See priorLine.
    expect(response.formProposal?.priorActions).toBe(priorLine("JBA Policy Manual 1-1-25", "Coaching — JBA Policy Manual — 01/01/2025"));
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
    // Changed on purpose (was "JBA Policy Manual acknowledgement …"): with REMAP_INCIDENT_FIX_ENABLED alone the list
    // reader no longer adds "acknowledgement", because a prior-action line uses only words the manager typed (rule (a),
    // QA, 25 Oct 2026). The parser's line when PRIOR_ACTIONS_PARSE_ENABLED is on (see priorLine).
    expect(response.formProposal?.priorActions).toBe(priorLine("JBA Policy Manual 1-1-26", "Coaching — JBA Policy Manual — 01/01/2026"));
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
    // Changed on purpose (was "JBA Policy Manual acknowledgement …"): with REMAP_INCIDENT_FIX_ENABLED alone the list
    // reader no longer adds "acknowledgement", because a prior-action line uses only words the manager typed (rule (a),
    // QA, 25 Oct 2026). The parser's line when PRIOR_ACTIONS_PARSE_ENABLED is on (see priorLine).
    expect(response.formProposal?.priorActions).toBe(priorLine("JBA Policy Manual 1-1-26", "Coaching — JBA Policy Manual — 01/01/2026"));
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

/**
 * QA's live step-3 run and C-list, 24–25 Oct 2026. Edits and commands change
 * their own field and never What happened; a new request with a new incident
 * starts a new form; a bare "Yes" after a list of questions answers none; the
 * action plan is the manager's or blank; "as you said" only for words a
 * manager turn holds. Real employee names in the LR chats are replaced with
 * "Test Employee".
 */
const EDIT_WORDS = /change the date|name is|cite |show draft|this is a violation|^it happened\b|^location$/i;

function asYouSaidLines(content: string): { label: string; value: string }[] {
  return [...content.matchAll(/\*\*([^*]+):\*\*\s*([^\n]+?), as you said/g)].map((match) => ({
    label: match[1]!,
    value: match[2]!,
  }));
}

describe("step 3 and C-list: edits never become What happened (prod, 24 Oct 2026)", () => {
  it("A3 conv_mvmzl3ot2tufozt: 'change the date to 10-22' changes the date only", async () => {
    const response = await chat([
      { say: "CA for Test Employee at Grand Island, late to open 10-19, verbal, no payroll", raw: { employeeName: "Test Employee" } },
      { say: "change the date to 10-22", raw: { employeeName: "Test Employee" } },
    ]);
    expect(response.formProposal?.formDate).toBe("2026-10-22");
    expect(response.formProposal?.issue).toBe("late to open");
  });

  it("conv_mvmzn7k62uoi4r9: name, cite and show-draft turns keep the incident; a restated violation replaces it", async () => {
    const turns = [
      {
        say: "create a verbal CA for team member Testy Testerson at Dodge, NE. location. On 10-16-26 Testy was not properly measuring and weighing product. payroll deduct is not applicable",
        raw: { employeeName: "Testy Testerson" },
      },
      { say: "employee name is Testy Testerson", raw: { employeeName: "Testy Testerson" } },
      { say: "cite standards of conduct as policy violated", raw: { employeeName: "Testy Testerson" } },
      { say: "show draft", raw: { employeeName: "Testy Testerson" } },
      { say: "violation is that on 10-16-26 Testy was not measuring and weighing product", raw: { employeeName: "Testy Testerson" } },
      { say: "show draft with edits", raw: { employeeName: "Testy Testerson" } },
    ];
    for (const count of [1, 2, 3, 4]) {
      const response = await chat(turns.slice(0, count));
      expect(response.formProposal?.issue, `turn ${count}`).toBe("not properly measuring and weighing product");
    }
    const cited = await chat(turns.slice(0, 3));
    citesPage(cited, "Standards of Conduct", 12);
    for (const count of [5, 6]) {
      const response = await chat(turns.slice(0, count));
      // The whole date "10-16-26" is lifted, never "6-26".
      expect(response.formProposal?.issue, `turn ${count}`).toBe("not measuring and weighing product");
      expect(response.formProposal?.issue ?? "").not.toMatch(EDIT_WORDS);
    }
  });

  it("conv_mvmzn0sn2pfk6uk / conv_mvl991xkbul93bi: 'name is' and the policy line keep the incident, and no plan is invented", async () => {
    const turns = [
      {
        say: "create a written corrective action for Team Member, Test Employee. Test was assigned to complete policy acknowledgements in woven by 10-15-26 and failed to meet the deadline. Previous coaching was a Verbal CA 10-1-26. Payroll deduct is not applicable.",
        raw: { employeeName: "Test Employee" },
      },
      // Prod showed "Action plan: Complete policy acknowledgements in woven" from here on.
      { say: "name is Test Employee", raw: { employeeName: "Test Employee", actionPlan: "Complete policy acknowledgements in woven" } },
      {
        say: "this is a violation under Standards of Conduct",
        raw: { employeeName: "Test Employee", actionPlan: "Complete policy acknowledgements in woven" },
      },
    ];
    for (const count of [1, 2, 3]) {
      const response = await chat(turns.slice(0, count));
      expect(response.formProposal?.issue, `turn ${count}`).toBe(
        "assigned to complete policy acknowledgements in woven by 10-15-26 and failed to meet the deadline",
      );
      expect(response.content, `turn ${count}`).not.toMatch(/Action plan:/);
      expect(response.formProposal?.issue ?? "", `turn ${count}`).not.toMatch(/create a for Team Member|^name is|this is a violation/i);
      // QA 25 Oct 2026: the parser's line wins when PRIOR_ACTIONS_PARSE_ENABLED is on, with no invented "signed" (see priorLine).
      expect(response.formProposal?.priorActions, `turn ${count}`).toBe(priorLine("Verbal CA 10-1-26", "Verbal corrective action — 10/01/2026"));
    }
    citesPage(await chat(turns), "Standards of Conduct", 12);
  });

  it("conv_mvmzmjxc2mkyriw: a new request with a new incident resets What happened and the policy", async () => {
    const turns = [
      {
        say: "create verbal CA for Test Testy for violating visitors at work policy on 10-10-26. Test Employee spent 40 minutes talking with friend and ignoring guests. previous coaching was jba policy manual 1-1-26",
        raw: { employeeName: "Test Testy", observation: "Spent 40 minutes talking with friend and ignoring guests" },
      },
      { say: "no payroll deduct", raw: { employeeName: "Test Testy" } },
      {
        say: "create a verbal corrective action form for Test Employee. on 10-20-26 Test was talking on her cell phone for over 30 minutes",
        // The model kept the old incident in prod.
        raw: { employeeName: "Test Employee", observation: "Spent 40 minutes talking with friend and ignoring guests" },
      },
      { say: "verbal", raw: { employeeName: "Test Employee", observation: "Spent 40 minutes talking with friend and ignoring guests" } },
    ];
    const first = await chat(turns.slice(0, 2));
    expect(first.formProposal?.issue).toMatch(/talking with friend/);
    for (const count of [3, 4]) {
      const response = await chat(turns.slice(0, count));
      expect(response.formProposal?.issue, `turn ${count}`).toBe("talking on her cell phone for over 30 minutes");
      expect(response.formProposal?.formDate).toBe("2026-10-20");
      expect(response.content).not.toMatch(/Visitors/i);
    }
  });

  it("A2 conv_mvmzl3vs2kxujv0: 'It happened on 10-21' is the date; the cell phone account is What happened", async () => {
    const response = await chat([
      { say: "I need to coach an employee", raw: { templateKey: null } },
      { say: "Her name is Test Employee", raw: { templateKey: null } },
      { say: "She works at Grand Island", raw: { templateKey: null } },
      { say: "It happened on 10-21", raw: { templateKey: null } },
      { say: "She was on her cell phone for 30+ minutes at the front desk", raw: { templateKey: null } },
      { say: "Create a Coaching Form", raw: { templateKey: "coaching", employeeName: "Test Employee" } },
    ]);
    expect(response.formProposal?.templateKey).toBe("coaching");
    expect(response.formProposal?.issue).toBe("on her cell phone for 30+ minutes at the front desk");
    expect(response.formProposal?.formDate).toBe("2026-10-21");
    expect(response.formProposal?.locationId).toBe("loc-236");
  });

  it("conv_mvmzje0z25pbngu vs conv_mvmzmzvt2atuccg: the same words give the same What happened whatever the model returns", async () => {
    const say =
      "create verbal ca for Test Employee for opening store late on 10-1-26. previous coaching is jba policy manual 1-1-26. payroll deduct DOES apply and state $25 will be payroll deducted";
    const withoutModel = await chat([{ say, raw: { employeeName: "Test Employee", observation: null } }]);
    const withModel = await chat([{ say, raw: { employeeName: "Test Employee", observation: "Opening store late on 10-1-26" } }]);
    expect(withoutModel.formProposal?.issue).toBe("opening store late");
    expect(withModel.formProposal?.issue).toBe("opening store late");
  });

  it("C-list (a) conv_mvmz9j622931cj5: a bare 'Yes' after several questions is not a payroll answer", async () => {
    const response = await chat([
      { say: "create a corrective action form for Test Employee", raw: { employeeName: "Test Employee" } },
      { say: "Yes", raw: { employeeName: "Test Employee", actionPlan: "create a corrective action form for" } },
    ]);
    expect(response.formProposal?.payrollDeduct ?? null).toBeNull();
    expect(response.content).not.toMatch(/Payroll deduct:\*\*\s*Yes/);
    expect(response.content).toContain("Is payroll deduct applicable?");
    expect(response.content).not.toMatch(/Action plan:/);
  });

  it("C-list (a): a bare 'Yes' to the one open payroll question is still Yes", async () => {
    const response = await chat([
      {
        say: "CA for Test Employee, team member, at Grand Island, late to open 10-19, verbal",
        raw: { employeeName: "Test Employee" },
      },
      { say: "Yes", raw: { employeeName: "Test Employee" } },
    ]);
    expect(response.formProposal?.payrollDeduct).toBe("yes");
  });

  it("C-list (b) conv_mvi98yvkfuehzye / conv_mvmzmhst2si3jfr: a new request drops the old policy, and previous coaching is never the plan", async () => {
    const response = await chat([
      {
        say: "create ca form for Test Employee for violating attendance policy on 10-20-26. verbal. no payroll deduct. jba manual 1-1-26 for previous coaching",
        raw: { employeeName: "Test Employee" },
      },
      { say: "verbal", raw: { employeeName: "Test Employee" } },
      {
        say: "create ca form for Test Employee for a register shortage on 10-20-26. payroll deduct applies and $3.25 will be deducted from check. previous coaching - jba policy manual 1-20-26.",
        raw: { employeeName: "Test Employee", actionPlan: "Previous coaching" },
      },
    ]);
    expect(response.formProposal?.issue).toBe("register shortage");
    expect(response.content).not.toMatch(/Attendance[^\n]*as you said/);
    expect(response.content).not.toMatch(/Action plan:/);
    // Changed on purpose (was "JBA Policy Manual acknowledgement …"): with REMAP_INCIDENT_FIX_ENABLED alone the list
    // reader no longer adds "acknowledgement", because a prior-action line uses only words the manager typed (rule (a),
    // QA, 25 Oct 2026). The parser's line when PRIOR_ACTIONS_PARSE_ENABLED is on (see priorLine).
    expect(response.formProposal?.priorActions ?? "").toContain(priorLine("JBA Policy Manual 1-20-26", "Coaching — JBA Policy Manual — 01/20/2026"));
  });

  it("C-list (c) conv_mvifedfn12ysyjzz / conv_mvmzmy4g2wp7dhf: every 'as you said' value is in the manager's words", async () => {
    const turns = [
      "create a written CA for Test Employee for not attending the monthly meeting on 10-20-26. previous coaching: jba policy manual 1-1-26, verbal ca 9-1-26. payroll deduct not applicable",
      "written",
    ];
    const response = await chat(turns.map((say) => ({ say, raw: { employeeName: "Test Employee" } })));
    const said = turns.join("\n");
    const lines = asYouSaidLines(response.content);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const evidence = /payroll/i.test(line.label) ? ["payroll"] : line.value.split(/[^A-Za-z]+/).filter((word) => word.length >= 3);
      expect(evidence.some((word) => new RegExp(`\\b${word}\\b`, "i").test(said)), `${line.label}: ${line.value}`).toBe(true);
    }
    expect(response.content).not.toMatch(/Attendance[^\n]*as you said/);
  });

  it("C-list (e) conv_mvmzlbhv2ww7y5v: 'at Grand Island' before the account is the store on the Policy Review", async () => {
    const response = await chat([
      { say: "Test Employee at Grand Island used her cell phone on the sales floor on 10-17", raw: { templateKey: null } },
      { say: "Create a Policy Review", raw: { templateKey: "policy-review", employeeName: "Test Employee" } },
    ]);
    expect(response.formProposal?.templateKey).toBe("policy-review");
    expect(response.formProposal?.locationId).toBe("loc-236");
    expect(response.formProposal?.issue).toBe("used her cell phone on the sales floor");
  });

  it("conv_mvmzlvq124nmks8: 'Create a Coaching Form from this conversation.' is never What happened", async () => {
    const turns = [
      {
        say: "I have an employee Test Employee at our Grand Island location who has been out of dress code three shifts. I verbally coached her on the second offense and she still is out of dress code",
        raw: { templateKey: null },
      },
      { say: "Create a Coaching Form from this conversation.", raw: { templateKey: "coaching", employeeName: "Test Employee" } },
      { say: "Yes", raw: { templateKey: "coaching", employeeName: "Test Employee" } },
    ];
    for (const count of [2, 3]) {
      const response = await chat(turns.slice(0, count));
      expect(response.formProposal?.issue ?? "", `turn ${count}`).not.toMatch(/Create a Coaching Form|this conversation/i);
      expect(response.formProposal?.issue ?? "", `turn ${count}`).toMatch(/out of dress code three shifts/);
    }
  });

  it("conv_mvmzlpox2z7u4c3: the account keeps both dates and the verbal coaching; the complaint is never What happened", async () => {
    const turns = [
      {
        say: "My employee Test Employee has was 10 minutes late on her last two shifts. On the first shift I verbally coached her on our policy and expectations. Then she was late again. Please create a CA form so I can document. She was late on 10/5 and 10/15",
        raw: { employeeName: "Test Employee" },
      },
      { say: "I already told you the employee name. She is at Dodge", raw: { employeeName: "Test Employee" } },
      {
        say: "I gave bubbles all of the information it should need, but it still would not generate the coaching form.",
        raw: { templateKey: "coaching", employeeName: "Test Employee" },
      },
      {
        say: "Create the coaching form with the information given. Her name is Test Employee and she is at Dodge. She is a makery associate",
        raw: { templateKey: "coaching", employeeName: "Test Employee" },
      },
      { say: "she is at Omaha dodge", raw: { templateKey: "coaching", employeeName: "Test Employee" } },
    ];
    for (const count of [1, 2, 3, 4, 5]) {
      const response = await chat(turns.slice(0, count));
      const issue = response.formProposal?.issue ?? "";
      expect(issue, `turn ${count}`).toMatch(/10 minutes late/);
      expect(issue, `turn ${count}`).toMatch(/10\/5/);
      expect(issue, `turn ${count}`).toMatch(/10\/15/);
      expect(issue, `turn ${count}`).toMatch(/verbally coached/);
      expect(issue, `turn ${count}`).not.toMatch(/generate|bubbles|information/i);
    }
  });

  it("conv_mvmznap42vcw0dl: the form date is the incident's 10-22-26, never the 'jba manual 11-1-25' date", async () => {
    const response = await chat([
      {
        say: "do verbal for team member Test Employee at empire, sd. payroll deduct does not apply. previous coaching jba manual 11-1-26. on 10-22-26 Test was not scheduled to work and came into the store to show her team her new puppy. Test was in the store 45 min",
        raw: { templateKey: null },
      },
      { say: "jba manual 11-1-25", raw: { templateKey: null } },
      { say: "cite pets in workplace", raw: { templateKey: null } },
      { say: "cite animals in the workplace policy", raw: { templateKey: null } },
      { say: "store location is empire, sd. create corrective action", raw: { employeeName: "Test Employee" } },
    ]);
    expect(response.formProposal?.formDate).toBe("2026-10-22");
    expect(response.formProposal?.issue ?? "").toMatch(/new puppy/);
    expect(response.formProposal?.issue ?? "").not.toMatch(/create corrective action|sd\./i);
    citesPage(response, "Animals in the Workplace", 30);
  });
});

/**
 * QA B5, prod 25 Oct 2026 (conv_mvnmf1ik2lqkfld, FORM_FULL_REMAP on,
 * REMAP_INCIDENT_FIX_ENABLED off): the card said "What happened: create a for
 * for missing the 5-26 woven deadline" and "Action plan: Meet the woven
 * deadline". The manager typed no plan. The turn is word for word; the model
 * stand-in returns the plan the extraction returned in prod, and the stored
 * slots are the trace row of that turn.
 */
describe("QA B5 conv_mvnmf1ik2lqkfld: the woven deadline request (prod, 25 Oct 2026)", () => {
  const SAID = "create a written CA for Test Employee at Kearney for missing the 10-15-26 woven deadline";
  /** chat_traces.slots for the prod turn, as the next turn reads them back. */
  const STORED = {
    templateKey: "dpoa",
    employeeName: "Test Employee",
    store: "Kearney, NE",
    locationId: "loc-66",
    incidentDateIso: "2026-10-15",
    warningLevel: "written",
    observation: "create a for for missing the 5-26 woven deadline",
    actionPlan: "Meet the woven deadline",
  };

  it("What happened is the incident with its whole date, and no plan is added", async () => {
    for (const observation of [null, "missing the 10-15-26 woven deadline", STORED.observation]) {
      const response = await chat([
        { say: SAID, raw: { employeeName: "Test Employee", observation, actionPlan: "Meet the woven deadline" } },
      ]);
      expect(response.formProposal?.issue).toBe("missing the 10-15-26 woven deadline");
      expect(response.content).toContain("**What happened:** missing the 10-15-26 woven deadline");
      expect(response.content).not.toMatch(/create a for|(?<![\d-])5-26|Meet the woven deadline|Action plan/i);
      expect(response.formProposal?.formDate).toBe("2026-10-15");
      expect(response.content).toContain("**Type of warning:** Written Warning, as you said");
    }
  });

  it("the stored fragment and the stored plan do not ride on to the next turn", () => {
    // The next answer, with the turn that held the account not in hand (a
    // store miss keeps only this request's history).
    const { slots, response } = groundFormSlots({
      raw: raw({ employeeName: "Test Employee", actionPlan: "Meet the woven deadline" }),
      history: [],
      question: "Team Member",
      today: "2026-10-25",
      people: [],
      saved: STORED as never,
    });
    expect(slots.observation).toBeNull();
    expect(slots.actionPlan).toBeNull();
    expect(response.content).not.toMatch(/create a for|Meet the woven deadline/i);
    expect(response.content).toContain("What happened?");

    // With the account in hand, the next turn reads it again in full.
    const next = groundFormSlots({
      raw: raw({ employeeName: "Test Employee", actionPlan: "Meet the woven deadline" }),
      history: [{ role: "user", content: SAID }],
      question: "Team Member",
      today: "2026-10-25",
      people: [],
      saved: STORED as never,
    });
    expect(next.slots.observation).toBe("missing the 10-15-26 woven deadline");
    expect(next.slots.actionPlan).toBeNull();
  });

  it("a model summary with the date cut short is not What happened", () => {
    // "date is …" reads as a date edit, so the summary is the fallback here.
    const { slots } = groundFormSlots({
      raw: raw({ employeeName: "Test Employee", observation: "missed the 5-26 woven deadline" }),
      history: [{ role: "user", content: "create a written CA for Test Employee" }],
      question: "date is 10-15-26, missed the woven deadline",
      today: "2026-10-25",
      people: [],
    });
    expect(slots.observation ?? "").not.toMatch(/(?<![\d-])5-26/);
    expect(slots.incidentDateIso).toBe("2026-10-15");
  });
});
