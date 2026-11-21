import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import { COMPANY_LOCATIONS } from "@/lib/locations";

/*
 * ============================================================================
 * THE AGENT LOOP'S CARD AT CREATE (the loop port from the sibling app, 21 Nov 2026)
 * ============================================================================
 *
 * The loop's card carries `fromAgentLoop` (AGENT_LOOP_ENABLED + AGENT_LOOP_USERS, Pau's account first). Create, ported
 * from the sibling app's route:
 * - a termination the loop decided is ticked only when the manager's own turns carry a termination word
 *   (`saysTerminationWord`), and only with TERMINATION_STATED_TICKS on, as today's tick;
 * - the payroll amount is the card's own, never the chat's latest figure (QA's code audit, item 20);
 * - the exit card's payroll answer and account land in the exit form's own fields (QA item 17);
 * - a Corrective Action gets its follow-up date, one week after the form date, and says so (Pau, 20 Nov 2026).
 * A card without `fromAgentLoop` is created exactly as before. Invented names only.
 */

const store: FakeStore = {
  form_instances: [],
  form_instance_values: [],
  form_instance_events: [],
  form_template_versions: [],
  form_templates: [],
  form_template_current: [],
  form_template_assets: [],
  chat_conversations: [],
  chat_messages: [],
  chat_traces: [],
  chat_form_state: [],
  chat_form_incidents: [],
} as unknown as FakeStore;

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: () => fakeSupabase(store) }));

vi.mock("@/lib/api/respond", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/respond")>()),
  assertLiveMode: () => {},
  assertNoConfigurationProblems: () => {},
  assertWithinRateLimit: () => {},
}));

vi.mock("@/lib/config/server-env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config/server-env")>()),
  liveReadiness: () => ({ mode: "live", missing: [], problems: [], ready: true }),
}));

vi.mock("@/lib/auth/server", async () => ({
  authorizeRequest: async (_request: Request, permission: string) => ({
    identity: {
      subject: "qa-admin",
      email: "qa-admin@example.test",
      displayName: "QA Admin",
      role: "admin",
      scope: { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] },
      verified: true,
    },
    permission,
    provider: "supabase",
  }),
}));

vi.mock("@/lib/analytics/record", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics/record")>()),
  recordActivity: async () => {},
  recordActivityAsync: () => {},
}));

vi.mock("@/lib/forms/employee-roster", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/forms/employee-roster")>();
  return { ...actual, loadScopedRoster: async () => [], readDirectoryFacts: async () => [] };
});

process.env.NEXT_PUBLIC_DEMO_MODE = "false";
vi.setConfig({ hookTimeout: 30_000, testTimeout: 30_000 });

const { ensureTemplateLibrary } = await import("@/lib/forms/repository");
const instancesRoute = await import("./instances/route");

const FLAGS = ["TERMINATION_STATED_TICKS_ENABLED", "PAYROLL_DEDUCT_AMOUNT_ENABLED"] as const;
const saved = new Map<string, string | undefined>();
const TODAY = "2026-11-20";
const STORE = COMPANY_LOCATIONS[0]!;

function joinOverview() {
  for (const row of store.form_instances ?? []) {
    const template = store.form_templates!.find((entry) => entry.id === row.template_id);
    const version = store.form_template_versions.find((entry) => entry.id === row.template_version_id);
    Object.assign(row, { template_key: template?.key, template_name: template?.name, layout_family: template?.layout_family, template_version: version?.version });
  }
}
class JoiningRows extends Array<Record<string, unknown>> {
  override push(...rows: Record<string, unknown>[]) {
    const count = super.push(...rows);
    joinOverview();
    return count;
  }
}

