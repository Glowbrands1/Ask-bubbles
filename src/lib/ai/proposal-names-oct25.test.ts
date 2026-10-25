import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import { rosterResultFor } from "@/test/roster-result";
import type { AccessScope, ChatMessage } from "@/types";
import { isNotAName } from "@/lib/forms/not-a-name";
import { typedEmployeeName } from "@/lib/forms/typed-employee-name";

import { withTypedEmployeeOnCard } from "./typed-employee-card";

/**
 * ============================================================================
 * QA, 25 OCT 2026 — "TEST EMPLOYEE" ON THE PROPOSAL FLOW (NOT_A_NAME_GUARD_ENABLED)
 * ============================================================================
 *
 * The full remap is off in production now, so a form turn is the form
 * proposal, and its card goes through `withTypedEmployeeOnCard` (grounded-turn).
 * QA's turns, word for word:
 *
 *   B4  conv_mvi98yvkfuehzye  the card was for **Test**, and stayed so after "verbal"
 *   B8  conv_mvl9l6fkymv3c7p  "Which of them is this … for — NE or JBA Manual?"
 *   G11 conv_mvlb6ils11qqyexg "Who is this … for?"
 *
 * The proposal's name reader cannot read "Test Employee" ("Employee" names a
 * form). With a real two-word name these turns already read the person.
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

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: () => fakeSupabase(store) }));
vi.mock("@/lib/forms/employee-roster", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/forms/employee-roster")>();
  return {
    ...actual,
    loadScopedRoster: async (scope: AccessScope | null) => actual.scopeRoster([] as never, scope),
    loadScopedRosterResult: async (scope: AccessScope | null) => rosterResultFor(actual.scopeRoster, [] as never, scope),
  };
});

process.env.NEXT_PUBLIC_DEMO_MODE = "false";
const { ensureTemplateLibrary, listTemplateSummaries } = await import("@/lib/forms/repository");
const { proposeFormForTurn } = await import("./form-proposal");

const TODAY = "2026-10-24";
const SCOPE: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };

const TURNS = {
  B4: [
    "create ca form for Test Employee for violating attendance policy on 10-20-26. verbal. no payroll deduct. jba manual 1-1-26 for previous coaching",
    "verbal",
  ],
  B8: [
    "write a verbal CA for Team Member, Test Employee at Dodge, NE. On 10-20-26 Test Employee was late for shift and did not call supervisor as outlined in attendance policy. payroll deduct is not applicable. previous coaching is JBA Manual 1-1-25",
  ],
  G11: [
    "create a written corrective action for team member Test Employee at bellevue, ne. location. previous coaching jba manual 1-1-95, verbal ca 10-5-26. payroll deduct is applicable and $25 will be payroll deducted for late open on 10-21-26",
  ],
} as const;

/** The proposal flow, turn by turn, as grounded-turn delivers it. */
async function propose(turns: readonly string[]) {
  const history: ChatMessage[] = [];
  const out: { employeeName: string | null; templateKey: string | null; content: string }[] = [];
  let open: string | undefined;
  for (const [index, question] of turns.entries()) {
    const proposed = await proposeFormForTurn({
      history,
      question,
      questionMessageId: `u${index}`,
      actor: { role: "owner", scope: SCOPE },
      summaries: await listTemplateSummaries(),
      today: TODAY,
      ...(open ? { continueTemplateKey: open } : {}),
    });
    const earlier = history.filter((turn) => turn.role === "user").map((turn) => turn.content);
    const response = proposed ? withTypedEmployeeOnCard(proposed, question, earlier) : null;
    if (response?.formProposal) open = response.formProposal.templateKey;
    out.push({
      employeeName: response?.formProposal?.employeeName ?? null,
      templateKey: response?.formProposal?.templateKey ?? null,
      content: response?.content ?? "",
    });
    history.push(
      { id: `u${index}`, role: "user", content: question, createdAt: TODAY } as ChatMessage,
      {
        id: `a${index}`,
        role: "assistant",
        content: response?.content ?? "",
        createdAt: TODAY,
        ...(response?.formProposal ? { formProposal: response.formProposal } : {}),
      } as ChatMessage,
    );
  }
  return out;
}

