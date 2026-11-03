import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import PRODUCTION_FLAGS from "@/config/production-flags.json";
import { continuationFor } from "@/lib/forms/proposal-continuation";
import { createId } from "@/lib/utils/id";
import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import { rosterResultFor } from "@/test/roster-result";
import { JBA_MANUAL_CA_CHUNKS } from "@/test/fixtures/jba-manual-ca-sections";
import type { AccessScope, ChatFormProposal, ChatMessage } from "@/types";

/**
 * ============================================================================
 * FORM_PATCH_ALL_PATHS_ENABLED, FLAGS OFF: THE SAME CHATS, BYTE FOR BYTE
 * ============================================================================
 *
 * Step B, all paths (QA, 4 Nov 2026). One script of turns that reaches every
 * path the flag wraps — a correction ("change the date to 10/20"), "fix her
 * last name to …", a redraft of a blank Corrective Action, a same-form copy,
 * and an ordinary answer the honest-reply net rewrites — is run through the
 * real chat and draft routes:
 *
 *   (a) every Step B flag unset;
 *   (b) only FORM_PATCH_ALL_PATHS_ENABLED set — inert without the reducer;
 *   (c) FORM_PATCH_REDUCER_ENABLED on, FORM_PATCH_ALL_PATHS_ENABLED unset.
 *
 * Each run on production's flags (so the copy, the name words and the honest
 * reply are on, as they are live), and (a) and (b) once more with nothing set
 * at all. `form-reducer-paths` is never loaded; the replies, the saved rows and
 * the events of (a) and (b) are byte-equal; and (a) and (c) equal what main
 * (87c1763, before this flag) did with the same script, recorded in
 * `form-patch-all-paths-flags-off.main.json` (`RECORD_MAIN_FIXTURE=1` on main
 * rewrites it). Ids are numbered in order of first appearance.
 */

const loaded = vi.hoisted(() => ({ paths: 0 }));
vi.mock("@/lib/forms/form-reducer-paths", async (importOriginal) => {
  loaded.paths += 1;
  return importOriginal();
});

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

const state = vi.hoisted(() => ({ draft: {} as Record<string, unknown>, answer: null as string | null }));

