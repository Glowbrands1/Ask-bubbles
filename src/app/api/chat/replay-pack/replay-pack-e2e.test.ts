import { STREAM_HEADER, unwrapStreamed } from "@/lib/api/streamed-response";
import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CHAT_QUALITY_FLAG_NAMES } from "@/lib/config/chat-quality-flags";
import { appendFileSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import PRODUCTION_FLAGS from "@/config/production-flags.json";
import type { ReplayContext } from "./cases";
import { CASES } from "./index";
import { continuationFor, offeredCopyForTurn, type OfferedCopy } from "@/lib/forms/proposal-continuation";
import { createId } from "@/lib/utils/id";
import { rosterResultFor } from "@/test/roster-result";
import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import { JBA_MANUAL_CA_CHUNKS } from "@/test/fixtures/jba-manual-ca-sections";
import type { AccessScope, ChatFormProposal, ChatMessage } from "@/types";

/**
 * ============================================================================
 * THE REPLAY PACK — EVERY REPORTED WORDING, WITH PRODUCTION'S FLAGS
 * ============================================================================
 *
 * QA, 3 Nov 2026 (Pau: "This is a repeated problem. I've fixed some of it
 * before but still keep appearing."). Fixes kept landing on one reader or one
 * path, default off, tested with a flag set production does not run — so a
 * new wording slipped past them. Every reported chat is a case here (`cases/`,
 * the manager's exact words, invented people), run through POST /api/chat
 * with the flags in `src/config/production-flags.json`, and asserted as an
 * invariant (no refusal repeated, no "updated" without an update, the card's
 * subject is the person named, …), not as wording.
 *
 * A case still broken in production is `status: "open"`: it is expected to
 * fail, so the day it passes (a flag turned on, a fix merged) the pack says so
 * and the case is moved to "fixed". `fixFlags` are run as well: with them on
 * the case must pass, so a fix cannot miss the path production takes.
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
  // Port from Ask Sunny (board f066, 20 Nov 2026): the deletion record, written by the fake as the BEFORE DELETE trigger writes it.
  form_instance_deletions: [],
} as unknown as FakeStore;

// Production builds with it (NEXT_PUBLIC_, read once when the role table loads): an Assistant Manager may create forms.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_ASSISTANT_MANAGER_CREATE_ENABLED = "true";
});

const revisionAsked = vi.hoisted(() => [] as string[]);
/** What the drafting model was given, per Create. */
const draftAsked = vi.hoisted(() => [] as string[]);
/** The drafting model's system prompt, per Create, as text (CA_SALES_POLICY_ENABLED prompt lines). */
const draftSystemAsked = vi.hoisted(() => [] as string[]);
/** The draft call's tools, as sent (CA_SALES_POLICY_ENABLED adds an optional property). */
const draftToolsAsked = vi.hoisted(() => [] as string[]);
/* `t.fullManual(...)`: the full policy manual this case's policy questions read; none unless a case gives one. */
const fullManual = vi.hoisted(() => ({ document: null as null | { id: string; title: string; chunks: readonly unknown[] } }));
vi.mock("@/lib/knowledge/full-manual-load", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/knowledge/full-manual-load")>();
  const { isPolicyQuestion, planFullManualContext } = await import("@/lib/ai/full-manual-context");
  return {
    ...actual,
    loadFullManualPlan: async (scopeId: string, question: string, policyText?: string) => {
      const document = fullManual.document;
      if (!document) return actual.loadFullManualPlan(scopeId, question, policyText);
      const asked = policyText ?? question;
      const documents = isPolicyQuestion(asked)
        ? [{ id: document.id, title: document.title, category: "policies_compliance", status: "indexed", indexed: true, chunks: document.chunks.map((row) => actual.manualChunkFromRow(row as never)) }]
        : [];
      return planFullManualContext({ question, policyText: asked, documents: documents as never });
    },
  };
});

const state = vi.hoisted(() => ({
  /** POLICY_CARRY_RETRIEVAL (#180 rebuilt, 12 Nov 2026): every knowledge search's query, in order (`searches`). */
  knowledgeQueries: [] as string[],
  /** What the slot model reads on the next turns (`slotsRead`), as a production trace shows it. */
  /** Chunks the pinned manual also has, when a case sets them (`manualAlsoHas`); none by default. */
  manualExtra: [] as Record<string, unknown>[],
  slotsRead: {} as Record<string, unknown>,
  slotReading: "none" as "none" | "ca" | "copy",
  remapObservation: null as string | null,
  /** What the form-reading model returns for this turn (extract_form_fields). */
  reading: {} as Record<string, unknown>,
  draft: {} as { values?: Record<string, unknown>; checked?: Record<string, unknown>; [extra: string]: unknown },
  revision: {} as { values?: Record<string, unknown>; checked?: Record<string, unknown>; clear?: string[] },
  revisionCalls: 0,
  draftCalls: 0,
  toolCalls: 0,
  chatModelCalls: 0,
  /** The FORMS ON FILE block the answering model was last given (`lastFormRecords`). */
  lastFormRecords: "",
  /** The REPORT DATA and the system prompt the answering model was last given (`lastReportData`, `lastSystem`). */
  lastReportData: "",
  lastSystem: "",
  directory: [] as unknown[],
}));

/*
 * AGENT_LOOP_ENABLED (the loop port from the sibling app, QA 21 Nov 2026): the case's stand-in model (`t.loopModel`), the
 * roster fault (`t.rosterFails`), and the two switches as they were before the case turned the loop on for its signed-in
 * manager (restored after every case). This app's production runs the loop for nobody yet (`production-flags.json`:
 * AGENT_LOOP_ENABLED off), so a case that never calls `t.loopModel` runs exactly as before.
 */
const loop = vi.hoisted(() => ({
  standIn: null as import("./loop-stand-in").LoopStandIn | null,
  rosterFails: false,
  env: null as null | { enabled: string | undefined; users: string | undefined },
}));

