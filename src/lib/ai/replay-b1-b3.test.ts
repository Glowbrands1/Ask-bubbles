import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DirectoryRosterRow } from "@/lib/forms/employee-roster";
import { GLOBAL_STORE_ASK_TAG } from "@/lib/forms/global-store-ask";
import { proposeLocation } from "@/lib/forms/location-scope";
import { payrollDeductAmount } from "@/lib/forms/payroll-deduct";
import { payrollAmountPrompt } from "@/lib/forms/payroll-deduct-amount";
import { replayFormDate, replayPayrollAmount } from "@/lib/forms/replay-guards";
import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import { rosterResultFor } from "@/test/roster-result";
import type { AccessScope, ChatMessage, Role } from "@/types";

import { captureFormState } from "./form-state";
import { augmentIntakeQuestion } from "./intake-augment";
import { fieldsFromManagerText } from "./form-field-state";

/**
 * B1, B2, and B3 from the corrective-action replay, plus the store
 * correction and the $25 amount those reports named.
 *
 * B1: "create ca form for tess varga for violating attendance policy on 10-20-26. verbal. no payroll deduct. jba manual 1-1-26 for previous coaching"
 * B2: "verbal"
 * B3: "create ca form for tess varga for a register shortage on 10-20-26. payroll deduct applies and $3.25 will be deducted from check. previous coaching - jba policy manual 1-20-26."
 */

const B1 =
  "create ca form for tess varga for violating attendance policy on 10-20-26. verbal. no payroll deduct. jba manual 1-1-26 for previous coaching";
const B2 = "verbal";
const B3 =
  "create ca form for tess varga for a register shortage on 10-20-26. payroll deduct applies and $3.25 will be deducted from check. previous coaching - jba policy manual 1-20-26.";
const YESTERDAY =
  "create ca form for tess varga for violating attendance policy yesterday. verbal. no payroll deduct. jba manual 1-1-26 for previous coaching";
const AMOUNT_25 =
  "create ca form for tess varga for a register shortage on 10-20-26. payroll deduct applies and $25 will come out of the check.";
const TODAY = "2026-10-24";
const GLOBAL: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };

const store: FakeStore = {
  form_instances: [],
  form_instance_values: [],
  form_instance_events: [],
  form_template_versions: [],
  form_templates: [],
  form_template_current: [],
  form_template_assets: [],
};
const state = vi.hoisted(() => ({ directory: [] as DirectoryRosterRow[] }));

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: () => fakeSupabase(store) }));
vi.mock("@/lib/forms/employee-roster", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/forms/employee-roster")>();
  return {
    ...actual,
    loadScopedRoster: async (scope: AccessScope | null) => actual.scopeRoster(state.directory, scope),
    loadScopedRosterResult: async (scope: AccessScope | null) => rosterResultFor(actual.scopeRoster, state.directory, scope),
  };
});

const { ensureTemplateLibrary, listTemplateSummaries } = await import("@/lib/forms/repository");
const { proposeFormForTurn } = await import("./form-proposal");

const FLAGS = [
  "FORM_REPLAY_GUARDS_ENABLED",
  "FORM_STATE_ENABLED",
  "SLOT_RETENTION_ENABLED",
  "GLOBAL_STORE_ASK_ENABLED",
  "PAYROLL_DEDUCT_AMOUNT_ENABLED",
  "TYPED_NAME_ENABLED",
  "PRINTED_PAGE_ONLY_ENABLED",
  "ACTION_PLAN_SENTENCES_ENABLED",
] as const;

function setFlags(on: readonly string[]) {
  for (const name of FLAGS) {
    if (on.includes(name)) process.env[name] = "1";
    else delete process.env[name];
  }
}

async function propose(input: {
  role?: Role;
  question: string;
  history?: ChatMessage[];
  flags: readonly string[];
  continueTemplateKey?: string;
}) {
  setFlags(input.flags);
  return proposeFormForTurn({
    history: input.history ?? [],
    question: input.question,
    questionMessageId: "u-now",
    actor: { role: input.role ?? "admin", scope: GLOBAL },
    summaries: await listTemplateSummaries(),
    today: TODAY,
    ...(input.continueTemplateKey ? { continueTemplateKey: input.continueTemplateKey } : {}),
  });
}

beforeEach(async () => {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  state.directory = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-24T18:00:00Z"));
  await ensureTemplateLibrary("system");
});

afterEach(() => {
  vi.useRealTimers();
  setFlags([]);
});

describe("B1 incident date is not today", () => {
  it("keeps 10-20-26 and not the prior-coaching date or today", async () => {
    const response = await propose({ question: B1, flags: ["FORM_REPLAY_GUARDS_ENABLED", "TYPED_NAME_ENABLED"] });
    expect(response?.formProposal?.formDate).toBe("2026-10-20");
    expect(response?.formProposal?.formDate).not.toBe(TODAY);
    expect(response?.formProposal?.formDate).not.toBe("2026-01-01");
  });

  it("uses yesterday for the same B1 request when that is the incident day", async () => {
    expect(replayFormDate(YESTERDAY, TODAY, null)).toBeNull();
    process.env.FORM_REPLAY_GUARDS_ENABLED = "1";
    expect(replayFormDate(YESTERDAY, TODAY, null)).toBe("2026-10-23");
    expect(replayFormDate(YESTERDAY, TODAY, TODAY)).toBe("2026-10-23");
    const response = await propose({ question: YESTERDAY, flags: ["FORM_REPLAY_GUARDS_ENABLED", "TYPED_NAME_ENABLED"] });
    expect(response?.formProposal?.formDate).toBe("2026-10-23");
    expect(fieldsFromManagerText(YESTERDAY, TODAY).incidentDateIso).toBe("2026-10-23");
  });
});

