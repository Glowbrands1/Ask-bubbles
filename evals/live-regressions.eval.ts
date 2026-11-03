import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { CA_CHAIN, LIVE_FAILURE_SCENARIOS, LIVE_ROSTER, NAME_SCENARIOS, type LiveScenario } from "@/app/api/chat/replay-pack/nov4-live-regressions-scenarios";
import { rosterResultFor } from "@/test/roster-result";
import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { AccessScope, ChatFormProposal, ChatMessage } from "@/types";

/**
 * ============================================================================
 * REGRESSION SET #1, LIVE — OPT-IN WITH LIVE=1, NEVER IN CI
 * ============================================================================
 *
 * The replay pack (`src/app/api/chat/replay-pack/nov4-live-regressions-cases.ts`)
 * scripts the models. This runs the SAME scenarios
 * (`nov4-live-regressions-scenarios.ts`) through the real chat route with the
 * REAL model calls of the old path (production's flags, Step B off), and
 * records per case: the old-path reply, the saved diff, the ms, and — once
 * step 3 exists — the new path's.
 *
 *   LIVE=1 npx vitest run --config vitest.eval.config.mts evals/live-regressions.eval.ts
 *
 * Without LIVE=1 every test is skipped and `vitest.eval.config.mts` leaves the
 * file out, so `npm run eval` and CI never load it.
 *
 * MODES (env, read only with LIVE=1):
 *   LIVE_SCENARIOS=all|failures|names|none  which scenarios (default all: the
 *                          live failures first, then the 40 name runs).
 *   LIVE_CREATE_REPEAT=1   also: the same Corrective Action (T1, then Create)
 *                          5 times with Step B's flags OFF and 5 times ON;
 *                          counts the saved Observations that lose "Quill"
 *                          (do not contain "Marnie Quill"). Runs first.
 *   LIVE_NEW_PATH=1        also run each scenario on the new path. PLACEHOLDER:
 *                          step 3's FORM_EDIT_TOOL_IN_STREAM_ENABLED is not
 *                          read by the app yet, so today it equals the old path.
 *
 * SPEND: every model call — the Anthropic client (`getAnthropicClient`, which
 * `callClaude*`, the drafting and the revision calls use) and the AI SDK
 * (`callFormPatchModel`) — goes through one counter that stops at 100 calls
 * per run, with no retries (`maxRetries: 0`). Every call is forced to Haiku
 * (CLAUDE_READER_MODEL): ANTHROPIC_MODEL / ANTHROPIC_HAIKU_MODEL /
 * ANTHROPIC_READER_MODEL are set to it in this process only, and the wrapper
 * overwrites `model` on every request. The base URL is explicit
 * (https://api.anthropic.com), whatever ANTHROPIC_BASE_URL says. Input and
 * output tokens are summed into the results.
 *
 * THE KEY: ANTHROPIC_API_KEY is read from this process's environment only
 * when LIVE=1, when the client is first built. It is never printed, logged or
 * written to the results.
 *
 * Results: evals/results/live-regressions.json and .md (git-ignored).
 */

const LIVE = process.env.LIVE === "1";

const live = vi.hoisted(() => {
  /** CLAUDE_READER_MODEL's default (src/lib/config/models.ts); checked against the module below. */
  const HAIKU = process.env.ANTHROPIC_READER_MODEL || "claude-haiku-5-5";
  if (process.env.LIVE === "1") {
    // This process only, before the app's model config is first imported.
    process.env.ANTHROPIC_MODEL = HAIKU;
    process.env.ANTHROPIC_HAIKU_MODEL = HAIKU;
    process.env.ANTHROPIC_READER_MODEL = HAIKU;
  }
  const meter = {
    HAIKU,
    CAP: 100,
    BASE_URL: "https://api.anthropic.com",
    calls: 0,
    capped: false,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    /** One model call, counted before it is sent; past the cap nothing is sent. */
    take(): void {
      if (process.env.LIVE !== "1") throw new Error("live-regressions: a model call without LIVE=1");
      if (meter.calls >= meter.CAP) {
        meter.capped = true;
        throw new Error(`live-regressions: spend cap reached (${meter.CAP} model calls)`);
      }
      meter.calls += 1;
    },
    add(usage: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } | null | undefined): void {
      if (!usage) return;
      meter.inputTokens += usage.input_tokens ?? 0;
      meter.outputTokens += usage.output_tokens ?? 0;
      meter.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
      meter.cacheWriteTokens += usage.cache_creation_input_tokens ?? 0;
    },
  };
  return meter;
});