/*
 * STEP B'S FORM-PATCH MODEL (FORM_PATCH_REDUCER_ENABLED), scripted per case:
 * `t.patchWrites([...])` lists the model's raw outputs in the order the calls
 * are made; `null`, or a call past the end, is the call's fallback, and the
 * turn runs on the old path. Only the raw output is scripted: the zod parse,
 * the evidence and date checks, the reducer, the writes and the reload are
 * the real ones.
 */
const patchScript = vi.hoisted(() => ({
  outputs: [] as unknown[],
  calls: 0,
  byLatest: null as Record<string, unknown> | null,
  // EDIT_SEES_SAVED_FORM_ENABLED: the check rounds' outputs (`t.patchChecks`), apart from the readings above.
  checks: [] as unknown[],
  checkCalls: 0,
  // CARD_CHECKED_AGAINST_WORDS_ENABLED: the card check's model outputs (`t.cardChecks`).
  cards: [] as unknown[],
  cardCalls: 0,
}));
vi.mock("@/lib/forms/form-patch-call", () => ({
  FORM_PATCH_DEFAULT_TIMEOUT_MS: 5_000,
  formPatchTimeoutMs: () => 5_000,
  callFormPatchModel: async (input?: { prompt?: string }) => {
    /*
     * EDIT_SEES_SAVED_FORM_ENABLED (coding 6, 13 Nov 2026): a check round (the prompt holds "SAVED AFTER YOUR LAST
     * PATCH") never takes a reading from the script above. It answers `t.patchChecks([...])` in order; past the end,
     * the model confirms the saved form (turn "this_form", no set, no clear). `null` is the call's fallback.
     */
    /*
     * CARD_CHECKED_AGAINST_WORDS_ENABLED (coding 6, 13 Nov 2026): the card check's call (its prompt starts "CARD CHECK")
     * answers `t.cardChecks([...])` in order; past the end, or `null`, it falls back and only the code's checks run.
     */
    if ((input?.prompt ?? "").startsWith("CARD CHECK")) {
      const output = patchScript.cards[patchScript.cardCalls];
      patchScript.cardCalls += 1;
      return output === undefined || output === null ? { fallback: "error" } : { ok: true, output };
    }
    if ((input?.prompt ?? "").includes("SAVED AFTER YOUR LAST PATCH")) {
      const output = patchScript.checkCalls < patchScript.checks.length ? patchScript.checks[patchScript.checkCalls] : { turn: "this_form", set: [], clear: [] };
      patchScript.checkCalls += 1;
      return output === undefined || output === null ? { fallback: "error" } : { ok: true, output };
    }
    /*
     * `t.patchReads` (coding 5, 7 Nov 2026): the reading is picked by the
     * manager's latest message, so a turn another path answers first (a
     * correction, a policy change) never shifts the script.
     */
    if (patchScript.byLatest) {
      patchScript.calls += 1;
      const marker = "LATEST MESSAGE FROM THE MANAGER: ";
      const prompt = input?.prompt ?? "";
      const latest = prompt.slice(prompt.lastIndexOf(marker) + marker.length).trim();
      const output = patchScript.byLatest[latest];
      return output === undefined || output === null ? { fallback: "error" } : { ok: true, output };
    }
    const output = patchScript.outputs[patchScript.calls];
    patchScript.calls += 1;
    return output === undefined || output === null ? { fallback: "error" } : { ok: true, output };
  },
}));

/*
 * `t.failSavesOf` (ported from the sibling app, QA, 9 Nov 2026): a save of the form's values that includes the named
 * field returns an error, as a failed database write would, so a case can make a turn throw part-way.
 */
const faults = vi.hoisted(() => ({ field: null as string | null, strayDraftField: null as string | null }));

/*
 * `t.draftWriteCarries` (coding 6, 10 Nov 2026; DRAFT_WRITE_NEVER_SILENT_ENABLED): the draft route's next write through
 * the one writer also carries this field, once, as a stray value would; the REAL writer then refuses it, and with it
 * the whole write (all or nothing). Every other call is the real `draftWrite`.
 */
vi.mock("@/lib/forms/form-write", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/forms/form-write")>();
  return {
    ...actual,
    draftWrite: ((instanceId, draft, ...rest) => {
      const stray = faults.strayDraftField;
      faults.strayDraftField = null;
      const carried = stray ? { ...draft, values: { ...(draft.values ?? {}), [stray]: "stray" } } : draft;
      return actual.draftWrite(instanceId, carried, ...rest);
    }) as typeof actual.draftWrite,
  };
});
function withFaults<T>(client: T): T {
  return new Proxy(client as object, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop !== "from" || typeof value !== "function") return value;
      return (table: string) => {
        const builder = (value as (name: string) => Record<string, unknown>).call(target, table);
        if (table !== "form_instance_values" || !faults.field) return builder;
        const upsert = builder.upsert as ((rows: unknown, options?: unknown) => unknown) | undefined;
        if (typeof upsert !== "function") return builder;
        return new Proxy(builder, {
          get(inner, key, innerReceiver) {
            if (key !== "upsert") return Reflect.get(inner, key, innerReceiver);
            return (rows: unknown, options?: unknown) =>
              (Array.isArray(rows) ? rows : [rows]).some((row) => (row as { field_key?: string }).field_key === faults.field)
                ? Promise.resolve({ data: null, error: { message: "replay fault" } })
                : upsert.call(inner, rows, options);
          },
        });
      };
    },
  }) as T;
}
vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: () => withFaults(fakeSupabase(store)) }));

vi.mock("@/lib/api/respond", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/respond")>();
  return {
    ...actual,
    assertLiveMode: () => {},
    assertNoConfigurationProblems: () => {},
    assertWithinRateLimit: () => {},
  };
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
  return {
    authorizeRequest: async (_request: Request, permission: string) => {
      const role = (state as { role?: string }).role ?? "district_manager";
      if (!hasPermission(DEFAULT_PERMISSION_MATRIX, role as never, permission as never)) {
        throw new AuthError("forbidden", "Your role does not have permission to do that.");
      }
      return {
        identity: {
          subject: "qa-manager",
          email: "qa-manager@example.test",
          displayName: "QA Manager",
          role,
          scope: (state as { scope?: unknown }).scope ?? { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] },
          verified: true,
        },
        permission,
        provider: "supabase",
      };
    },
  };
});

