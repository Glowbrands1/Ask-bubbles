import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import { rosterResultFor } from "@/test/roster-result";
import type { AccessScope, ChatFormProposal, ChatMessage } from "@/types";

import { captureFormState } from "./form-state";
import { decideIntentTurn } from "./intent-slots";

/**
 * Tonight's live replays, in the manager's words.
 *
 * Prod flags on: PRINTED_PAGE_ONLY, ACTION_PLAN_SENTENCES, PAYROLL_DEDUCT_AMOUNT,
 * TYPED_NAME, GLOBAL_STORE_ASK. FORM_INPUT_FIDELITY_ENABLED is the new gate.
 * FORM_STATE and INTENT_EXTRACTION are turned on in a second pass because a
 * stored title or a model slot can keep a short reply that the proposal saved.
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

process.env.NEXT_PUBLIC_DEMO_MODE = "false";
const { ensureTemplateLibrary, listTemplateSummaries } = await import("@/lib/forms/repository");
const { proposeFormForTurn } = await import("./form-proposal");

const TODAY = "2026-10-24";
const SCOPE: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const PROD = [
  "PRINTED_PAGE_ONLY_ENABLED",
  "ACTION_PLAN_SENTENCES_ENABLED",
  "PAYROLL_DEDUCT_AMOUNT_ENABLED",
  "TYPED_NAME_ENABLED",
  "GLOBAL_STORE_ASK_ENABLED",
] as const;
const EXTRA = ["FORM_STATE_ENABLED", "INTENT_EXTRACTION_ENABLED"] as const;
const FIDELITY = "FORM_INPUT_FIDELITY_ENABLED";
const saved = new Map<string, string | undefined>();

function hold(name: string, value: string | undefined) {
  if (!saved.has(name)) saved.set(name, process.env[name]);
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(async () => {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  state.directory = [];
  for (const name of PROD) hold(name, "1");
  for (const name of EXTRA) hold(name, undefined);
  hold(FIDELITY, undefined);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-24T18:00:00Z"));
  await ensureTemplateLibrary("system");
});

afterEach(() => {
  vi.useRealTimers();
  for (const name of [...PROD, ...EXTRA, FIDELITY]) {
    const value = saved.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

async function replay(turns: readonly string[]): Promise<Array<ChatFormProposal | null>> {
  const messages: ChatMessage[] = [];
  const proposals: Array<ChatFormProposal | null> = [];
  let open: string | undefined;
  let n = 0;
  for (const text of turns) {
    n += 1;
    const response = await proposeFormForTurn({
      history: messages,
      question: text,
      questionMessageId: `u${n}`,
      actor: { role: "owner", scope: SCOPE },
      summaries: await listTemplateSummaries(),
      today: TODAY,
      ...(open ? { continueTemplateKey: open } : {}),
    });
    const proposal = response?.formProposal ?? null;
    if (proposal) open = proposal.templateKey;
    proposals.push(proposal);
    messages.push(
      { id: `u${n}`, role: "user", content: text, createdAt: "2026-10-24T18:00:00Z" } as ChatMessage,
      {
        id: `a${n}`,
        role: "assistant",
        content: response?.content ?? "",
        createdAt: "2026-10-24T18:00:01Z",
        ...(proposal ? { formProposal: proposal } : {}),
      } as ChatMessage,
    );
  }
  return proposals;
}

function role(proposal: ChatFormProposal | null): string | null {
  return proposal?.employeeRole ?? null;
}

describe("typed dates and short follow-ups, fidelity off, prod flags on", () => {
  it("keeps Oct 20 and 10/20, and still dates yesterday as unset", async () => {
    const oct = await replay(["create a corrective action for Pat Rivera. She was late on Oct 20."]);
    const slash = await replay(["create a corrective action for Pat Rivera. She was late on 10/20."]);
    const yest = await replay(["create a corrective action for Pat Rivera. She was late yesterday."]);
    const coach = await replay(["create a coaching form for Pat Rivera. She was late yesterday."]);
    const none = await replay(["create a corrective action for Pat Rivera. She was late."]);
    expect(oct[0]?.formDate).toBe("2026-10-20");
    expect(slash[0]?.formDate).toBe("2026-10-20");
    expect(yest[0]?.formDate ?? null).toBeNull();
    expect(coach[0]?.formDate ?? null).toBeNull();
    expect(none[0]?.formDate ?? null).toBeNull();
  });

  it("saves verbal, written, and yesterday as the job title", async () => {
    const verbal = await replay([
      "create a corrective action for Pat Rivera. She was late on Oct 20.",
      "verbal",
    ]);
    const written = await replay([
      "create a corrective action for Pat Rivera. She was late on Oct 20.",
      "written",
    ]);
    const yesterday = await replay([
      "create a corrective action for Pat Rivera. She was late.",
      "yesterday",
    ]);
    const yes = await replay([
      "create a corrective action for Pat Rivera. She was late on Oct 20.",
      "yes",
    ]);
    expect(verbal[1]?.warningLevel).toBe("verbal");
    expect(role(verbal[1])).toBe("Verbal");
    expect(written[1]?.warningLevel).toBe("written");
    expect(role(written[1])).toBe("Written");
    expect(role(yesterday[1])).toBe("Yesterday");
    expect(yesterday[1]?.formDate ?? null).toBeNull();
    expect(yes[1]?.payrollDeduct).toBe("yes");
    expect(role(yes[1])).toBeNull();
  });
});

describe("typed dates and short follow-ups, fidelity on, prod flags on", () => {
  beforeEach(() => {
    hold(FIDELITY, "1");
  });

  it("keeps Oct 20, 10/20, and yesterday on a corrective action and a coaching form", async () => {
    const cases: Array<[string, string | null]> = [
      ["create a corrective action for Pat Rivera. She was late on Oct 20.", "2026-10-20"],
      ["create a corrective action for Pat Rivera. She was late on 10/20.", "2026-10-20"],
      ["create a corrective action for Pat Rivera. Date of Occurrence: Oct 20. She was late.", "2026-10-20"],
      ["create a corrective action for Pat Rivera. Date of Occurrence 10/20. She was late.", "2026-10-20"],
      ["create a corrective action for Pat Rivera. She was late yesterday.", "2026-10-23"],
      ["create a corrective action for Pat Rivera. Date of Occurrence yesterday. She was late.", "2026-10-23"],
      ["create a coaching form for Pat Rivera. She was late on Oct 20.", "2026-10-20"],
      ["create a coaching form for Pat Rivera. She was late on 10/20.", "2026-10-20"],
      ["create a coaching form for Pat Rivera. She was late yesterday.", "2026-10-23"],
      ["create a corrective action for Pat Rivera. She was late.", null],
    ];
    for (const [text, date] of cases) {
      const [proposal] = await replay([text]);
      expect(proposal?.formDate ?? null, text).toBe(date);
    }
  });

  it("routes a bare follow-up to the date, the warning, or payroll, not the job title", async () => {
    const verbal = await replay([
      "create a corrective action for Pat Rivera. She was late on Oct 20.",
      "verbal",
    ]);
    const written = await replay([
      "create a corrective action for Pat Rivera. She was late on Oct 20.",
      "written",
    ]);
    const yes = await replay([
      "create a corrective action for Pat Rivera. She was late on Oct 20.",
      "yes",
    ]);
    const yesterday = await replay(["create a corrective action for Pat Rivera. She was late.", "yesterday"]);
    const oct = await replay(["create a corrective action for Pat Rivera. She was late.", "Oct 20"]);
    const slash = await replay(["create a coaching form for Pat Rivera. She was late.", "10/20"]);
    const title = await replay([
      "create a corrective action for Pat Rivera. She was late on Oct 20.",
      "operator",
    ]);
    expect(verbal[1]?.warningLevel).toBe("verbal");
    expect(role(verbal[1])).toBeNull();
    expect(written[1]?.warningLevel).toBe("written");
    expect(role(written[1])).toBeNull();
    expect(yes[1]?.payrollDeduct).toBe("yes");
    expect(role(yes[1])).toBeNull();
    expect(yesterday[1]?.formDate).toBe("2026-10-23");
    expect(role(yesterday[1])).toBeNull();
    expect(oct[1]?.formDate).toBe("2026-10-20");
    expect(role(oct[1])).toBeNull();
    expect(slash[1]?.formDate).toBe("2026-10-20");
    expect(title[1]?.employeeRole).toBe("Operator");
    expect(title[1]?.formDate).toBe("2026-10-20");
  });
});

describe("the same follow-ups with form state and intent extraction on", () => {
  beforeEach(() => {
    for (const name of EXTRA) hold(name, "1");
  });

  it("still saves verbal as the job title when fidelity is off", async () => {
    hold(FIDELITY, undefined);
    const [first, second] = await replay([
      "create a corrective action for Pat Rivera. She was late on Oct 20.",
      "verbal",
    ]);
    expect(role(second)).toBe("Verbal");
    const stored = captureFormState(null, {
      proposal: second,
      employeeId: null,
      keptTypedName: null,
      userText: "verbal",
      lastAssistant: "",
      policyHeading: null,
      policyPage: null,
    });
    expect(stored.title).toBe("Verbal");
    expect(first?.formDate).toBe("2026-10-20");
    const intent = decideIntentTurn({
      question: "verbal",
      history: [{ role: "assistant", content: "Is this a verbal or written warning? What is the position (job title)?" }],
      today: TODAY,
      saved: null,
      raw: { title: "verbal", warningLevel: "verbal", formTurn: true, formType: "corrective action", employee: "Pat Rivera" },
      people: [],
      stores: [],
      headings: [],
      templates: [{ key: "dpoa", name: "Corrective Action Form" }],
      formInProgress: true,
    });
    expect(intent.state.title).toBeNull();
    expect(intent.state.warningLevel).toBe("verbal");
  });

  it("keeps yesterday and does not store verbal or yes as the title when fidelity is on", async () => {
    hold(FIDELITY, "1");
    const verbal = await replay([
      "create a corrective action for Pat Rivera. She was late yesterday.",
      "verbal",
    ]);
    const yes = await replay([
      "create a corrective action for Pat Rivera. She was late on 10/20.",
      "yes",
    ]);
    expect(verbal[0]?.formDate).toBe("2026-10-23");
    expect(verbal[1]?.warningLevel).toBe("verbal");
    expect(role(verbal[1])).toBeNull();
    expect(yes[0]?.formDate).toBe("2026-10-20");
    expect(yes[1]?.payrollDeduct).toBe("yes");
    expect(role(yes[1])).toBeNull();
    const stored = captureFormState(null, {
      proposal: verbal[1],
      employeeId: null,
      keptTypedName: null,
      userText: "verbal",
      lastAssistant: "",
      policyHeading: null,
      policyPage: null,
    });
    expect(stored.title).toBeNull();
    expect(stored.formDate).toBe("2026-10-23");
    expect(stored.warningLevel).toBe("verbal");
  });
});
