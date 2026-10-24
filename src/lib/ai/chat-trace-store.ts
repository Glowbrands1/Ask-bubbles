import { AsyncLocalStorage } from "node:async_hooks";

import { chatTraceRawAnswerEnabled } from "@/lib/config/chat-quality-flags";

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
  errorSubtype: ErrorSubtype | null;
  errorClass: string | null;
  errorStatus: number | null;
  succeeded: boolean | null;
  /**
   * The answer call's text exactly as the model returned it, before citation
   * checks. Set only when CHAT_TRACE_RAW_ANSWER_ENABLED is on.
   */
  rawAnswer?: string;
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

/** The most raw answer text a trace row keeps. */
export const RAW_ANSWER_MAX_CHARS = 20_000;

/**
 * Keep the model's text for the answer call, before any citation check or
 * rewrite, so a citation bug can be replayed from what the model wrote.
 * Does nothing unless a trace is open and CHAT_TRACE_RAW_ANSWER_ENABLED is on.
 */
export function noteRawAnswer(text: string): void {
  if (!chatTraceRawAnswerEnabled()) return;
  const draft = storage.getStore();
  if (!draft) return;
  draft.rawAnswer = text.slice(0, RAW_ANSWER_MAX_CHARS);
}