vi.mock("@/lib/analytics/record", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics/record")>()),
  openTurn: async () => "turn-qa",
  closeTurn: async () => {},
  recordActivity: async () => {},
  recordActivityAsync: () => {},
}));

const ANSWER = "A grounded answer from the policy manual.";
/** What the answering model says this turn, when a case sets it. */
const said = { answer: null as string | null };
/** FORM_EDIT_TOOL_IN_STREAM_ENABLED: the edit_form call the answering model makes next, and the offers it saw. */
const editTool = { input: null as unknown, offered: 0, lastData: null as string | null };

vi.mock("@/lib/ai/call-claude", () => ({
  /*
   * The AI reader (AI_READS_CODE_CHECKS_ENABLED), as the live model reads a
   * lone first name: the name exactly as typed, with its sentence as evidence.
   */
  callClaudeToolTimed: async (input: { messages?: { content?: unknown }[] }) => {
    state.toolCalls += 1;
    const text = JSON.stringify(input.messages ?? []);
    const manager = (text.split("Manager: ").pop() ?? "").split("\n")[0]!.replace(/\\"/g, '"').replace(/"\}.*$/, "");
    const named = String(state.reading.employeeName ?? "");
    const name = /\b(katrin)\b/i.exec(manager)?.[1] ?? (named && manager.toLowerCase().includes(named.toLowerCase()) ? named : null);
    return {
      input: {
        employee: name ? { value: name, evidence: manager } : null,
        incident: /late/.test(manager) ? { value: "late", evidence: manager } : null,
        incidentDate: /10\/20/.test(manager) ? { value: "2026-10-20", evidence: "10/20" } : null,
      },
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    };
  },
  callClaude: async (input?: { system?: string; reportData?: string | null; formRecords?: string | null; formEditTool?: { data: string; onToolUse: (call: unknown) => void } | null }) => {
    state.chatModelCalls += 1;
    state.lastFormRecords = String(input?.formRecords ?? "");
    state.lastReportData = String(input?.reportData ?? "");
    state.lastSystem = String(input?.system ?? "");
    if (input?.formEditTool) {
      editTool.offered += 1;
      editTool.lastData = input.formEditTool.data;
      if (editTool.input !== null) {
        const call = editTool.input;
        editTool.input = null;
        input.formEditTool.onToolUse(call);
      } else if (patchScript.calls < patchScript.outputs.length) {
        /*
         * FORM_EDIT_TOOL_IN_STREAM_ENABLED skips Step B's patch turn: the main
         * model reads the turn instead. A case's scripted patch reading is the
         * same decision made as an edit_form call — "this_form" with its sets
         * (add → append, replace → set) and clears, anything else no call — so
         * the Step B cases run on the tool path with the model's same choices.
         * The ops carry no evidence: the tool's words are the latest message's.
         */
        const output = patchScript.outputs[patchScript.calls] as
          | { turn?: string; set?: { field: string; value?: string; options?: string[]; how?: string }[]; clear?: { field: string }[] }
          | null
          | undefined;
        patchScript.calls += 1;
        const ops = [
          ...(output?.set ?? []).map((entry) => ({ op: entry.how === "replace" ? "set" : "append", field: entry.field, value: entry.options ?? entry.value ?? "" })),
          ...(output?.clear ?? []).map((entry) => ({ op: "clear", field: entry.field })),
        ];
        if (output?.turn === "this_form" && ops.length > 0) input.formEditTool.onToolUse({ ops });
      }
    }
    return said.answer ?? ANSWER;
  },
  callClaudeTool: async (input: { tool?: { name?: string }; messages?: { content?: unknown }[] }) => {
    state.toolCalls += 1;
    if (input.tool?.name === "extract_form_fields") {
      const text = JSON.stringify(input.messages ?? []);
      return {
        templateKey: /follow-?up coaching/i.test(text) ? "follow-up-coaching" : /\b(?:ca|corrective action)\b/i.test(text) ? "dpoa" : null,
        employeeName: null,
        observation: state.remapObservation,
        actionPlan: null,
        ...state.reading,
      };
    }
    if (input.tool?.name !== "record_intent_slots") return null;
    if (state.slotReading === "copy") {
      const text = JSON.stringify(input.messages ?? []);
      // The model reads the whole conversation; the warning level only from an answer to its question.
      const manager = (text.split("Manager:").pop() ?? text).replace(/\n/g, "\n");
      const all = text.split("Manager:").slice(1).map((turn) => turn.split("Assistant:")[0]!).join("\n");
      const dates = all.match(/\b\d{1,2}-\d{1,2}\b/g) ?? [];
      return {
        employee: /quinn marlowe/i.test(all) ? "Quinn Marlowe" : null,
        store: /kearney/i.test(all) ? "Kearney" : null,
        title: null,
        incidentType: /\blate\b/i.test(all) ? "late" : null,
        incidentDate: dates[0] ?? null,
        payrollAmount: null,
        warningLevel: /^\s*(verbal|written)\W*$/i.exec(manager)?.[1]?.toLowerCase() ?? null,
        formType: "Corrective Action Form",
        formTurn: true,
        policyHeading: null,
      };
    }
    return {
      employee: null,
      store: null,
      title: null,
      incidentType: null,
      incidentDate: null,
      payrollAmount: null,
      warningLevel: null,
      formType: state.slotReading === "ca" ? "Corrective Action Form" : null,
      formTurn: state.slotReading === "ca",
      policyHeading: null,
      ...state.slotsRead,
    };
  },
}));

vi.mock("@/lib/ai/anthropic", () => ({
  getAnthropicClient: () => ({
    messages: {
      create: async (request: { tool_choice?: { name?: string } }) => {
        const revising = request.tool_choice?.name === "revise_form_fields";
        if (!revising) {
          state.draftCalls += 1;
          draftAsked.push(JSON.stringify((request as { messages?: unknown; system?: unknown }).messages ?? []));
          const system = (request as { system?: unknown }).system;
          draftSystemAsked.push(
            typeof system === "string"
              ? system
              : Array.isArray(system)
                ? system.map((block) => (block as { text?: string }).text ?? "").join("\n")
                : "",
          );
          draftToolsAsked.push(JSON.stringify((request as { tools?: unknown }).tools ?? []));
        }
        if (revising) {
          state.revisionCalls += 1;
          revisionAsked.push(JSON.stringify((request as { messages?: unknown }).messages ?? []));
        }
        return {
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              name: revising ? "revise_form_fields" : "write_form_fields",
              input: revising ? state.revision : state.draft,
            },
          ],
        };
      },
    },
  }),
}));