const actor = vi.hoisted(() => ({ directory: [] as unknown[] }));

/* -------------------------------------------------- the real model, metered -- */

vi.mock("@/lib/ai/anthropic", async () => {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  let client: InstanceType<typeof Anthropic> | null = null;
  const real = () => {
    if (process.env.LIVE !== "1") throw new Error("live-regressions: a model call without LIVE=1");
    // The key from this process's environment, never logged; the base URL explicit; no retries.
    client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, baseURL: live.BASE_URL, maxRetries: 0 });
    return client;
  };
  type Body = Parameters<InstanceType<typeof Anthropic>["messages"]["create"]>[0];
  type Options = Parameters<InstanceType<typeof Anthropic>["messages"]["create"]>[1];
  const messages = {
    create: async (body: Body, options?: Options) => {
      live.take();
      const response = await real().messages.create({ ...body, model: live.HAIKU } as Body, { ...options, maxRetries: 0 });
      live.add((response as { usage?: Parameters<typeof live.add>[0] }).usage);
      return response;
    },
    stream: (body: Parameters<InstanceType<typeof Anthropic>["messages"]["stream"]>[0], options?: Options) => {
      live.take();
      const stream = real().messages.stream({ ...body, model: live.HAIKU }, { ...options, maxRetries: 0 });
      stream.finalMessage().then(
        (message) => live.add(message.usage),
        () => {},
      );
      return stream;
    },
  };
  return { Anthropic, getAnthropicClient: () => ({ messages }), __setAnthropicClient: () => {} };
});

/* Step B's form-patch model (AI SDK), metered the same way; only reached with Step B's flags on. */
vi.mock("@/lib/forms/form-patch-call", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/forms/form-patch-call")>();
  return {
    ...actual,
    callFormPatchModel: async (input: { system: string; prompt: string; schema: Record<string, unknown> }) => {
      try {
        live.take();
      } catch {
        return { fallback: "error" as const };
      }
      try {
        const { generateObject, jsonSchema } = await import("ai");
        const { createAnthropic } = await import("@ai-sdk/anthropic");
        const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY, baseURL: `${live.BASE_URL}/v1` });
        const result = await generateObject({
          model: anthropic(live.HAIKU),
          schema: jsonSchema(input.schema),
          system: input.system,
          prompt: input.prompt,
          temperature: 0,
          maxOutputTokens: 1500,
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(actual.formPatchTimeoutMs()),
        });
        live.add({ input_tokens: result.usage.inputTokens ?? 0, output_tokens: result.usage.outputTokens ?? 0 });
        return { ok: true as const, output: result.object };
      } catch {
        return { fallback: "error" as const };
      }
    },
  };
});

/* -------------------------------------------- everything else stays local -- */