beforeEach(async () => {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  store.form_instances = new JoiningRows() as never;
  for (const name of FLAGS) {
    saved.set(name, process.env[name]);
    process.env[name] = "true";
  }
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T15:30:00Z`));
  await ensureTemplateLibrary("system");
});
afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  vi.useRealTimers();
});

let sequence = 0;
async function create(card: Record<string, unknown>, managerTurns: string[]) {
  const conversation = managerTurns.flatMap((content) => {
    sequence += 1;
    return [
      { id: `m-${sequence}`, role: "user", content },
      { id: `a-${sequence}`, role: "assistant", content: "Here's the card." },
    ];
  });
  const response = await instancesRoute.POST(
    new Request("https://app.test/api/forms/instances", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        employeeName: "Quinn Marlowe",
        locationId: STORE.id,
        locationName: STORE.name,
        source: "assistant",
        formDate: TODAY,
        proposalId: `proposal-${sequence}`,
        conversation,
        ...card,
      }),
    }),
  );
  const body = (await response.json()) as { instance?: { id: string; followUpDate: string | null }; followUpNotice?: string; error?: string };
  expect(response.ok, body.error).toBe(true);
  const id = body.instance!.id;
  const row = (key: string) => store.form_instance_values.find((entry) => entry.instance_id === id && entry.field_key === key);
  return { body, value: (key: string) => (row(key)?.value as string | undefined) ?? null, checked: (key: string) => (row(key)?.checked as string[] | undefined) ?? null };
}

describe("a Corrective Action card from the agent loop", () => {
  const TERM = ["I need to terminate Quinn Marlowe, she walked out mid shift on 11/18 and has two written CAs"];

  it("the loop's termination is ticked when the manager said a termination word", async () => {
    const made = await create({ templateKey: "dpoa", fromAgentLoop: true, warningLevel: "termination" }, TERM);
    expect(made.checked("warning_type")).toEqual(["termination"]);
  });

  it("never when the manager's words carry none (the model's decision is locked on their word)", async () => {
    const made = await create({ templateKey: "dpoa", fromAgentLoop: true, warningLevel: "termination" }, ["make a CA for Quinn Marlowe, she walked out mid shift on 11/18"]);
    expect(made.checked("warning_type")).toBeNull();
  });

  it("never with TERMINATION_STATED_TICKS off", async () => {
    process.env.TERMINATION_STATED_TICKS_ENABLED = "false";
    const made = await create({ templateKey: "dpoa", fromAgentLoop: true, warningLevel: "termination" }, TERM);
    expect(made.checked("warning_type")).toBeNull();
  });

  it("the payroll amount is the card's own: a bare \"25\" answering the loop's question is read", async () => {
    const made = await create(
      { templateKey: "dpoa", fromAgentLoop: true, payrollDeduct: "yes", payrollDeductAmount: "25" },
      ["make a CA for Quinn Marlowe, she lost the store keys on 11/18, yes payroll deduct", "25"],
    );
    expect(made.value("payroll_deduct_amount")).toBe("$25");
  });

  it("gets its follow-up date one week after the form date, and says so", async () => {
    const made = await create({ templateKey: "dpoa", fromAgentLoop: true }, ["make a CA for Quinn Marlowe, she was late on 11/18"]);
    expect(made.body.instance!.followUpDate).toBe("2026-11-27");
    expect(made.body.followUpNotice).toMatch(/^Follow-up: Fri, Nov 27/);
  });
});

describe("an exit card from the agent loop", () => {
  it("a resignation: the payroll answer and the account are the exit form's own lines", async () => {
    const account = "Quinn Marlowe resigned on 11/18; her final paycheck should deduct the uniform cost.";
    const made = await create(
      { templateKey: "resignation-exit", fromAgentLoop: true, payrollDeduct: "yes", loopAccount: account },
      ["Quinn Marlowe resigned on 11/18, final paycheck should deduct the uniform cost"],
    );
    expect(made.checked("payroll_deduction_applicable")).toEqual(["yes"]);
    expect(made.value("details")).toBe(account);
  });

  it("a termination: immediate involuntary separation, with the account as the reason", async () => {
    const account = "Quinn Marlowe was terminated on 11/18 for a no call no show after two written CAs.";
    const made = await create(
      { templateKey: "resignation-exit", fromAgentLoop: true, warningLevel: "termination", loopAccount: account },
      ["Quinn Marlowe is terminated, no call no show on 11/18 after two written CAs"],
    );
    expect(made.checked("resignation_type")).toEqual(["immediate_involuntary_separation"]);
    expect(made.value("resignation_reason")).toBe(account);
  });
});

describe("a card that is not the loop's is created as before", () => {
  it("no follow-up date, no exit lines from an account, no card amount", async () => {
    const made = await create(
      { templateKey: "dpoa", payrollDeduct: "yes", payrollDeductAmount: "25", loopAccount: "anything" },
      ["make a CA for Quinn Marlowe, she was late on 11/18, deduct $40 from payroll"],
    );
    expect(made.body.instance!.followUpDate).toBeNull();
    expect(made.body.followUpNotice).toBeUndefined();
    expect(made.value("payroll_deduct_amount")).toBe("$40");
  });
});