describe("a stated payroll amount stays on the form", () => {
  it("keeps B3's $3.25", () => {
    expect(payrollDeductAmount(B3)).toBe("$3.25");
    process.env.PAYROLL_DEDUCT_AMOUNT_ENABLED = "1";
    process.env.FORM_REPLAY_GUARDS_ENABLED = "1";
    expect(replayPayrollAmount(B3)).toBe("$3.25");
    expect(
      payrollAmountPrompt({ payroll: "yes", managerText: B3, assistantMessages: [] }),
    ).toContain("**Payroll deduction amount:** $3.25");
  });

  it("keeps $25 that the amount reader used to drop", () => {
    expect(payrollDeductAmount(AMOUNT_25)).toBeNull();
    process.env.PAYROLL_DEDUCT_AMOUNT_ENABLED = "1";
    expect(replayPayrollAmount(AMOUNT_25)).toBeNull();
    expect(payrollAmountPrompt({ payroll: "yes", managerText: AMOUNT_25, assistantMessages: [] })).toContain(
      "Payroll deduction amount?",
    );
    process.env.FORM_REPLAY_GUARDS_ENABLED = "1";
    expect(replayPayrollAmount(AMOUNT_25)).toBe("$25");
    expect(payrollAmountPrompt({ payroll: "yes", managerText: AMOUNT_25, assistantMessages: [] })).toContain(
      "**Payroll deduction amount:** $25",
    );
    expect(replayPayrollAmount("The employee will reimburse The Company $25.00 via payroll deduction.")).toBeNull();
  });
});

describe("B1 then B2 does not save the later message as Job Title", () => {
  const positionAsked = `What is **Tess Varga**'s position (job title)? I don't have one from Woven or from what you've told me.`;

  it("keeps verbal as the warning, not the title, when form state and slot retention are on", async () => {
    const flags = ["FORM_STATE_ENABLED", "SLOT_RETENTION_ENABLED", "TYPED_NAME_ENABLED"] as const;
    const first = await propose({ question: B1, flags });
    expect(first?.formProposal?.warningLevel).toBe("verbal");
    const history = [
      { id: "u1", role: "user", content: B1, createdAt: "2026-10-24T18:00:00Z" },
      {
        id: "a1",
        role: "assistant",
        content: `${first?.content ?? ""}\n${positionAsked}`,
        createdAt: "2026-10-24T18:00:01Z",
        formProposal: first?.formProposal ?? undefined,
      },
    ] as ChatMessage[];
    const second = await propose({ question: B2, history, flags, continueTemplateKey: "dpoa" });
    expect(second?.formProposal?.employeeRole ?? null).not.toBe("Verbal");
    expect(second?.formProposal?.warningLevel).toBe("verbal");
    const saved = captureFormState(null, {
      proposal: second?.formProposal ?? null,
      employeeId: null,
      keptTypedName: null,
      userText: B2,
      policyHeading: null,
      policyPage: null,
    });
    expect(saved.title).not.toBe("Verbal");
    const echoed = augmentIntakeQuestion({
      slots: true,
      fields: false,
      question: B2,
      history: [{ role: "user", content: B1 }],
      today: TODAY,
      stored: {
        employeeName: "Tess Varga",
        employeeId: null,
        jobTitle: "Verbal",
        store: null,
        locationId: null,
        incidentDateIso: "2026-10-20",
        useToday: false,
        payrollDeduct: "no",
        payrollAmount: null,
        warningLevel: "verbal",
        policySection: null,
        whatHappened: true,
        deadline: null,
        pendingChoice: [],
      },
    });
    expect(echoed).not.toMatch(/Job title:\s*Verbal/i);
  });
});

describe("change store to Bellevue asks the store question only once", () => {
  it("uses Bellevue and does not ask which store again", async () => {
    const flags = ["GLOBAL_STORE_ASK_ENABLED", "FORM_REPLAY_GUARDS_ENABLED", "TYPED_NAME_ENABLED"] as const;
    const opening = "Build me a coaching form for Sarah Test for that.";
    const first = await propose({ role: "district_manager", question: opening, flags });
    expect(first?.content).toContain(GLOBAL_STORE_ASK_TAG);
    const history = [
      { id: "u1", role: "user", content: opening, createdAt: "2026-10-24T18:00:00Z" },
      {
        id: "a1",
        role: "assistant",
        content: first?.content ?? "",
        createdAt: "2026-10-24T18:00:01Z",
        formProposal: first?.formProposal ?? undefined,
      },
    ] as ChatMessage[];
    const second = await propose({
      role: "district_manager",
      question: "change store to Bellevue",
      history,
      flags,
      continueTemplateKey: "coaching",
    });
    expect(second?.formProposal?.locationId).toBe("loc-67");
    expect(second?.content ?? "").not.toMatch(/which store/i);
    expect(second?.content ?? "").not.toContain(GLOBAL_STORE_ASK_TAG);
  });

  it("still treats the phrase as two stores while the guard is off", () => {
    delete process.env.FORM_REPLAY_GUARDS_ENABLED;
    const turns = ["Create a coaching form for Sarah at Kearney", "change store to Bellevue\nIt happened at Kearney, NE."];
    const off = proposeLocation(GLOBAL, turns.join("\n\n"), [], undefined, { turns });
    expect(off.resolution).toBe("needs_selection");
    process.env.FORM_REPLAY_GUARDS_ENABLED = "1";
    const on = proposeLocation(GLOBAL, turns.join("\n\n"), [], undefined, { turns });
    expect(on).toEqual({ resolution: "resolved", locationId: "loc-67" });
  });
});
