import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import { rosterResultFor } from "@/test/roster-result";
import { ACTIVE_BRAND } from "@/lib/brand";
import { CLAUDE_MODEL } from "@/lib/config/models";
import { replayQuestions, type HarnessEvent } from "@/lib/forms/anti-loop";
import { correctiveActionPlan } from "@/lib/forms/ca-action-plan";
import { actionPlanSentenceCount } from "@/lib/forms/action-plan-sentences";
import type { ManualChunk } from "@/lib/forms/official-policy-manual";
import type { AccessScope, ChatFormProposal, ChatMessage } from "@/types";

import { accountManualSections } from "./account-manual-sections";
import { flaggedCitationWrite } from "./policy-citation-fields";
import { buildSystemPrompt } from "./prompts";
import replaySet from "./replay-set.json";

/**
 * b9–b12 against the anti-loop card rules.
 *
 * The pass criteria live in replay-set.json and were written before this
 * run. Flags-on must pass every run. Flags-off is scored in the same
 * table and is allowed to fail those criteria. Local harness only.
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
const FLAGS = [
  "TYPED_NAME_ENABLED",
  "ACTION_PLAN_SENTENCES_ENABLED",
  "PRINTED_PAGE_ONLY_ENABLED",
  "POLICY_CITATION_ENABLED",
  "PAYROLL_DEDUCT_AMOUNT_ENABLED",
  "ANTI_LOOP_ENABLED",
] as const;
const saved = new Map<string, string | undefined>();

function sheet(index: number, heading: string, page: number): ManualChunk {
  return {
    chunkIndex: index,
    page: page + 1,
    printedPage: page,
    section: heading,
    content: `${heading}\nPage ${page}\nThe company states this rule.`,
    sections: [{ heading, page }],
  };
}

const CHUNKS: readonly ManualChunk[] = [
  sheet(2, "Standards of Conduct", 12),
  sheet(3, "Attendance", 14),
  sheet(4, "Late Opening", 15),
  sheet(5, "Visitors in the Workplace", 29),
  sheet(6, "Animals in the Workplace", 30),
];

const MANUAL = {
  documentId: "doc-jba",
  documentTitle: "JBA Policy Manual Edited 5.2025",
  matchedBy: "fallback" as const,
};

interface Snap {
  turn: number;
  content: string;
  templateKey: string | null;
  employeeName: string | null;
  employeeRole: string | null;
  warningLevel: string | null;
  payrollDeduct: string | null;
  formDate: string | null;
  locationId: string | null;
  locationName: string | null;
  locationCandidates: string[];
  issue: string | null;
  status: string | null;
  citation: string;
  plan: string;
  planSentences: number;
  verification: string | null;
}

/**
 * The system prompt before commit 295d573 (parent 655a61d). That commit is
 * the only edit to `prompts.ts` after main. With these two switches off,
 * `buildSystemPrompt` is that text. The card runner does not read it.
 */
const LAST_KNOWN_GOOD_PROMPT = "655a61dbebccd34405b53e40e0566a294120b0b8";

interface CaseResult {
  id: string;
  flags: "off" | "on";
  prompt: "current" | "lkg";
  promptSha256: string;
  run: number;
  pass: boolean;
  misses: string[];
  events: HarnessEvent[];
  latencyMs: number;
}

const results: CaseResult[] = [];