const DIRECTORY = [
  { id: "ap-pat", firstName: "Pat", lastName: "Rivera", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" },
  { id: "ap-wren", firstName: "Wrenna", lastName: "Ashgrove", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" },
  { id: "ap-bryony", firstName: "Bryony", lastName: "Castellane", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" },
  { id: "ap-tamsin", firstName: "Tamsin", lastName: "Rookwood", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" },
];

vi.mock("@/lib/forms/form-patch-call", () => ({
  FORM_PATCH_DEFAULT_TIMEOUT_MS: 5_000,
  formPatchTimeoutMs: () => 5_000,
  callFormPatchModel: async () => ({ fallback: "error" }),
}));
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
  supabaseReadiness: () => ({ ready: true, missing: [] }),
}));
vi.mock("@/lib/auth/server", () => ({
  authorizeRequest: async (_request: Request, permission: string) => ({
    identity: {
      subject: "qa-manager",
      email: "qa-manager@example.test",
      displayName: "QA Manager",
      role: "location_manager",
      scope: { level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: [] },
      verified: true,
    },
    permission,
    provider: "supabase",
  }),
}));
vi.mock("@/lib/analytics/record", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics/record")>()),
  openTurn: async () => "turn-qa",
  closeTurn: async () => {},
  recordActivity: async () => {},
  recordActivityAsync: () => {},
}));
vi.mock("@/lib/ai/call-claude", () => ({
  // The replay pack's reader: no name is read by the model; the app's own readers find it.
  callClaudeToolTimed: async () => ({ input: { employee: null, incident: null, incidentDate: null }, usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 } }),
  callClaude: async () => state.answer ?? "A grounded answer from the policy manual.",
  callClaudeTool: async (input: { tool?: { name?: string }; messages?: unknown }) => {
    if (input.tool?.name === "extract_form_fields") {
      const text = JSON.stringify(input.messages ?? []).toLowerCase();
      return { templateKey: text.includes("coaching") ? "coaching" : "dpoa", employeeName: null, observation: null, actionPlan: null };
    }
    return null;
  },
}));
vi.mock("@/lib/ai/anthropic", () => ({
  getAnthropicClient: () => ({
    messages: {
      create: async (request: { tool_choice?: { name?: string } }) => ({
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            name: request.tool_choice?.name === "revise_form_fields" ? "revise_form_fields" : "write_form_fields",
            input: request.tool_choice?.name === "revise_form_fields" ? { values: {} } : state.draft,
          },
        ],
      }),
    },
  }),
}));
vi.mock("@/lib/knowledge/providers/supabase", () => ({
  SupabaseKnowledgeProvider: class {
    async fetchNamedHandbook() {
      return { ok: false, reason: "offline", problem: "not_found" };
    }
    async search() {
      return [];
    }
    async match() {
      return [];
    }
    async fetchRoleGrounding() {
      return { ok: false, failure: { code: "missing", detail: "not used", missingGroups: [] } };
    }
    async fetchOfficialPolicyManual() {
      return {
        ok: true,
        documentId: "doc-manual",
        documentTitle: "2025 JBA Policy Manual - Edited 5-2025",
        documentCategory: "policies_compliance",
        matchedBy: "tag",
        chunks: JBA_MANUAL_CA_CHUNKS,
      };
    }
  },
}));
vi.mock("@/lib/knowledge/recall-match", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/knowledge/recall-match")>()),
  matchRecallKnowledge: async () => [],
}));
vi.mock("@/lib/reporting/read/report-briefing", () => ({ loadReportBriefing: async () => null }));
vi.mock("@/lib/reporting/read/employee-facts", () => ({
  loadEmployeeFacts: async () => null,
  NO_EMPLOYEE_DATA_REASON: "no dataset",
  NO_EMPLOYEE_DATASET_REASON: "no dataset",
  EMPLOYEE_DATA_HEADING: "CURRENT EMPLOYEE PERFORMANCE DATA",
}));
vi.mock("@/lib/forms/employee-roster", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/forms/employee-roster")>();
  return {
    ...actual,
    readDirectoryFacts: async (scope: AccessScope | null) =>
      actual.scopeRoster(DIRECTORY as never, scope).map((person) => ({ ...person, title: (person as { positionName?: string | null }).positionName ?? null, primaryLocationName: "Kearney, NE" })),
    loadScopedRoster: async (scope: AccessScope | null) => actual.scopeRoster(DIRECTORY as never, scope),
    loadScopedRosterResult: async (scope: AccessScope | null) => rosterResultFor(actual.scopeRoster, DIRECTORY as never, scope),
  };
});
vi.mock("@/lib/forms/prior-forms", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/forms/prior-forms")>()),
  priorFormsReadingForChat: async () => ({ attach: [], possible: [], identity: "none" }),
}));

const STEP_B = ["FORM_PATCH_REDUCER_ENABLED", "FORM_REPLY_FROM_DIFF_ENABLED", "FORM_PATCH_ALL_PATHS_ENABLED"] as const;
const PRODUCTION = [...PRODUCTION_FLAGS.on, ...PRODUCTION_FLAGS.assumedOn];
const TOUCHED = [...new Set([...STEP_B, ...PRODUCTION, ...PRODUCTION_FLAGS.off])];
const saved = new Map<string, string | undefined>();

beforeAll(() => {
  for (const name of TOUCHED) saved.set(name, process.env[name]);
  process.env.NEXT_PUBLIC_DEMO_MODE = "false";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-26T15:30:00Z"));
});
afterAll(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  vi.useRealTimers();
});

function setFlags(base: "production" | "none", on: readonly string[]) {
  for (const name of TOUCHED) delete process.env[name];
  if (base === "production") for (const name of PRODUCTION) process.env[name] = "true";
  for (const name of on) process.env[name] = "true";
}

/* ---------------------------------------------------------- the script --- */

/** The overview view's joined columns (template key, name, version), as the replay pack keeps them. */
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

type Answer = { content: string; formProposal?: ChatFormProposal; formOpened?: { instanceId: string }; formUpdate?: { instanceId: string; updated: string[] } };

