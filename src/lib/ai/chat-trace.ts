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
    formExtraction: null,
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

let chatTraceInsertErrorCount = 0;

/** How many chat_traces inserts came back with a Supabase error. */
export function chatTraceInsertErrors(): number {
  return chatTraceInsertErrorCount;
}

async function persistChatTrace(draft: ChatTraceDraft): Promise<void> {
  try {
    const model = draft.modelCall;
    const { error } = await getSupabaseAdmin().from("chat_traces").insert({
      conversation_id: draft.conversationId,
      message_id: draft.messageId,
      user_id: draft.userId,
      original_query: redactTraceText(draft.originalQuery),
      rewritten_query: draft.rewrittenQuery ? redactTraceText(draft.rewrittenQuery) : null,
      intent: draft.intent,
      retrieved: draft.retrieved,
      retrieval_count: draft.retrievalCount,
      prompt: draft.prompt,
      model: model?.model ?? draft.formExtraction?.model ?? null,
      max_tokens: model?.maxTokens ?? null,
      stop_reason: model?.stopReason ?? null,
      input_tokens: model?.inputTokens ?? draft.formExtraction?.inputTokens ?? null,
      output_tokens: model?.outputTokens ?? draft.formExtraction?.outputTokens ?? null,
      thinking_tokens: model?.thinkingTokens ?? null,
      cache_creation_input_tokens: model?.cacheCreationInputTokens ?? null,
      cache_read_input_tokens: model?.cacheReadInputTokens ?? null,
      first_token_ms: model?.firstTokenMs ?? null,
      latency_ms: model?.latencyMs ?? Date.now() - draft.startedAt,
      error_subtype: draft.errorSubtype,
      error_class: draft.errorClass,
      error_status: draft.errorStatus,
      form_in_progress: draft.formInProgress,
      retryable: model?.retryable ?? false,
      retried: false,
      succeeded: draft.succeeded === true,
      extraction_model: draft.formExtraction?.model ?? null,
      extraction_input_tokens: draft.formExtraction?.inputTokens ?? null,
      extraction_output_tokens: draft.formExtraction?.outputTokens ?? null,
      slots: draft.formExtraction?.slots ?? null,
      // Named only when CHAT_TRACE_RAW_ANSWER_ENABLED set it, so a database
      // without the raw_answer column still takes the row.
      ...(typeof draft.rawAnswer === "string" ? { raw_answer: draft.rawAnswer } : {}),
    });
    if (error) {
      chatTraceInsertErrorCount += 1;
      const code = "code" in error && error.code ? ` (${error.code})` : "";
      console.error(`chat_traces insert failed${code}: ${error.message}`);
    }
  } catch {
    chatTraceInsertErrorCount += 1;
    console.error("chat_traces insert failed");
    // Tracing never changes what the manager sees.
  }
}

export function traceIsOpen(): boolean {
  return chatTraceDraft() !== undefined;
}