const store = {
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

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => Object.assign(fakeSupabase(store), { rpc: async () => ({ data: [], error: null }) }),
}));
vi.mock("@/lib/api/respond", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/respond")>();
  return { ...actual, assertLiveMode: () => {}, assertNoConfigurationProblems: () => {}, assertWithinRateLimit: () => {} };
});
vi.mock("@/lib/config/server-env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config/server-env")>();
  return {
    ...actual,
    liveReadiness: () => ({ mode: "live", missing: [], problems: [], ready: true }),
    supabaseReadiness: () => ({ ready: true, missing: [] }),
  };
});
vi.mock("@/lib/auth/server", async () => {
  const { DEFAULT_PERMISSION_MATRIX, hasPermission } = await import("@/lib/permissions");
  const { AuthError } = await import("@/lib/auth/types");
  const { WEST_DODGE: scope } = await import("@/app/api/chat/replay-pack/cases");
  return {
    authorizeRequest: async (_request: Request, permission: string) => {
      if (!hasPermission(DEFAULT_PERMISSION_MATRIX, "location_manager" as never, permission as never)) {
        throw new AuthError("forbidden", "Your role does not have permission to do that.");
      }
      return {
        identity: { subject: "live-regressions", email: "live-regressions@example.test", displayName: "Live Regressions", role: "location_manager", scope, verified: true },
        permission,
        provider: "supabase",
      };
    },
  };
});
vi.mock("@/lib/analytics/record", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics/record")>()),
  openTurn: async () => "turn-live",
  closeTurn: async () => {},
  recordActivity: async () => {},
  recordActivityAsync: () => {},
}));
vi.mock("@/lib/knowledge/providers/supabase", async () => {
  const { manualChunkFromRow } = await import("@/lib/knowledge/full-manual-load");
  const rows = (await import("@/test/fixtures/jba-manual-production-151.json")).default;
  return {
    SupabaseKnowledgeProvider: class {
      async search() {
        return [];
      }
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
vi.mock("@/lib/knowledge/recall-match", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/knowledge/recall-match")>()),
  matchRecallKnowledge: async () => [],
}));
vi.mock("@/lib/knowledge", () => ({
  getKnowledgeProvider: () => {
    throw new Error("not on the server");
  },
}));
vi.mock("@/lib/reporting/read/report-briefing", () => ({ loadReportBriefing: async () => null }));
vi.mock("@/lib/reporting/read/employee-facts", () => ({
  loadEmployeeFacts: async () => null,
  NO_EMPLOYEE_DATA_REASON: "no dataset",
  NO_EMPLOYEE_DATASET_REASON: "no dataset",
  EMPLOYEE_DATA_HEADING: "CURRENT EMPLOYEE PERFORMANCE DATA",
}));
/* The scenario's directory, as the replay pack reads it. */
vi.mock("@/lib/forms/employee-roster", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/forms/employee-roster")>();
  return {
    ...actual,
    readDirectoryFacts: async (scope: AccessScope | null) =>
      actual.scopeRoster(actor.directory as never, scope).map((person) => ({ ...person, title: (person as { positionName?: string | null }).positionName ?? null, primaryLocationName: "Omaha, NE" })),
    loadScopedRoster: async (scope: AccessScope | null) => actual.scopeRoster(actor.directory as never, scope),
    loadScopedRosterResult: async (scope: AccessScope | null) => rosterResultFor(actual.scopeRoster, actor.directory as never, scope),
  };
});
vi.mock("@/lib/forms/prior-forms", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/forms/prior-forms")>()),
  priorFormsReadingForChat: async () => ({ attach: [], possible: [], identity: "none" }),
}));

process.env.NEXT_PUBLIC_DEMO_MODE = "false";
vi.setConfig({ hookTimeout: 120_000, testTimeout: 1_800_000 });

/* ------------------------------------------------------------------ flags -- */

const PRODUCTION_FLAGS = JSON.parse(readFileSync("src/config/production-flags.json", "utf8")) as { on: string[]; assumedOn?: string[]; off?: string[] };
const PRODUCTION = [...new Set([...PRODUCTION_FLAGS.on, ...(PRODUCTION_FLAGS.assumedOn ?? [])])];
const STEP_B_FLAGS = ["FORM_PATCH_REDUCER_ENABLED", "FORM_REPLY_FROM_DIFF_ENABLED"];
/** PLACEHOLDER for step 3 (FORM_EDIT_TOOL_IN_STREAM): not read by the app yet. */
const NEW_PATH_FLAGS = ["FORM_EDIT_TOOL_IN_STREAM_ENABLED"];