async function script(): Promise<string> {
  const { ensureTemplateLibrary } = await import("@/lib/forms/repository");
  const { createInlineForm } = await import("@/features/chat/create-inline-form");
  const chatRoute = await import("@/app/api/chat/route");
  const instancesRoute = await import("@/app/api/forms/instances/route");
  const draftRoute = await import("@/app/api/forms/instances/[id]/draft/route");
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  store.form_instances = new JoiningRows() as never;
  state.draft = { values: {} };
  state.answer = null;
  await ensureTemplateLibrary("system");

  const call = async <T,>(url: string, init?: RequestInit): Promise<T> => {
    const request = new Request(`https://app.test${url}`, init);
    const id = url.startsWith("/api/forms/instances/") ? url.split("/")[4]! : null;
    const response = id ? await draftRoute.POST(request, { params: Promise.resolve({ id }) }) : await instancesRoute.POST(request);
    const body = (await response.json()) as T & Record<string, unknown>;
    if (!response.ok) throw new Error(String(body.error ?? response.status));
    return body;
  };
  const toUuid = (id: string) => {
    const uuid = randomUUID();
    for (const table of ["form_instances", "form_instance_values", "form_instance_events"] as const) {
      for (const row of store[table]) {
        if (row.id === id) row.id = uuid;
        if (row.instance_id === id) row.instance_id = uuid;
      }
    }
    return uuid;
  };

  const replies: unknown[] = [];
  const chat = () => {
    const messages: ChatMessage[] = [];
    let proposal: ChatFormProposal | null = null;
    let instanceId: string | null = null;
    const conversationId = createId("conv");
    return {
      get id() {
        return instanceId;
      },
      async say(question: string): Promise<Answer> {
        const response = await chatRoute.POST(
          new Request("https://app.test/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              question,
              mode: "standard",
              history: messages.map(({ id, role, content, formProposal }) => ({ id, role, content, ...(formProposal ? { formProposal } : {}) })),
              questionMessageId: `m${messages.length}`,
              conversationId,
              ...(!instanceId && continuationFor(messages) ? { continueProposalTemplateKey: continuationFor(messages)!.templateKey } : {}),
              ...(instanceId ? { activeFormInstanceId: instanceId } : {}),
            }),
          }),
        );
        const raw = (await response.json()) as Answer;
        const payload = response.headers.get("x-chat-stream") ? (raw as unknown as { body: Answer }).body : raw;
        replies.push({ question, status: response.status, payload });
        messages.push(
          { id: `m${messages.length}`, role: "user", content: question, createdAt: "2026-10-26T12:00:00Z" } as ChatMessage,
          { id: `a${messages.length}`, role: "assistant", content: payload.content, createdAt: "2026-10-26T12:00:01Z", ...(payload.formProposal ? { formProposal: payload.formProposal } : {}) } as ChatMessage,
        );
        if (payload.formProposal) proposal = payload.formProposal;
        return payload;
      },
      async create(): Promise<string> {
        const created = await createInlineForm({ proposal: proposal!, messages, call, onCreated: () => {} });
        instanceId = toUuid(created.reference.instanceId);
        return instanceId;
      },
      type(values: Record<string, string>) {
        for (const [key, value] of Object.entries(values)) {
          const row = store.form_instance_values.find((entry) => entry.instance_id === instanceId && entry.field_key === key);
          if (row) Object.assign(row, { value, filled_by: "manager" });
          else store.form_instance_values.push({ id: `typed-${key}`, instance_id: instanceId, field_key: key, value, checked: [], filled_by: "manager", provenance: {}, updated_at: new Date().toISOString() } as never);
        }
      },
    };
  };

  // 1. A correction: the date it already has.
  const correction = chat();
  await correction.say("create ca form for pat rivera for a register shortage on 10-20-26.");
  await correction.create();
  await correction.say("change the date to 10/20");
  await correction.say("change the date to 10/19");

  // 2. "fix her last name to …" on a Coaching Form.
  const name = chat();
  for (const said of ["Create a coaching form.", "Wrenna", "yes"]) await name.say(said);
  await name.create();
  await name.say("fix her last name to Pike");

  // 5. An ordinary answer that claims an update, on that draft.
  state.answer = "Done — I updated the draft with those details.";
  await name.say("make that update");
  state.answer = null;

  // 3. A redraft of a blank Corrective Action whose account and plan she had typed.
  const redraft = chat();
  await redraft.say("create ca for pat rivera");
  await redraft.create();
  redraft.type({
    observation: "Pat was short at the register by 20 dollars at close on 10-20-26.",
    action_plan: "Pat will count the drawer with a manager at every close for the next 30 days.",
  });
  await redraft.say("she was short at the register by 20 dollars at close on 10-20-26");

  // 4. A same-form copy, asked twice.
  const bryony = chat();
  for (const said of ["Create a coaching form.", "Bryony", "yes"]) await bryony.say(said);
  state.draft = { values: { coaching_details: "Bryony was coached on ship from store: print the packing slip, clip it to the rolling rack in order, then pack." } };
  await bryony.create();
  state.draft = { values: {} };
  const tamsin = chat();
  for (const said of ["Create a coaching form.", "Tamsin", "yes"]) await tamsin.say(said);
  await tamsin.create();
  for (let round = 0; round < 2; round += 1) {
    const reply = await tamsin.say("can you create the same draft that we did with bryony castellane by changing the name and position?");
    if (reply.content.includes("Replace them with")) await tamsin.say("yes, replace them");
  }

  const order = (id: unknown) => store.form_instances.findIndex((row) => row.id === id);
  const rows = store.form_instance_values
    .map((row) => ({ instance: row.instance_id, key: row.field_key, value: row.value ?? null, checked: row.checked ?? [], filledBy: row.filled_by, source: (row.provenance as { source?: unknown } | null)?.source ?? null }))
    // In the order the forms were created, then by key: never by an id, which is random.
    .sort((a, b) => order(a.instance) - order(b.instance) || String(a.key).localeCompare(String(b.key)));
  const forms = store.form_instances.map((row) => ({ id: row.id, employee: row.employee_name, date: row.form_date, status: row.status }));
  const events = store.form_instance_events.map((row) => ({ instance: row.instance_id, kind: row.kind ?? row.event_type ?? null, detail: row.detail ?? null }));
  return numbered({ replies, forms, rows, events });
}

