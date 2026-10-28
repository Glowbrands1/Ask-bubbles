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
  errorSubtype: ErrorSubtype | null;
  errorClass: string | null;
  errorStatus: number | null;
  succeeded: boolean | null;
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