function snapOf(turn: number, content: string, proposal: ChatFormProposal | null | undefined, notes: string): Snap {
  const citation =
    flaggedCitationWrite({
      enabled: true,
      templateKey: "dpoa",
      values: { policy_language: "" },
      notes,
      chunks: CHUNKS,
      manual: MANUAL,
    }).values.policy_language ?? "";
  const headings = accountManualSections(notes, CHUNKS).map((section) => section.heading);
  const plan = correctiveActionPlan({
    citedPolicies: headings,
    employeeName: proposal?.employeeName ?? "",
    payroll: {
      answer: proposal?.payrollDeduct === "yes" ? "yes" : proposal?.payrollDeduct === "no" ? "no" : null,
      amount: null,
    },
  });
  return {
    turn,
    content,
    templateKey: proposal?.templateKey ?? null,
    employeeName: proposal?.employeeName ?? null,
    employeeRole: proposal?.employeeRole ?? null,
    warningLevel: proposal?.warningLevel ?? null,
    payrollDeduct: proposal?.payrollDeduct ?? null,
    formDate: proposal?.formDate ?? null,
    locationId: proposal?.locationId ?? null,
    locationName: proposal?.locationName ?? null,
    locationCandidates: proposal?.locationCandidates ?? [],
    issue: proposal?.issue ?? null,
    status: proposal?.status ?? null,
    citation,
    plan,
    planSentences: actionPlanSentenceCount(plan),
    verification: proposal?.employeeVerification?.status ?? null,
  };
}