vi.mock("@/lib/knowledge/providers/supabase", () => ({
  SupabaseKnowledgeProvider: class {
    // A seed names the handbook; offline there is none, as a failed lookup.
    async fetchNamedHandbook() {
      return { ok: false, reason: "offline", problem: "not_found" };
    }
    async search() {
      return [];
    }
    async match(query?: { query?: unknown }) {
      state.knowledgeQueries.push(String(query?.query ?? ""));
      return [];
    }
    async fetchRoleGrounding(role: { id: string }) {
      return {
        ok: true,
        grounding: {
          role: { id: role.id },
          documentId: "doc-progression",
          documentTitle: "PERFORMANCE MANAGEMENT FRAMEWORK KB TEXT",
          matchedBy: "tag",
          rows: [
            {
              chunk_id: "pmf-0",
              document_id: "doc-progression",
              document_title: "PERFORMANCE MANAGEMENT FRAMEWORK KB TEXT",
              category: "leadership_coaching",
              locator: "SECTION 2",
              page: null,
              section: null,
              content: "Solve the issue at the lowest appropriate level.",
              similarity: 0,
            },
          ],
          presentGroups: ["escalation_ladder"],
        },
      };
    }
    /*
     * The loop reads the manual's version before its sections (`manualFor`); without this the loop's manual read failed
     * in the pack (every loop card's policy was read_failed). As the sibling app's pack has it (21 Nov 2026).
     */
    async officialPolicyManualVersion() {
      return { documentId: "doc-manual", version: `v-${JSON.stringify(state.manualExtra).length}` };
    }
    async fetchOfficialPolicyManual() {
      return {
        ok: true,
        documentId: "doc-manual",
        documentTitle: "2025 JBA Policy Manual - Edited 5-2025",
        documentCategory: "policies_compliance",
        matchedBy: "tag",
        chunks: [...JBA_MANUAL_CA_CHUNKS, ...state.manualExtra],
      };
    }
  },
}));

/** A question that is not a form request searches the manual; nothing to embed offline. */
vi.mock("@/lib/knowledge/recall-match", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/knowledge/recall-match")>()),
  matchRecallKnowledge: async (input?: { query?: unknown }) => {
    state.knowledgeQueries.push(String(input?.query ?? ""));
    return [];
  },
}));

vi.mock("@/lib/knowledge", () => ({
  getKnowledgeProvider: () => {
    throw new Error("getKnowledgeProvider() is the browser knowledge client and must not be used on the server");
  },
}));

vi.mock("@/lib/reporting/read/report-briefing", () => ({ loadReportBriefing: async () => null }));

/*
 * THE GOOGLE REVIEWS PAGE'S READS (GOOGLE_REVIEWS_IN_CHAT_ENABLED, QA 18 Nov 2026): fixed figures for the week of Mon
 * 16 Nov 2026, every store, so a Google review question reads what the page would and never a database. Every store:
 * 2 reviews this week (both qualifying, 5.0), 4 last week (3 qualifying, 4.5), 6 qualifying month to date of 10.
 */
vi.mock("@/lib/google-reviews/views", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/google-reviews/views")>();
  const { goalContext } = await import("@/lib/google-reviews/goals");
  const { APPROVED_GOOGLE_STORES } = await import("@/config/company/google-reviews");
  return {
    ...actual,
    readGoalData: async () => ({
      context: goalContext("2026-11-18"),
      rows: APPROVED_GOOGLE_STORES.map((entry) => ({
        storeCode: entry.code,
        displayName: entry.displayName,
        monthlyTarget: 10,
        baselineReviewId: `baseline-${entry.code}`,
        baselineReviewTime: "2026-09-01T05:00:00.000Z",
        countFrom: null,
        qualifyingThisWeek: 2,
        qualifyingLastWeek: 3,
        qualifyingMonthToDate: 6,
        historical: 40,
      })),
    }),
    readStoreSummaries: async () =>
      APPROVED_GOOGLE_STORES.map((entry) => ({ storeCode: entry.code, reviewCount: 300, averageRating: 4.6, lastSyncAt: new Date().toISOString(), lastSyncStatus: "complete" })),
    readPeriodTrend: async () => [
      { start: "2026-11-09", reviewCount: 4, qualifyingCount: 3, averageRating: 4.5 },
      { start: "2026-11-16", reviewCount: 2, qualifyingCount: 2, averageRating: 5 },
    ],
    readReviewPage: async () => ({ total: 0, rows: [], page: 1, pageSize: 20 }),
    /* L3, L6 and YTD (19 Nov 2026): every store counted 2 qualifying reviews in each full month this year, 1 so far in Nov. */
    readMonthlyProgress: async () => {
      const { monthlyProgress, progressMonths } = await import("@/lib/google-reviews/monthly-progress");
      const today = "2026-11-18";
      return monthlyProgress(
        progressMonths(today).map((month) => ({
          month,
          rows: APPROVED_GOOGLE_STORES.map((entry) => ({
            storeCode: entry.code,
            displayName: entry.displayName,
            monthlyTarget: 10,
            baselineReviewId: `baseline-${entry.code}`,
            baselineReviewTime: "2025-12-01T06:00:00.000Z",
            countFrom: null,
            qualifyingThisWeek: 0,
            qualifyingLastWeek: 0,
            qualifyingMonthToDate: month === "2026-11" ? 1 : 2,
            historical: 0,
          })),
        })),
        today,
      );
    },
  };
});
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
      // No position on record unless the case gives one: the title is the manager's or asked.
      actual.scopeRoster(state.directory as never, scope).map((person) => ({ ...person, title: (person as { positionName?: string | null }).positionName ?? null, primaryLocationName: "Kearney, NE" })),
    // The turn's roster limit (`withRosterLimit`), as production's loadScopedRoster applies it.
    // AGENT_LOOP_ENABLED: find_staff reads the roster here too (`appConfig().roster.readScoped`); `t.rosterFails()` makes it fail, as a directory outage would.
    loadScopedRoster: async (scope: AccessScope | null) => {
      if (loop.rosterFails) throw new Error("The employee directory could not be read.");
      return actual.withinRosterLimit(actual.scopeRoster(state.directory as never, scope));
    },
    loadScopedRosterResult: async (scope: AccessScope | null) => rosterResultFor(actual.scopeRoster, state.directory as never, scope),
  };
});