function setFlags(extra: readonly string[]): () => void {
  const names = [...PRODUCTION, ...(PRODUCTION_FLAGS.off ?? []), ...STEP_B_FLAGS, ...NEW_PATH_FLAGS];
  const saved = new Map(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  for (const name of [...PRODUCTION, ...extra]) process.env[name] = "true";
  return () => {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
}

/* ----------------------------------------------------------------- replay -- */

const TODAY = "2026-10-26";

type Routes = {
  chat: typeof import("@/app/api/chat/route");
  instances: typeof import("@/app/api/forms/instances/route");
  draft: typeof import("@/app/api/forms/instances/[id]/draft/route");
  createInlineForm: typeof import("@/features/chat/create-inline-form").createInlineForm;
  continuationFor: typeof import("@/lib/forms/proposal-continuation").continuationFor;
  ensureTemplateLibrary: typeof import("@/lib/forms/repository").ensureTemplateLibrary;
  createId: typeof import("@/lib/utils/id").createId;
};
let routes: Routes;

type Answer = { content: string; formProposal?: ChatFormProposal; formOpened?: { instanceId: string }; formUpdate?: { instanceId: string; updated: string[] } };

/** The chat route only accepts a UUID for the open form; the fake numbers rows `fake-N`. */
function toUuid(id: string): string {
  if (/^[0-9a-f-]{36}$/.test(id)) return id;
  const uuid = randomUUID();
  for (const table of ["form_instances", "form_instance_values", "form_instance_events"] as const) {
    for (const row of store[table]) {
      if (row.id === id) row.id = uuid;
      if (row.instance_id === id) row.instance_id = uuid;
    }
  }
  return uuid;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const request = new Request(`https://app.test${url}`, init);
  const draft = /^\/api\/forms\/instances\/([^/]+)\/draft$/.exec(url);
  const response = draft
    ? await routes.draft.POST(request, { params: Promise.resolve({ id: draft[1]! }) })
    : url === "/api/forms/instances"
      ? await routes.instances.POST(request)
      : null;
  if (!response) throw new Error(`no route for ${url}`);
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

function values(instanceId: string | null): Record<string, string> {
  if (!instanceId) return {};
  return Object.fromEntries(store.form_instance_values.filter((row) => row.instance_id === instanceId).map((row) => [String(row.field_key), String(row.value ?? "")]));
}

function diff(before: Record<string, string>, after: Record<string, string>): Record<string, { before: string; after: string }> {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return Object.fromEntries([...keys].filter((key) => (before[key] ?? "") !== (after[key] ?? "")).map((key) => [key, { before: before[key] ?? "", after: after[key] ?? "" }]));
}

interface Turn {
  readonly said: string;
  readonly reply: string;
  readonly updated: readonly string[];
  readonly diff: Record<string, { before: string; after: string }>;
}

interface PathRun {
  readonly turns: readonly Turn[];
  /** The last turn's reply: the old path's answer to the scenario's own message. */
  readonly reply: string;
  readonly card: { readonly templateKey: string | null; readonly employeeName: string | null } | null;
  readonly field: string | null;
  readonly fieldValue: string | null;
  readonly ms: number;
  readonly calls: number;
  readonly error: string | null;
}

/** One scenario, every step through the real routes, with `flags` on top of production's. */
async function runScenario(scenario: LiveScenario, extraFlags: readonly string[]): Promise<PathRun> {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  actor.directory = [...scenario.roster];
  const restore = setFlags(extraFlags);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T15:30:00Z`));
  const callsBefore = live.calls;
  const started = performance.now();
  const messages: ChatMessage[] = [];
  const conversationId = routes.createId("conv");
  const turns: Turn[] = [];
  let proposal: ChatFormProposal | null = null;
  let instanceId: string | null = null;
  let error: string | null = null;
  try {
    await routes.ensureTemplateLibrary("system");
    for (const [index, step] of scenario.steps.entries()) {
      if ("create" in step) {
        if (!proposal) throw new Error("no card to create from");
        const result = await routes.createInlineForm({ proposal, messages, call, onCreated: () => {} });
        instanceId = toUuid(result.reference.instanceId);
        continue;
      }
      const before = values(instanceId);
      const id = `m${index}`;
      const continuation = routes.continuationFor(messages);
      const response = await routes.chat.POST(
        new Request("https://app.test/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            question: step.say,
            mode: "standard",
            history: messages.map(({ id: messageId, role, content, formProposal }) => ({ id: messageId, role, content, ...(formProposal ? { formProposal } : {}) })),
            questionMessageId: id,
            conversationId,
            ...(!instanceId && continuation ? { continueProposalTemplateKey: continuation.templateKey } : {}),
            ...(instanceId ? { activeFormInstanceId: instanceId } : {}),
          }),
        }),
      );
      const payload = (await response.json()) as Answer & { error?: string };
      if (response.status !== 200) throw new Error(`"${step.say}": HTTP ${response.status} ${payload.error ?? ""}`.trim());
      if (payload.formProposal) proposal = payload.formProposal;
      if (payload.formOpened) instanceId = toUuid(payload.formOpened.instanceId);
      messages.push(
        { id, role: "user", content: step.say, createdAt: `${TODAY}T15:30:00Z` } as ChatMessage,
        { id: `a${index}`, role: "assistant", content: payload.content, createdAt: `${TODAY}T15:30:01Z`, ...(payload.formProposal ? { formProposal: payload.formProposal } : {}) } as ChatMessage,
      );
      turns.push({ said: step.say, reply: payload.content, updated: payload.formUpdate?.updated ?? [], diff: diff(before, values(instanceId)) });
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  } finally {
    restore();
    vi.useRealTimers();
  }
  const saved = values(instanceId);
  return {
    turns,
    reply: turns.at(-1)?.reply ?? "",
    card: proposal ? { templateKey: proposal.templateKey ?? null, employeeName: proposal.employeeName ?? null } : null,
    field: scenario.field,
    fieldValue: scenario.field ? (saved[scenario.field] ?? null) : null,
    ms: Math.round(performance.now() - started),
    calls: live.calls - callsBefore,
    error,
  };
}

/* ---------------------------------------------------------------- results -- */

const results: { id: string; oldPath: PathRun; newPath: PathRun | null }[] = [];
const repeat: { off: { saved: string | null; losesQuill: boolean }[]; on: { saved: string | null; losesQuill: boolean }[] } = { off: [], on: [] };

function scenarios(): readonly LiveScenario[] {
  const which = process.env.LIVE_SCENARIOS ?? "all";
  if (which === "none") return [];
  if (which === "failures") return LIVE_FAILURE_SCENARIOS;
  if (which === "names") return NAME_SCENARIOS;
  return [...LIVE_FAILURE_SCENARIOS, ...NAME_SCENARIOS];
}

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 160);

function writeResults(): void {
  mkdirSync("evals/results", { recursive: true });
  const spend = {
    model: live.HAIKU,
    calls: live.calls,
    cap: live.CAP,
    capped: live.capped,
    inputTokens: live.inputTokens,
    outputTokens: live.outputTokens,
    cacheReadTokens: live.cacheReadTokens,
    cacheWriteTokens: live.cacheWriteTokens,
  };
  const lostQuill = { off: repeat.off.filter((run) => run.losesQuill).length, on: repeat.on.filter((run) => run.losesQuill).length };
  writeFileSync("evals/results/live-regressions.json", `${JSON.stringify({ ranAt: new Date().toISOString(), spend, createRepeat: { ...repeat, lostQuill }, scenarios: results }, null, 2)}\n`);
  const lines = [
    "# Live regressions (regression set #1)",
    "",
    `Model ${spend.model}; ${spend.calls}/${spend.cap} calls${spend.capped ? " (CAP REACHED: later calls were not sent)" : ""}; tokens in ${spend.inputTokens}, out ${spend.outputTokens} (cache read ${spend.cacheReadTokens}, write ${spend.cacheWriteTokens}).`,
    "",
  ];
  if (repeat.off.length || repeat.on.length) {
    lines.push(`Create repeat ("${CA_CHAIN[0]}" → Create): Observation loses "Quill" in ${lostQuill.off}/${repeat.off.length} with Step B OFF, ${lostQuill.on}/${repeat.on.length} with Step B ON.`, "");
  }
  lines.push("| Case | Old path reply | Saved diff (last turn) | Card | ms | calls | New path |", "|---|---|---|---|---|---|---|");
  for (const { id, oldPath, newPath } of results) {
    const last = oldPath.turns.at(-1);
    const changed = last ? Object.entries(last.diff).map(([key, value]) => `${key}: ${value.after}`).join("; ") : "";
    const card = oldPath.card ? `${oldPath.card.templateKey ?? "?"} / ${oldPath.card.employeeName ?? "—"}` : "—";
    const fresh = newPath ? cell(newPath.error ?? newPath.reply) : "not available yet";
    lines.push(`| ${id} | ${cell(oldPath.error ? `ERROR ${oldPath.error}` : oldPath.reply)} | ${cell(changed || "—")} | ${cell(card)} | ${oldPath.ms} | ${oldPath.calls} | ${fresh} |`);
  }
  writeFileSync("evals/results/live-regressions.md", `${lines.join("\n")}\n`);
}

/* ------------------------------------------------------------------ tests -- */

describe.skipIf(!LIVE)("live regressions (LIVE=1 only)", () => {
  beforeAll(async () => {
    // Production's flags before the first import: some are read once, when a module loads.
    for (const flag of PRODUCTION) process.env[flag] = "true";
    const models = await import("@/lib/config/models");
    expect([models.CLAUDE_MODEL, models.CLAUDE_HAIKU_MODEL, models.CLAUDE_READER_MODEL], "every model is Haiku in this process").toEqual([live.HAIKU, live.HAIKU, live.HAIKU]);
    routes = {
      chat: await import("@/app/api/chat/route"),
      instances: await import("@/app/api/forms/instances/route"),
      draft: await import("@/app/api/forms/instances/[id]/draft/route"),
      createInlineForm: (await import("@/features/chat/create-inline-form")).createInlineForm,
      continuationFor: (await import("@/lib/forms/proposal-continuation")).continuationFor,
      ensureTemplateLibrary: (await import("@/lib/forms/repository")).ensureTemplateLibrary,
      createId: (await import("@/lib/utils/id")).createId,
    };
  });

  afterAll(() => {
    writeResults();
  });

  it.runIf(process.env.LIVE_CREATE_REPEAT === "1")("the same Corrective Action, created 5 times with Step B off and 5 times on: does the Observation keep \"Marnie Quill\"?", async () => {
    const create: LiveScenario = { id: "create-repeat", roster: LIVE_ROSTER, field: "observation", steps: [{ say: CA_CHAIN[0] }, { create: true }] };
    for (const group of ["off", "on"] as const) {
      for (let run = 0; run < 5 && !live.capped; run += 1) {
        const result = await runScenario(create, group === "on" ? STEP_B_FLAGS : []);
        const saved = result.fieldValue;
        repeat[group].push({ saved, losesQuill: !(saved ?? "").includes("Marnie Quill") });
      }
    }
  });

  it("every scenario through the real chat route, old path (and the new path with LIVE_NEW_PATH=1)", async () => {
    for (const scenario of scenarios()) {
      if (live.capped) break;
      const oldPath = await runScenario(scenario, []);
      const newPath = process.env.LIVE_NEW_PATH === "1" && !live.capped ? await runScenario(scenario, NEW_PATH_FLAGS) : null;
      results.push({ id: scenario.id, oldPath, newPath });
    }
  });
});

