import { AsyncLocalStorage } from "node:async_hooks";

import type { ErrorSubtype, ModelCallSnapshot } from "./model-failure";

export interface RetrievedTraceRow {
  readonly id: string;
  readonly title: string;
  readonly section: string | null;
  readonly score: number;
}

export interface ChatTraceDraft {
  startedAt: number;
  conversationId: string | null;
  messageId: string | null;
  userId: string | null;
  originalQuery: string;
  rewrittenQuery: string | null;
  intent: string | null;
  retrievalCount: number | null;
  retrieved: RetrievedTraceRow[];
  prompt: string | null;
  formInProgress: boolean;
  modelCall: ModelCallSnapshot | null;
  /** The form extraction, when FORM_FULL_REMAP ran. Null on every other turn. */
  formExtraction: {
    model: string;
    inputTokens: number | null;
    outputTokens: number | null;
    slots: Record<string, unknown>;
  } | null;
  /**
   * AI_READS_CODE_CHECKS_ENABLED: the reader's call, written to the trace's
   * `slots.reader` as in the sibling app — `{ model, ms, usage, rejected,
   * filled, disputed }`, or `{ fallback }`. The spend guard counts it from
   * there. Absent when the reader did not run.
   */
  reader?: Record<string, unknown>;
  /** FORM_EDIT_TOOL_IN_STREAM_ENABLED: `slots.form_edit` — keys and reasons only. Absent when the flag is off. */
  formEdit?: Record<string, unknown>;
  /**
   * FORM_EDIT_SINGLE_WRITER_ENABLED: the post-draft consistency check, written
   * to `slots.draft_check` — `{ checked, missing_keys }`, the kinds of fact
   * left out ("name", "date", "amount"), never their values. Absent when the
   * check did not run.
   */
  draftCheck?: Record<string, unknown>;
  /** CARD_CHECKED_AGAINST_WORDS_ENABLED: `slots.card_check` — the kinds of problem, model calls and ms, what was repaired. Never text. */
  cardCheck?: Record<string, unknown>;
  /**
   * CHAT_STAGE_TIMINGS_ENABLED: how long each awaited step of the turn took, written to `slots.stages`. Names and
   * milliseconds only (from the trace's start), never content. Absent when the flag is off.
   */
  stages?: ChatStageTiming[];
  /** CHAT_STAGE_TIMINGS_ENABLED: when the trace started, which `stages` count from. */
  stagesFrom?: number;
  errorSubtype: ErrorSubtype | null;
  errorClass: string | null;
  errorStatus: number | null;
  succeeded: boolean | null;
}

/** CHAT_STAGE_TIMINGS_ENABLED: one awaited step — its name, when it started and how long it took (-1 while open), in ms from the trace's start. */
export interface ChatStageTiming {
  readonly name: string;
  readonly startMs: number;
  readonly ms: number;
}

const storage = new AsyncLocalStorage<ChatTraceDraft>();

export function runChatTrace<T>(draft: ChatTraceDraft, fn: () => Promise<T>): Promise<T> {
  return storage.run(draft, fn);
}

export function updateChatTrace(patch: Partial<ChatTraceDraft>): void {
  const draft = storage.getStore();
  if (!draft) return;
  Object.assign(draft, patch);
}

export function chatTraceDraft(): ChatTraceDraft | undefined {
  return storage.getStore();
}