vi.mock("@/lib/forms/prior-forms", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/forms/prior-forms")>()),
  priorFormsReadingForChat: async () => ({ attach: [], possible: [], identity: "none" }),
}));

process.env.NEXT_PUBLIC_DEMO_MODE = "false";

vi.setConfig({ hookTimeout: 30_000, testTimeout: 30_000 });

const { ensureTemplateLibrary } = await import("@/lib/forms/repository");
const { stillAsks } = await import("@/lib/forms/reply-guards");
const { createInlineForm } = await import("@/features/chat/create-inline-form");
const { foldName } = await import("@/lib/forms/fold-name");
const chatRoute = await import("../route");
const instancesRoute = await import("../../forms/instances/route");
const draftRoute = await import("../../forms/instances/[id]/draft/route");
/* AGENT_LOOP_ENABLED (ported from the sibling app's pack, QA 21 Nov 2026): the loop's model seam, its directory seam and its manual cache. */
const agentLoopRun = await import("@/lib/ai/agent-loop/run");
const { __setAgentLoopModelForTests } = agentLoopRun;
const { forgetAgentLoopManualForTests, __setAgentLoopDirectoryForTests } = await import("@/lib/ai/agent-loop/tools");
/** The signed-in manager every case runs as (`authorizeRequest` above): the one email a loop case lists. */
const ACTOR_EMAIL = "qa-manager@example.test";

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const request = new Request(`https://app.test${url}`, init);
  const draft = /^\/api\/forms\/instances\/([^/]+)\/draft$/.exec(url);
  const response = draft
    ? await draftRoute.POST(request, { params: Promise.resolve({ id: draft[1]! }) })
    : url === "/api/forms/instances"
      ? await instancesRoute.POST(request)
      : null;
  if (!response) throw new Error(`no route for ${url}`);
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

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

const TODAY = "2026-10-26";

/** Production's flags, from `src/config/production-flags.json`. */
const PRODUCTION = [...PRODUCTION_FLAGS.on, ...PRODUCTION_FLAGS.assumedOn];
/** Not production here: the full remap and the flags QA-6 ran it with, as extra coverage. */
const REMAP_EXTRA = ["FORM_FULL_REMAP_ENABLED"] as const;
const FLAG = "PRIOR_SENTENCE_FIX_ENABLED";
/** FORM_DATE_INCIDENT_ONLY_ENABLED (D3, =0 in production) is pinned by each case, never read from the shell. */
const FIO = "FORM_DATE_INCIDENT_ONLY_ENABLED";
const ALL_FLAGS = [...PRODUCTION, ...CHAT_QUALITY_FLAG_NAMES, "INTENT_EXTRACTION_ENABLED", "SLOT_RETENTION_ENABLED", ...REMAP_EXTRA, FLAG, FIO, "CODE_SLOTS_ENABLED", "POLICY_CITATION_ENABLED", "FORM_STATE_ENABLED", "REMAP_DRAFT_SOURCES_ENABLED", "NEXT_PUBLIC_REMAP_DRAFT_SOURCES_ENABLED", "INTENT_PAYROLL_MANAGER_ONLY_ENABLED", "CHAT_DATA_TOOLS_ENABLED", "CHAT_MEMORY_ENABLED", "EDIT_SEES_SAVED_FORM_ENABLED", "CARD_CHECKED_AGAINST_WORDS_ENABLED"];

type Answer = {
  content: string;
  formProposal?: ChatFormProposal;
  formSelection?: unknown;
  formOpened?: { instanceId: string; revisesInstanceId?: string | null };
  formUpdate?: { instanceId: string; updated: string[] };
  formReply?: { instanceId: string; unwritten?: string; answer?: true };
  pendingCopy?: { fromInstanceId: string };
};

/** The thread as the browser holds it: a card the answer carried stays open. */
class Thread {
  readonly messages: ChatMessage[] = [];
  proposal: ChatFormProposal | null = null;
  instanceId: string | null = null;
  private sequence = 0;
  private offeredCopy: OfferedCopy | undefined;
  // A well-formed client id, so the route keeps the intake state between turns (`isClientConversationId`).
  private readonly conversationId = createId("conv");

