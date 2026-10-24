import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";

import { chatTraceDraft, runChatTrace, type ChatTraceDraft } from "./chat-trace-store";

const SECRET = /sk-ant-[A-Za-z0-9_-]+|sb_secret_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

export function redactTraceText(text: string): string {
  return text.replace(SECRET, "[redacted]").slice(0, 12000);
}

export function openChatTrace(input: {
  readonly conversationId?: string | null;
  readonly messageId?: string | null;
  readonly userId?: string | null;
  readonly originalQuery: string;
  readonly formInProgress: boolean;
}): ChatTraceDraft {
  return {
    startedAt: Date.now(),
    conversationId: input.conversationId ?? null,
    messageId: input.messageId ?? null,
    userId: input.userId ?? null,
    originalQuery: input.originalQuery,
    rewrittenQuery: null,
    intent: null,
    retrievalCount: null,
    retrieved: [],
    prompt: null,
    formInProgress: input.formInProgress,
    modelCall: null,
    errorSubtype: null,
    errorClass: null,
    errorStatus: null,
    succeeded: null,
  };
}

export async function finishChatTrace<T>(draft: ChatTraceDraft, run: () => Promise<T>): Promise<T> {
  try {
    const value = await runChatTrace(draft, run);
    if (draft.succeeded === null) draft.succeeded = draft.errorSubtype === null;
    return value;
  } catch (error) {
    draft.succeeded = false;
    if (!draft.errorClass && error instanceof Error) draft.errorClass = error.name;
    throw error;
  } finally {
    void persistChatTrace(draft);
  }
}

/**
 * The chat_traces row for one turn. Cache counts are copied from
 * `usage.cache_creation_input_tokens` and `usage.cache_read_input_tokens`.
 * A trace is opened only when CHAT_TRACE_ENABLED is on.
 */
export function chatTraceInsert(draft: ChatTraceDraft): Record<string, unknown> {
  const model = draft.modelCall;
  return {
    conversation_id: draft.conversationId,
    message_id: draft.messageId,
    user_id: draft.userId,
    original_query: redactTraceText(draft.originalQuery),
    rewritten_query: draft.rewrittenQuery ? redactTraceText(draft.rewrittenQuery) : null,
    intent: draft.intent,
    retrieved: draft.retrieved,
    retrieval_count: draft.retrievalCount,
    prompt: draft.prompt,
    model: model?.model ?? null,
    max_tokens: model?.maxTokens ?? null,
    stop_reason: model?.stopReason ?? null,
    input_tokens: model?.inputTokens ?? null,
    output_tokens: model?.outputTokens ?? null,
    thinking_tokens: model?.thinkingTokens ?? null,
    cache_creation_input_tokens: model?.cacheCreationInputTokens ?? null,
    cache_read_input_tokens: model?.cacheReadInputTokens ?? null,
    latency_ms: model?.latencyMs ?? Date.now() - draft.startedAt,
    error_subtype: draft.errorSubtype,
    error_class: draft.errorClass,
    error_status: draft.errorStatus,
    form_in_progress: draft.formInProgress,
    retryable: model?.retryable ?? false,
    retried: false,
    succeeded: draft.succeeded === true,
  };
}

async function persistChatTrace(draft: ChatTraceDraft): Promise<void> {
  try {
    await getSupabaseAdmin().from("chat_traces").insert(chatTraceInsert(draft));
  } catch {
    // Tracing never changes what the manager sees.
  }
}

export function traceIsOpen(): boolean {
  return chatTraceDraft() !== undefined;
}