beforeEach(async () => {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T18:00:00Z`));
  await ensureTemplateLibrary("system");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("NOT_A_NAME_GUARD_ENABLED on: the card is for Test Employee", { timeout: 120_000 }, () => {
  beforeEach(() => {
    vi.stubEnv("NOT_A_NAME_GUARD_ENABLED", "true");
  });

  it.each(Object.entries(TURNS))("%s", async (_id, turns) => {
    const seen = await propose(turns);
    for (const [index, turn] of seen.entries()) {
      const where = `turn ${index + 1}: ${turns[index]!.slice(0, 50)}`;
      expect(turn.templateKey, where).toBe("dpoa");
      expect(turn.employeeName, where).toBe("Test Employee");
      expect(turn.content, where).not.toMatch(/which of them|who is this/i);
      expect(turn.content, where).not.toMatch(/\*\*(?:NE|JBA Manual|Test)\*\*/);
    }
  });

  it('"NE" alone is a state code, not a person', () => {
    expect(isNotAName("NE")).toBe(true);
    expect(isNotAName("ne")).toBe(true);
    expect(isNotAName("Nell")).toBe(false);
  });
});

describe("off: as production", { timeout: 120_000 }, () => {
  it("B4 is for **Test**, B8 asks NE or JBA Manual, G11 asks who", async () => {
    expect((await propose(TURNS.B4)).map((turn) => turn.employeeName)).toEqual(["Test", "Test"]);
    expect((await propose(TURNS.B8))[0]!.content).toMatch(/\*\*NE\*\* or \*\*JBA Manual\*\*/);
    expect((await propose(TURNS.G11))[0]!.content).toMatch(/^Who is this/);
  });
});

/*
 * Ask Sunny QA G4 (conv_mvo1t7qv253555k there), in this app's words: the name
 * opening a sentence after another was read only by the intent model's slot,
 * so one run of three dropped it. The reader now finds it with the guard on.
 */
describe("G4 (ported): a name that opens a sentence", () => {
  const TURN =
    "Okay let's restart. Test Employee, Team Member, Kearney. Not completing closing duties and signing off that they were complete when they weren't.";

  it("guard on: read", () => {
    vi.stubEnv("NOT_A_NAME_GUARD_ENABLED", "true");
    expect(typedEmployeeName(TURN)).toBe("Test Employee");
  });

  it("guard off: unchanged", () => {
    expect(typedEmployeeName(TURN)).toBeNull();
  });
});

describe("G4 (ported): the intake list no longer asks for the name it read", () => {
  const reply = (content: string) =>
    ({
      content,
      formProposal: { templateName: "Coaching Form", templateKey: "coaching", employeeName: null },
    }) as unknown as Parameters<typeof withTypedEmployeeOnCard>[0];
  const ASKED = [
    "Who is this coaching form for?",
    "",
    "To draft it I need:",
    "1. The employee's full name and title",
    "2. The store",
    "3. What happened",
  ].join("\n");
  const TURN = "Okay let's restart. Test Employee, Team Member, Kearney. Not completing closing duties.";

  it("guard on: the name item comes out and the list counts from 1", () => {
    vi.stubEnv("NOT_A_NAME_GUARD_ENABLED", "true");
    const out = withTypedEmployeeOnCard(reply(ASKED), TURN);
    expect(out.formProposal?.employeeName).toBe("Test Employee");
    expect(out.content).not.toMatch(/who is this|full name/i);
    expect(out.content).toContain("1. The store\n2. What happened");
  });

  it("guard off: unchanged", () => {
    const out = withTypedEmployeeOnCard(reply(ASKED), TURN);
    expect(out.content).toBe(ASKED);
  });
});