  async say(question: string, reading: Record<string, unknown> = {}): Promise<Answer> {
    state.reading = reading;
    // As the browser sends it: the card a message carried, and FORM_EDIT_SOURCE_TURN_ENABLED's `formReply` (`chat-screen.tsx`).
    const history = this.messages.map(({ id, role, content, formProposal, formReply }) => ({
      id,
      role,
      content,
      ...(formProposal ? { formProposal } : {}),
      ...(formReply ? { formReply } : {}),
    }));
    const id = `m${(this.sequence += 1)}`;
    const pendingCopy = offeredCopyForTurn(this.offeredCopy, this.messages);
    this.offeredCopy = undefined;
    const response = await chatRoute.POST(
      new Request("https://app.test/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question,
          mode: "standard",
          history,
          questionMessageId: id,
          conversationId: this.conversationId,
          // As the browser does: the card on screen, or the intake still asking (`continuationFor`).
          ...(!this.instanceId && continuationFor(this.messages) ? { continueProposalTemplateKey: continuationFor(this.messages)!.templateKey } : {}),
          ...(this.instanceId ? { activeFormInstanceId: this.instanceId } : {}),
          // As the browser does (`ClaudeProvider`): the copy the last answer offered (SAME_FORM_COPY_NEW_PERSON_ENABLED).
          ...(pendingCopy ? { pendingCopyFromInstanceId: pendingCopy } : {}),
        }),
      }),
    );
    /*
     * CHAT_RESPONSE_STREAM_ENABLED: an answer slower than START_AFTER_MS comes as one streamed envelope
     * {"status", "body"}; the browser (`ai/claude-provider.ts`) unwraps it, and so does the pack (5 Nov 2026:
     * a slow CA_SALES redraft was recorded as an empty reply because the envelope was read as the answer).
     */
    const streamed = response.headers.get(STREAM_HEADER) === "1" ? unwrapStreamed(await response.text()) : null;
    const payload = (streamed ? streamed.body : await response.json()) as Answer & { error?: string };
    expect(streamed?.status ?? response.status, JSON.stringify(payload)).toBe(200);
    // EVERY REPLY (QA, 3 Nov 2026): "I still need …" is never said unless the reply asks who, which location or which date.
    if (/^I still need\b/m.test(payload.content ?? "")) {
      expect(stillAsks(payload.content), `"I still need" without a question:\n${payload.content}`).not.toBeNull();
    }
    this.messages.push(
      { id, role: "user", content: question, createdAt: `${TODAY}T12:28:00Z` } as ChatMessage,
      {
        id: `a${this.sequence}`,
        role: "assistant",
        content: payload.content,
        createdAt: `${TODAY}T12:28:01Z`,
        ...(payload.formProposal ? { formProposal: payload.formProposal } : {}),
        ...(payload.formReply ? { formReply: payload.formReply } : {}),
      } as ChatMessage,
    );
    if (payload.pendingCopy) this.offeredCopy = { fromInstanceId: payload.pendingCopy.fromInstanceId, answer: payload.content };
    if (payload.formProposal) this.proposal = payload.formProposal;
    if (payload.formOpened) this.instanceId = toUuid(payload.formOpened.instanceId);
    record.turns.push({ question, reply: payload.content ?? "", updated: payload.formUpdate?.updated ?? null });
    return payload;
  }

  /** The card's Create, as the browser does it. */
  async create(): Promise<string> {
    expect(this.proposal, "no card to create from").not.toBeNull();
    const result = await createInlineForm({ proposal: this.proposal!, messages: this.messages, call, onCreated: () => {} });
    this.instanceId = toUuid(result.reference.instanceId);
    return this.instanceId;
  }

  /** Create from the latest card for this person, as pressing Create on that card does (an earlier card still on screen). */
  async createCard(employeeName: string): Promise<string> {
    const message = [...this.messages].reverse().find((entry) => entry.formProposal?.employeeName === employeeName);
    expect(message?.formProposal, `no card for ${employeeName} to create from`).toBeTruthy();
    const result = await createInlineForm({ proposal: message!.formProposal!, messages: this.messages, call, onCreated: () => {} });
    this.instanceId = toUuid(result.reference.instanceId);
    return this.instanceId;
  }

  /** The chat as the browser holds it (for the browser's own readers). */
  get conversation() {
    return this.messages;
  }
}