/** Every generated id (UUIDs, the fake's `fake-N`) numbered in order of first appearance, so two runs compare byte for byte. */
function numbered(value: unknown): string {
  const text = JSON.stringify(value, null, 1);
  const ids = new Map<string, string>();
  let out = "";
  let at = 0;
  const hex = "0123456789abcdef";
  const isUuid = (from: number) => {
    if (from + 36 > text.length) return false;
    for (let index = 0; index < 36; index += 1) {
      const char = text[from + index]!;
      const dash = index === 8 || index === 13 || index === 18 || index === 23;
      if (dash ? char !== "-" : !hex.includes(char)) return false;
    }
    return true;
  };
  while (at < text.length) {
    let length = 0;
    if (isUuid(at)) length = 36;
    else if (text.startsWith("fake-", at)) {
      length = 5;
      while ("0123456789".includes(text[at + length] ?? "x")) length += 1;
      if (length === 5) length = 0;
    }
    if (length === 0) {
      out += text[at];
      at += 1;
      continue;
    }
    const id = text.slice(at, at + length);
    if (!ids.has(id)) ids.set(id, `#${ids.size + 1}`);
    out += ids.get(id);
    at += length;
  }
  return out;
}

/* ---------------------------------------------------------------- tests --- */

const FIXTURE = join("src", "lib", "forms", "form-patch-all-paths-flags-off.main.json");

describe("FORM_PATCH_ALL_PATHS_ENABLED off or inert: the same chats, byte for byte", () => {
  const runs: Record<string, string> = {};

  it("(a) every Step B flag unset, (b) only ALL_PATHS set, (c) the reducer on and ALL_PATHS unset — on production's flags", async () => {
    setFlags("production", []);
    runs.a = await script();
    setFlags("production", ["FORM_PATCH_ALL_PATHS_ENABLED"]);
    const flags: Record<string, unknown> = await import("@/lib/config/chat-quality-flags");
    // On main (recording the fixture) the flag does not exist yet.
    if (typeof flags.formPatchAllPathsEnabled === "function") expect(flags.formPatchAllPathsEnabled(), "ALL_PATHS alone must read as off").toBe(false);
    runs.b = await script();
    setFlags("production", ["FORM_PATCH_REDUCER_ENABLED"]);
    runs.c = await script();
    expect(loaded.paths, "form-reducer-paths was loaded").toBe(0);
  }, 240_000);

  it("(a) and (b) once more with nothing set at all", async () => {
    setFlags("none", []);
    runs.noneA = await script();
    setFlags("none", ["FORM_PATCH_ALL_PATHS_ENABLED"]);
    runs.noneB = await script();
    expect(loaded.paths, "form-reducer-paths was loaded").toBe(0);
  }, 240_000);

  it.runIf(process.env.DUMP_RUNS)("dump", () => {
    for (const [name, text] of Object.entries(runs)) writeFileSync(`${process.env.DUMP_RUNS}/${name}.json`, text);
  });

  it("the script reached each wrapped path (so the runs below compare something)", () => {
    for (const text of [
      "Updated the **Corrective Action Form** for **Pat Rivera**: Date → 2026-10-20",
      "Updated the **Coaching Form** for **Wrenna Ashgrove**: Name → Wrenna Pike",
      "Redrafted the **Corrective Action Form**",
      "Copied Bryony Castellane's Coaching Form content onto Tamsin Rookwood's draft",
      "I haven't changed the **Coaching Form** for **Wrenna Ashgrove**",
    ]) {
      expect(runs.a, text).toContain(text);
    }
  });

  it("the replies, the saved rows and the events of (a) and (b) are byte-equal", () => {
    expect(runs.b).toBe(runs.a);
    expect(runs.noneB).toBe(runs.noneA);
  });

  it("(a) and (c) equal main's behaviour with the same script", () => {
    const main = { a: runs.a, c: runs.c, noneA: runs.noneA };
    if (process.env.RECORD_MAIN_FIXTURE === "1") writeFileSync(FIXTURE, `${JSON.stringify(main, null, 1)}\n`);
    expect(existsSync(FIXTURE), `${FIXTURE} is missing`).toBe(true);
    const recorded = JSON.parse(readFileSync(FIXTURE, "utf8")) as typeof main;
    expect(runs.a).toBe(recorded.a);
    expect(runs.noneA).toBe(recorded.noneA);
    expect(runs.c).toBe(recorded.c);
  });

  it("control: the comparison can fail, and the load is recorded", async () => {
    // With the flag really on (reducer + ALL_PATHS), the same script differs from (a) — and loads the module.
    setFlags("production", ["FORM_PATCH_REDUCER_ENABLED", "FORM_PATCH_ALL_PATHS_ENABLED"]);
    const on = await script();
    expect(on).not.toBe(runs.a);
    expect(loaded.paths).toBeGreaterThan(0);
  }, 240_000);
});

