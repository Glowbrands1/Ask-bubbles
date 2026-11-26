import {
  COMPANY_AUDIO_SECONDS_PER_DAY,
  PER_STORE_AUDIO_SECONDS_PER_DAY,
  PER_USER_AUDIO_SECONDS_PER_DAY,
  PER_USER_PER_DAY,
  PER_USER_PER_MINUTE,
  USD_PER_HOUR,
  clampClipSeconds,
} from "./voice-limits";

/**
 * THE VOICE CAPS, COUNTED IN THE DATABASE (VOICE_INPUT_ENABLED).
 *
 * `claimVoiceUsage` calls `voice_usage_claim` (migration 20261127001000): one step that counts this person's, this
 * store's and the company's pending plus succeeded clips since Manila midnight (and the person's in the last 60 s) and,
 * when every cap has room, writes a pending row and returns its id. It runs BEFORE the vendor call. A pending row
 * counts as the browser's clip length (clamped) until `finishVoiceUsage` marks it, and is never released.
 *
 * FAILS CLOSED: any read or write error, or an answer that is not one of the expected shapes, is `unavailable`, and the
 * route refuses. The client is the server's admin client, used only after the route's access check passed.
 *
 * The trace row (`voiceTraceRow`) follows `persistSpendRow` in `ai/chat-trace.ts`: intent "voice", no model, no text.
 */

export interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export type VoiceSurface = "chat" | "overview" | "report" | "l10";

export type ClaimOutcome =
  | { kind: "claimed"; id: string }
  | { kind: "user_minute"; retryAfterSeconds: number }
  | { kind: "user_day" }
  | { kind: "store_day" }
  | { kind: "company_day" }
  | { kind: "unavailable" };

export async function claimVoiceUsage(
  client: RpcClient,
  input: { userId: string; storeId: string | null; surface: VoiceSurface; clipSeconds: number; now?: Date },
): Promise<ClaimOutcome> {
  try {
    const { data, error } = await client.rpc("voice_usage_claim", {
      p_user_id: input.userId,
      p_store_id: input.storeId,
      p_surface: input.surface,
      p_clip_seconds: clampClipSeconds(input.clipSeconds),
      p_per_minute: PER_USER_PER_MINUTE,
      p_per_day: PER_USER_PER_DAY,
      p_user_seconds: PER_USER_AUDIO_SECONDS_PER_DAY,
      p_store_seconds: PER_STORE_AUDIO_SECONDS_PER_DAY,
      p_company_seconds: COMPANY_AUDIO_SECONDS_PER_DAY,
      ...(input.now ? { p_now: input.now.toISOString() } : {}),
    });
    if (error || !data || typeof data !== "object") return { kind: "unavailable" };
    const answer = data as { ok?: unknown; id?: unknown; reason?: unknown; retry_after?: unknown };
    if (answer.ok === true && typeof answer.id === "string" && answer.id) return { kind: "claimed", id: answer.id };
    if (answer.ok === false) {
      if (answer.reason === "user_minute") {
        const seconds = Number(answer.retry_after);
        return { kind: "user_minute", retryAfterSeconds: Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 60 };
      }
      if (answer.reason === "user_day" || answer.reason === "store_day" || answer.reason === "company_day") return { kind: answer.reason };
    }
    return { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
}

/** Marks the pending row. A failure is a warning only: the pending row still counts against the caps. */
export async function finishVoiceUsage(
  client: RpcClient,
  input: { id: string; succeeded: boolean; audioSeconds: number | null },
): Promise<void> {
  try {
    const { error } = await client.rpc("voice_usage_finish", {
      p_id: input.id,
      p_status: input.succeeded ? "succeeded" : "failed",
      p_audio_seconds: input.audioSeconds,
    });
    if (error) console.warn("voice.usage: finish failed; the pending row still counts");
  } catch {
    console.warn("voice.usage: finish failed; the pending row still counts");
  }
}

export interface VoiceTraceInput {
  readonly userId: string;
  readonly surface: VoiceSurface;
  readonly latencyMs: number;
  readonly succeeded: boolean;
  readonly errorStatus: number | null;
  readonly errorClass: string | null;
  readonly audioSeconds: number | null;
  readonly bytes: number;
  readonly mime: string;
  readonly keytermCount: number;
  readonly retried: boolean;
  readonly outcome: string;
  readonly provider: string;
  readonly endpoint: string;
}

/** The chat_traces row for one clip: counts and codes only. Never audio, transcript, names, emails or the hints. */
export function voiceTraceRow(input: VoiceTraceInput): Record<string, unknown> {
  const audioSeconds = input.audioSeconds === null ? null : Math.round(input.audioSeconds * 100) / 100;
  return {
    conversation_id: null,
    message_id: null,
    user_id: input.userId,
    original_query: "[voice] transcription",
    intent: "voice",
    model: null,
    latency_ms: Math.max(0, Math.round(input.latencyMs)),
    succeeded: input.succeeded,
    error_status: input.errorStatus === null ? null : Math.trunc(input.errorStatus),
    error_class: input.errorClass,
    slots: {
      voice: {
        provider: input.provider,
        endpoint: input.endpoint,
        surface: input.surface,
        audio_seconds: audioSeconds,
        bytes: input.bytes,
        mime: input.mime,
        keyterm_count: input.keytermCount,
        retried: input.retried,
        outcome: input.outcome,
      },
      spend: [{ source: "voice", audio_seconds: audioSeconds ?? 0, usd_per_hour: USD_PER_HOUR }],
    },
  };
}