const saved = new Map<string, string | undefined>();
function joinOverview() {
  for (const row of store.form_instances ?? []) {
    const template = store.form_templates!.find((entry) => entry.id === row.template_id);
    const version = store.form_template_versions.find((entry) => entry.id === row.template_version_id);
    // A row a case puts on file directly (no template in the store) keeps the form it names.
    if (!template && row.template_name) continue;
    Object.assign(row, { template_key: template?.key, template_name: template?.name, layout_family: template?.layout_family, template_version: version?.version });
  }
  /* The overview's employee_name_folded, as migration 20261120002000 defines it (lower(unaccent(employee_name))). */
  for (const row of store.form_instances ?? []) {
    if (typeof row.employee_name === "string") Object.assign(row, { employee_name_folded: foldName(row.employee_name).toLowerCase() });
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
  state.slotReading = "none";
  state.lastFormRecords = "";
  state.lastReportData = "";
  state.lastSystem = "";
  fullManual.document = null;
  state.remapObservation = null;
  state.slotsRead = {};
  state.manualExtra = [];
  state.knowledgeQueries = [];
  state.reading = {};
  state.draft = { values: {} };
  state.revision = { values: {} };
  patchScript.outputs = [];
  patchScript.calls = 0;
  patchScript.byLatest = null;
  patchScript.checks = [];
  patchScript.checkCalls = 0;
  patchScript.cards = [];
  patchScript.cardCalls = 0;
  faults.field = null;
  faults.strayDraftField = null;
  state.directory = [
    { id: "e-1", firstName: "Quinn", lastName: "Marlowe", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-66"], positionName: null },
    { id: "e-2", firstName: "Dale", lastName: "Ferris", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-66"], positionName: null },
    { id: "e-3", firstName: "Ivy", lastName: "Hollis", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-66"], positionName: null },
  ];
  for (const name of ALL_FLAGS) saved.set(name, process.env[name]);
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






const KNOWN_OFF = PRODUCTION_FLAGS.off;

/*
 * `scripts/flag-classify.ts` only (dev, opt-in; nothing changes when unset):
 * FLAG_CLASSIFY_ON names flags turned on in every case on top of production's,
 * and REPLAY_RECORD a JSON-lines file each case appends its record to — the
 * replies, the keys each reply claimed, whether it held, and its ms — so a
 * behaviour change in a case that still passes is seen.
 */
const CLASSIFY_ON = (process.env.FLAG_CLASSIFY_ON ?? "").split(",").map((name) => name.trim()).filter((name) => name !== "");
/*
 * FLAG_CLASSIFY_OFF (coding 6, 13 Nov 2026; dev, opt-in; nothing changes when unset): flags turned OFF in every case,
 * after production's and FLAG_CLASSIFY_ON's — so a general check (CARD_CHECKED_AGAINST_WORDS) can be run against the
 * live failures with their targeted fixes off.
 */
const CLASSIFY_OFF = (process.env.FLAG_CLASSIFY_OFF ?? "").split(",").map((name) => name.trim()).filter((name) => name !== "");
const record: { turns: { question: string; reply: string; updated: string[] | null }[] } = { turns: [] };
async function recorded(id: string, mode: string, run: () => Promise<void>) {
  record.turns = [];
  const at = performance.now();
  let error: string | null = null;
  try {
    await run();
  } catch (thrown) {
    error = String((thrown as Error)?.message ?? thrown).split("\n")[0]!;
    throw thrown;
  } finally {
    if (process.env.REPLAY_RECORD) {
      appendFileSync(process.env.REPLAY_RECORD, `${JSON.stringify({ id, mode, ok: error === null, error, ms: Math.round(performance.now() - at), turns: record.turns })}\n`);
    }
  }
}

function production(extra: readonly string[] = []) {
  extra = [...extra, ...CLASSIFY_ON];
  for (const name of [...ALL_FLAGS, ...KNOWN_OFF, ...extra]) {
    if (!saved.has(name)) saved.set(name, process.env[name]);
    delete process.env[name];
  }
  for (const name of [...PRODUCTION, ...extra]) {
    if (!saved.has(name)) saved.set(name, process.env[name]);
    process.env[name] = "true";
  }
  for (const name of CLASSIFY_OFF) {
    if (!saved.has(name)) saved.set(name, process.env[name]);
    delete process.env[name];
  }
}

function setScope(scope: unknown) {
  (state as { scope?: unknown }).scope = scope;
}
function setRole(role: string | undefined) {
  (state as { role?: string }).role = role;
}
afterEach(() => {
  setScope(undefined);
  setRole(undefined);
  // The loop: off again, its switches as they were, its stand-in and seams cleared, its manual cache forgotten.
  loop.standIn = null;
  loop.rosterFails = false;
  __setAgentLoopModelForTests(null);
  __setAgentLoopDirectoryForTests(null);
  if (loop.env) {
    for (const [name, value] of [["AGENT_LOOP_ENABLED", loop.env.enabled], ["AGENT_LOOP_USERS", loop.env.users]] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    loop.env = null;
  }
  forgetAgentLoopManualForTests();
  said.answer = null;
  editTool.input = null;
  editTool.offered = 0;
  editTool.lastData = null;
  draftAsked.length = 0;
  revisionAsked.length = 0;
  draftSystemAsked.length = 0;
  draftToolsAsked.length = 0;
});

function context(): ReplayContext {
  return {
    thread: () => new Thread(),
    as: (role, scope) => {
      setRole(role);
      setScope(scope);
    },
    directory: (rows) => {
      state.directory = rows as never;
    },
    searches: () => [...state.knowledgeQueries],
    fullManual: (document) => {
      fullManual.document = document;
    },
    draftWrites: (values, checked, extra) => {
      state.draft = { values, ...(checked ? { checked } : {}), ...(extra ?? {}) };
    },
    manualAlsoHas: (chunks) => {
      state.manualExtra = [...chunks];
    },
    revisionWrites: (values, checked) => {
      state.revision = checked ? { values, checked } : { values };
    },
    modelSays: (text) => {
      said.answer = text;
    },
    slotsRead: (slots) => {
      state.slotsRead = slots;
    },
    modelCallsEditTool: (input) => {
      editTool.input = input;
    },
    editToolOffers: () => ({ offered: editTool.offered, lastData: editTool.lastData }),
    patchWrites: (outputs) => {
      patchScript.outputs = [...outputs];
      patchScript.calls = 0;
      patchScript.byLatest = null;
    },
    patchReads: (byLatest) => {
      patchScript.outputs = [];
      patchScript.calls = 0;
      patchScript.byLatest = { ...byLatest };
    },
    patchChecks: (outputs) => {
      patchScript.checks = [...outputs];
      patchScript.checkCalls = 0;
    },
    patchCheckCalls: () => patchScript.checkCalls,
    cardChecks: (outputs) => {
      patchScript.cards = [...outputs];
      patchScript.cardCalls = 0;
    },
    cardCheckCalls: () => patchScript.cardCalls,
    failSavesOf: (field) => {
      faults.field = field;
    },
    draftWriteCarries: (field) => {
      faults.strayDraftField = field;
    },
    calls: () => ({ chat: state.chatModelCalls, draft: state.draftCalls, revision: state.revisionCalls, tool: state.toolCalls, patch: patchScript.calls }),
    forms: () => store.form_instances as never,
    lastFormRecords: () => state.lastFormRecords,
    lastReportData: () => state.lastReportData,
    lastSystem: () => state.lastSystem,
    draftPrompts: () => [...draftAsked],
    revisionPrompts: () =>
      revisionAsked.map((asked) =>
        (JSON.parse(asked) as { content?: unknown }[]).map((message) => (typeof message.content === "string" ? message.content : JSON.stringify(message.content))).join("\n"),
      ),
    draftSystems: () => [...draftSystemAsked],
    draftTools: () => [...draftToolsAsked],
    redraft: (instanceId, notes) =>
      call<Record<string, unknown>>(`/api/forms/instances/${instanceId}/draft`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes, keepManagerValues: true }),
      }),
    typeOnForm: (instanceId, values) => {
      for (const [key, value] of Object.entries(values)) {
        const row = store.form_instance_values.find((entry) => entry.instance_id === instanceId && entry.field_key === key);
        if (row) Object.assign(row, { value, filled_by: "manager" });
        else store.form_instance_values.push({ id: `typed-${key}`, instance_id: instanceId, field_key: key, value, checked: [], filled_by: "manager", provenance: {}, updated_at: new Date().toISOString() } as never);
      }
    },
    values: (instanceId) =>
      Object.fromEntries(store.form_instance_values.filter((row) => row.instance_id === instanceId).map((row) => [String(row.field_key), String(row.value ?? "")])),
    checked: (instanceId) =>
      Object.fromEntries(
        store.form_instance_values
          .filter((row) => row.instance_id === instanceId && Array.isArray(row.checked) && (row.checked as unknown[]).length > 0)
          .map((row) => [String(row.field_key), (row.checked as unknown[]).map(String)]),
      ),

    loopOn: () => process.env.AGENT_LOOP_ENABLED === "true",
    /*
     * The loop's model for this case (a stand-in, `loop-stand-in.ts`), and the loop turned on for this case's signed-in
     * manager only: AGENT_LOOP_ENABLED on, AGENT_LOOP_USERS listing them. Unlike the sibling app, whose production runs
     * the loop, this app's production has it off, so the case turns it on itself; both are restored after the case.
     */
    loopModel: (standIn) => {
      loop.standIn = standIn;
      // The loop's inactive_in_woven fact reads the whole directory (terminated people too) through its own seam.
      __setAgentLoopDirectoryForTests(async () => state.directory as never);
      __setAgentLoopModelForTests(standIn.model);
      if (!loop.env) loop.env = { enabled: process.env.AGENT_LOOP_ENABLED, users: process.env.AGENT_LOOP_USERS };
      process.env.AGENT_LOOP_ENABLED = "true";
      process.env.AGENT_LOOP_USERS = ACTOR_EMAIL;
    },
    rosterFails: () => {
      loop.rosterFails = true;
    },
    watchLoopEntries: () => {
      const spy = vi.spyOn(agentLoopRun, "runAgentTurn");
      return { entered: () => spy.mock.calls.length, stop: () => spy.mockRestore() };
    },
    draftNotYetSaved: (instanceId) => {
      store.form_instance_values = store.form_instance_values.filter((row) => !(row.instance_id === instanceId && row.filled_by === "ai"));
    },
  };
}

/*
 * EVERY NAME IN THE FLAG FILE IS A FLAG THIS APP READS. A typo, or a flag
 * since deleted, would otherwise be "on" in the pack and nowhere else, and the
 * pack would test a production that does not exist.
 */
function sourceText(dir: string): string {
  let out = "";
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out += sourceText(path);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out += readFileSync(path, "utf8");
  }
  return out;
}

/*
 * EVERY FLAG THIS APP READS IS IN THE FLAG FILE (QA's audit of Ask Bubbles, P3, 20 Nov 2026). The check above runs one
 * way only, so 43 *_ENABLED flags the code reads were listed nowhere and the pack quietly ran them off, whatever
 * production had. A flag read in production code (`envFlag("…")` or `process.env.…`; tests, replay cases and src/test
 * are not production) must be in 'on', 'assumedOn', 'off' or 'unknown' ('unknown': never read from Vercel; QA records it).
 */
function productionFlagReads(dir: string, found = new Set<string>()): Set<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== "replay-pack" && path !== join("src", "test")) productionFlagReads(path, found);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) && !entry.endsWith("-cases.ts")) {
      const text = readFileSync(path, "utf8");
      for (const match of text.matchAll(/envFlag\("([A-Z0-9_]+_ENABLED)"\)|process\.env\.([A-Z0-9_]+_ENABLED)\b|process\.env\["([A-Z0-9_]+_ENABLED)"\]/g)) {
        found.add(match[1] ?? match[2] ?? match[3]);
      }
    }
  }
  return found;
}