/* ------------------------------------------------------- the static scan --- */

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if ((name.endsWith(".ts") || name.endsWith(".tsx")) && !name.endsWith(".test.ts") && !name.endsWith(".test.tsx")) out.push(path);
  }
  return out;
}

describe("form-reducer-paths is loaded only by a guarded `await import(`", () => {
  const MODULE = "form-reducer-paths";
  // The module's specifier as an import names it (a comment names the file, `form-reducer-paths.ts`).
  const SPECIFIER = `${MODULE}")`;
  const files = sources("src").filter((path) => !path.endsWith(`${MODULE}.ts`) && readFileSync(path, "utf8").includes(SPECIFIER));

  it("it is named in the four path modules, nowhere else", () => {
    expect(files.map((path) => path.split("\\").join("/")).sort()).toEqual([
      "src/lib/forms/ca-chat-corrections.ts",
      "src/lib/forms/chat-correction.ts",
      "src/lib/forms/chat-redraft.ts",
      "src/lib/forms/same-form-copy.ts",
    ]);
  });

  it("every mention is `import(\"./form-reducer-paths\")`, awaited, in an expression guarded by `formPatchAllPathsEnabled() ... ?`", () => {
    for (const path of files) {
      const source = readFileSync(path, "utf8");
      expect(source, `${path} imports it statically`).not.toContain(`from "./${MODULE}"`);
      let at = source.indexOf(SPECIFIER);
      while (at >= 0) {
        const lead = source.slice(Math.max(0, at - 400), at);
        expect(lead.endsWith('import("./'), `${path}: not an import() at ${at}`).toBe(true);
        expect(lead.slice(0, -'import("./'.length).trimEnd().endsWith("await (await") || lead.slice(0, -'import("./'.length).trimEnd().endsWith("(await"), `${path}: not awaited at ${at}`).toBe(true);
        const guard = lead.lastIndexOf("formPatchAllPathsEnabled()");
        expect(guard, `${path}: no formPatchAllPathsEnabled() before the import at ${at}`).toBeGreaterThanOrEqual(0);
        const between = lead.slice(guard);
        expect(between.includes("?") && !between.includes(";"), `${path}: the import at ${at} is not inside the guarded expression`).toBe(true);
        at = source.indexOf(SPECIFIER, at + 1);
      }
    }
  });

  it("the new module holds no regular expression", () => {
    const source = readFileSync(join("src", "lib", "forms", `${MODULE}.ts`), "utf8");
    expect(source).not.toContain("RegExp");
    const code = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//") && !line.trim().startsWith("/*"))
      .join("\n");
    for (const marker of [".test(", ".exec(", ".match(", ".replace(/", ".split(/", "= /", "(/"]) expect(code, marker).not.toContain(marker);
  });
});