async function replay(turns: readonly string[]): Promise<{ snaps: Snap[]; events: HarnessEvent[] }> {
  const { questions, events } = replayQuestions(turns);
  const messages: ChatMessage[] = [];
  const snaps: Snap[] = [];
  let open: string | undefined;
  let n = 0;
  const said: string[] = [];
  for (const text of questions) {
    n += 1;
    said.push(text);
    const response = await proposeFormForTurn({
      history: messages,
      question: text,
      questionMessageId: `u${n}`,
      actor: { role: "owner", scope: SCOPE },
      summaries: await listTemplateSummaries(),
      today: TODAY,
      policyManual: async () => CHUNKS,
      policyManualIdentity: async () => ({ title: "JBA Policy Manual Edited 5.2025", confirmed: true }),
      ...(open ? { continueTemplateKey: open } : {}),
    });
    const proposal = response?.formProposal ?? null;
    if (proposal) open = proposal.templateKey;
    snaps.push(snapOf(n, response?.content ?? "", proposal, said.join("\n")));
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
  return { snaps, events };
}

function blob(item: Snap | undefined): string {
  if (!item) return "";
  return [item.content, item.issue ?? "", item.citation, item.employeeName ?? "", item.employeeRole ?? "", item.plan].join("\n");
}

function matches(text: string, pattern: string, flags = "i"): boolean {
  return new RegExp(pattern, flags).test(text);
}

interface ReplayCase {
  id: string;
  turns: string[];
  employee: { pattern: string; byTurn: number; heldOnTurn?: number };
  neverEmployee?: string[];
  templateKey: string;
  warningLevel: string;
  payrollDeduct: string;
  formDate: string;
  store: { kind: "blank" } | { kind: "match"; pattern: string };
  offense?: string;
  policy?: { fromTurn: number; heading: string; page: number };
  showCardOnTurns?: number[];
  planOnTurn?: { turn: number; sentences: number; starts: string };
  priorOnTurn?: { turn: number; pattern: string };
  roleNot?: string;
  locationNot?: string;
  keep?: string;
  forbid?: string[];
}

const cases = replaySet.cases as ReplayCase[];

function judge(spec: ReplayCase, snaps: Snap[], latencyMs: number): string[] {
  const misses: string[] = [];
  const early = snaps
    .filter((item) => item.turn <= spec.employee.byTurn)
    .find(
      (item) =>
        matches(item.employeeName ?? "", spec.employee.pattern) &&
        item.templateKey === spec.templateKey &&
        item.warningLevel === spec.warningLevel &&
        item.payrollDeduct === spec.payrollDeduct &&
        item.formDate === spec.formDate,
    );
  if (!early) {
    misses.push(
      `card by turn ${spec.employee.byTurn}: ${snaps
        .map((item) => `t${item.turn}:${item.templateKey}:${item.employeeName}:${item.warningLevel}:${item.payrollDeduct}:${item.formDate}`)
        .join(" | ")}`,
    );
  }
  if (spec.employee.heldOnTurn) {
    const held = snaps.find((item) => item.turn === spec.employee.heldOnTurn);
    if (!matches(held?.employeeName ?? "", spec.employee.pattern)) {
      misses.push(`turn ${spec.employee.heldOnTurn} keeps the employee: ${held?.employeeName ?? "none"}`);
    }
  }
  for (const item of snaps) {
    if (item.templateKey === "coaching") misses.push(`turn ${item.turn} coaching form`);
    for (const pattern of spec.neverEmployee ?? []) {
      if (matches(item.employeeName ?? "", pattern)) misses.push(`turn ${item.turn} employee ${item.employeeName}`);
    }
    if (spec.roleNot && matches(item.employeeRole ?? "", spec.roleNot)) {
      misses.push(`turn ${item.turn} role ${item.employeeRole}`);
    }
    if (spec.locationNot && matches(item.locationName ?? "", spec.locationNot)) {
      misses.push(`turn ${item.turn} store ${item.locationName}`);
    }
    const shown = `${item.content}\n${item.issue ?? ""}`;
    for (const pattern of replaySet.blockingPatterns) {
      if (matches(shown, pattern)) misses.push(`turn ${item.turn} blocking: ${pattern}`);
    }
    for (const pattern of replaySet.leakPatterns) {
      if (matches(shown, pattern)) misses.push(`turn ${item.turn} leaked: ${pattern}`);
    }
    for (const pattern of spec.forbid ?? []) {
      if (matches(shown, pattern)) misses.push(`turn ${item.turn} forbid: ${pattern}`);
    }
    if (item.verification === "unverified") misses.push(`turn ${item.turn} unverified row`);
  }
  if (spec.store.kind === "blank") {
    for (const item of snaps) {
      if (item.locationId) misses.push(`turn ${item.turn} store id ${item.locationId}`);
      if (item.locationCandidates.length > 0) misses.push(`turn ${item.turn} store choices ${item.locationCandidates.join("/")}`);
    }
  } else if (
    spec.store.kind === "match" &&
    early &&
    !matches(`${early.locationName ?? ""} ${early.locationId ?? ""}`, spec.store.pattern)
  ) {
    misses.push(`store: ${early.locationName ?? ""} ${early.locationId ?? ""}`);
  }
  if (spec.offense && !matches(snaps.map((item) => `${item.issue ?? ""}\n${item.content}`).join("\n"), spec.offense)) {
    misses.push(`offense: ${snaps.map((item) => item.issue ?? "none").join(" | ")}`);
  }
  if (spec.policy) {
    const policy = spec.policy;
    const cited = snaps.filter((item) => item.turn >= policy.fromTurn).map(blob).join("\n");
    const page = `p\\.?\\s*${policy.page}\\b`;
    if (!matches(cited, policy.heading) || !matches(cited, page)) {
      misses.push(`policy ${policy.heading} p.${policy.page}: ${snaps.map((item) => item.citation).join(" | ")}`);
    }
  }
  for (const turn of spec.showCardOnTurns ?? []) {
    const item = snaps.find((snap) => snap.turn === turn);
    if (!item?.templateKey) misses.push(`turn ${turn} shows a card`);
  }
  if (spec.planOnTurn) {
    const item = snaps.find((snap) => snap.turn === spec.planOnTurn!.turn);
    if (!item || item.planSentences !== spec.planOnTurn.sentences || !item.plan.startsWith(spec.planOnTurn.starts)) {
      misses.push(`action plan: ${item?.plan ?? "none"}`);
    } else if (!item.content.includes(spec.planOnTurn.starts)) {
      misses.push("action plan on the card the manager is shown");
    }
  }
  if (spec.priorOnTurn) {
    const item = snaps.find((snap) => snap.turn === spec.priorOnTurn!.turn);
    if (!matches(blob(item), spec.priorOnTurn.pattern)) misses.push(`prior date: ${(item?.content ?? "").slice(0, 240)}`);
  }
  if (spec.keep && !matches(blob(snaps[0]), spec.keep)) misses.push(`kept detail: ${snaps[0]?.issue ?? "none"}`);
  if (latencyMs > replaySet.latencyBudgetMs) misses.push(`latency ${Math.round(latencyMs)}ms`);
  return misses;
}

function applyFlags(on: boolean) {
  for (const name of FLAGS) {
    if (on) process.env[name] = "1";
    else delete process.env[name];
  }
}

function systemPrompt(arm: "current" | "lkg"): string {
  return buildSystemPrompt({
    assistantName: ACTIVE_BRAND.assistantName,
    brandName: ACTIVE_BRAND.brandName,
    productName: ACTIVE_BRAND.productName,
    locationNoun: "store",
    context: { userName: "Test Manager", locationName: "", todayIso: TODAY },
    mode: "standard",
    hasContext: true,
    // The last-known-good arm is the pre-295d573 text. Flags stay on either way.
    typedName: arm === "current",
    policyCitation: arm === "current",
  });
}

function promptHash(arm: "current" | "lkg"): string {
  return createHash("sha256").update(systemPrompt(arm)).digest("hex");
}

beforeEach(async () => {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  state.directory = [];
  for (const name of FLAGS) {
    if (!saved.has(name)) saved.set(name, process.env[name]);
  }
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-24T18:00:00Z"));
  await ensureTemplateLibrary("system");
});

afterEach(() => {
  vi.useRealTimers();
  for (const name of FLAGS) {
    const value = saved.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

afterAll(() => {
  const file = new URL("./replay-set.json", import.meta.url);
  writeFileSync(
    "/tmp/anti-loop-replay.json",
    JSON.stringify(
      {
        replaySetSha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
        lastKnownGoodPromptCommit: LAST_KNOWN_GOOD_PROMPT,
        promptSha256Current: promptHash("current"),
        promptSha256LastKnownGood: promptHash("lkg"),
        configuredModel: CLAUDE_MODEL,
        runner: replaySet.runner,
        temperature: replaySet.temperature,
        results,
      },
      null,
      2,
    ),
  );
});

async function score(flags: "on" | "off", runs: number, prompt: "current" | "lkg") {
  applyFlags(flags === "on");
  const promptSha256 = promptHash(prompt);
  for (let run = 1; run <= runs; run += 1) {
    for (const spec of cases) {
      const started = performance.now();
      const { snaps, events } = await replay(spec.turns);
      const latencyMs = performance.now() - started;
      const misses = judge(spec, snaps, latencyMs);
      results.push({
        id: spec.id,
        flags,
        prompt,
        promptSha256,
        run,
        pass: misses.length === 0,
        misses,
        events,
        latencyMs,
      });
    }
  }
}

function missCount(rows: CaseResult[]): number {
  return Math.max(...rows.map((row) => row.misses.length));
}

describe("anti-loop replay b9–b12", () => {
  it("scores the current prompt and the last-known-good prompt on the same code and flags", async () => {
    const currentText = systemPrompt("current");
    const lkgText = systemPrompt("lkg");
    expect(lkgText).toContain("ask for their full name");
    expect(lkgText).not.toContain("Use it exactly as typed");
    expect(currentText).toContain("Use it exactly as typed");
    expect(currentText).toContain("Every form cites the policy by its name and printed page");
    expect(currentText).not.toBe(lkgText);

    await score("on", replaySet.runsRequired, "current");
    await score("on", replaySet.runsRequired, "lkg");

    const current = results.filter((row) => row.flags === "on" && row.prompt === "current");
    const lkg = results.filter((row) => row.flags === "on" && row.prompt === "lkg");
    const failed = current.filter((row) => !row.pass);
    expect(failed.map((row) => `${row.id}#${row.run}: ${row.misses.join("; ")}`)).toEqual([]);
    expect(current).toHaveLength(cases.length * replaySet.runsRequired);
    expect(lkg).toHaveLength(cases.length * replaySet.runsRequired);

    const oldBetter = cases
      .filter((spec) => missCount(lkg.filter((row) => row.id === spec.id)) < missCount(current.filter((row) => row.id === spec.id)))
      .map((spec) => spec.id);
    expect(oldBetter, "last-known-good prompt scored better; revert those prompt sections and keep the code fixes").toEqual([]);

    await score("off", 1, "lkg");
    const off = results.filter((row) => row.flags === "off");
    expect(off).toHaveLength(cases.length);
  });
});