describe("src/config/production-flags.json", () => {
  const listed = [...PRODUCTION_FLAGS.on, ...PRODUCTION_FLAGS.assumedOn, ...PRODUCTION_FLAGS.off, ...PRODUCTION_FLAGS.unknown];

  it("names only flags this app reads, each once", () => {
    const source = sourceText("src");
    expect(listed.filter((name) => !source.includes(`"${name}"`) && !source.includes(`process.env.${name}`))).toEqual([]);
    expect(listed.filter((name, index) => listed.indexOf(name) !== index)).toEqual([]);
  });

  it("lists every *_ENABLED flag this app's code reads (on, assumedOn, off, or unknown until QA reads it)", () => {
    const unlisted = [...productionFlagReads("src")].filter((name) => !listed.includes(name)).sort();
    expect(unlisted, "add each to production-flags.json: its Vercel value in 'on' or 'off', or 'unknown' until read").toEqual([]);
  });
});

/*
 * REPLAY_PACK_PART (CI only; QA, 9 Nov 2026, thirds since 21 Nov 2026): the flags-off parity run
 * (`src/lib/ai/flags-off-parity.test.ts`) runs the pack as REPLAY_PACK_PARTS children, each with one part of the cases by
 * id ("0" the first, "1" the next, …), so none passes its time budget as the pack grows. Two halves held until 21 Nov
 * 2026, when the first half took 504 s of its 540 s on CI and the next cases pushed it over. Unset, every case runs.
 */
const PART = process.env.REPLAY_PACK_PART;
const PARTS = Number(process.env.REPLAY_PACK_PARTS ?? "1");
const BY_ID = [...CASES].sort((a, b) => a.id.localeCompare(b.id));
const PART_SIZE = Math.ceil(BY_ID.length / PARTS);
const RUN = PART === undefined ? CASES : BY_ID.slice(Number(PART) * PART_SIZE, (Number(PART) + 1) * PART_SIZE);

describe("the replay pack", () => {
  for (const replay of RUN) {
    const title = `${replay.id}: ${replay.title}`;
    if (replay.status === "fixed") {
      it(`${title} — holds with production's flags`, async () => {
        production();
        await recorded(replay.id, "production", () => replay.run(context()));
      });
    } else {
      // Still broken in production: expected to fail. The day it passes, move it to "fixed".
      it.fails(`${title} — OPEN in production (${replay.status.open})`, async () => {
        production();
        await recorded(replay.id, "open", () => replay.run(context()));
      });
    }
    if (replay.fixFlags?.length && replay.fixStatus) {
      // A fix-flag run that fails today (`fixStatus`): expected to fail. The day it passes, drop fixStatus.
      it.fails(`${title} — OPEN with ${replay.fixFlags.join(", ")} on (${replay.fixStatus.open})`, async () => {
        production(replay.fixFlags);
        await recorded(replay.id, `fix-open:${replay.fixFlags!.join(",")}`, () => replay.run(context()));
      });
    } else if (replay.fixFlags?.length) {
      it(`${title} — holds with ${replay.fixFlags.join(", ")} on`, async () => {
        production(replay.fixFlags);
        await recorded(replay.id, `fix:${replay.fixFlags!.join(",")}`, () => replay.run(context()));
      });
    }
  }
});
