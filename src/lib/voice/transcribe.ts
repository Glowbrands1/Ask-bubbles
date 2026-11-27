import { z } from "zod";

import { PROVIDER_TIMEOUT_MS, RETRY_MAX_WAIT_MS, RETRY_MIN_REMAINING_MS, ROUTE_MAX_SECONDS } from "./voice-limits";

/**
 * ONE CALL TO ASSEMBLYAI SYNC, WITH PLAIN `fetch` (VOICE_INPUT_ENABLED).
 *
 * `POST https://sync.assemblyai.com/v1/transcribe`, multipart: the clip as `audio` (typed `audio/webm` or `audio/mp4`
 * as recorded) and `config`, a JSON part with the spelling hints (`keyterms_prompt`), a short domain `prompt`, the
 * recent conversation when there is one (`conversation_context`) and English `language_codes`. Headers: the server key
 * as `Authorization`, and `X-AAI-Model: universal-3-6-pro`. Not the Dictation API, and no SDK.
 *
 * THE TEXT IS RETURNED AS THE PROVIDER WROTE IT. Nothing here (or anywhere after) cleans, rewords or corrects it.
 *
 * Timeout 28 s per call (`AbortSignal.timeout`). One retry, for 429, 500, 503 and 504 only, and only when at least
 * 8 s of the route's time remain and the wait the provider asks for is at most 2 s. 400, 401, 413 and 415 are never
 * retried. Every answer carries the numeric HTTP status (0 when no response came: a timeout or a network failure) and
 * an error class: the provider's problem-details `title`, snake-cased. Nothing here logs.
 */

export const SYNC_TRANSCRIBE_URL = "https://sync.assemblyai.com/v1/transcribe";
export const SYNC_WARM_URL = "https://sync.assemblyai.com/v1/warm";
export const SYNC_MODEL = "universal-3-6-pro";
export const VOICE_PROVIDER = "assemblyai";
export const VOICE_ENDPOINT = "sync/v1/transcribe";

export type VoiceMime = "audio/webm" | "audio/mp4" | "audio/ogg" | "audio/wav";

export interface TranscribeInput {
  readonly audio: Uint8Array;
  readonly mime: VoiceMime;
  readonly keyterms: readonly string[];
  readonly prompt: string;
  readonly conversationContext?: readonly string[] | null;
}

export interface TranscribeDeps {
  readonly apiKey: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  /** When the route must have answered (epoch ms). Defaults to ROUTE_MAX_SECONDS from the call. */
  readonly deadlineAt?: number;
  readonly timeoutMs?: number;
}

export interface TranscribeResult {
  /** The provider's text, untouched. Empty on every failure. */
  readonly text: string;
  readonly audioSeconds: number | null;
  /** `response.status` of the last attempt; 0 when no response came. */
  readonly status: number;
  /** Null on success; otherwise the problem-details title snake-cased, or `timeout`, `network_error`, `invalid_response`. */
  readonly errorClass: string | null;
  readonly retried: boolean;
  /** The provider's Retry-After, in seconds, when it sent one. */
  readonly retryAfterSeconds?: number;
}

const RETRYABLE = new Set([429, 500, 503, 504]);
const DEFAULT_RETRY_WAIT_MS = 500;

const SuccessBody = z.object({
  text: z.string().nullish(),
  /* The clip's length in MILLISECONDS (the Sync API reference, 27 Nov 2026). */
  audio_duration_ms: z.number().nonnegative().nullish(),
});

const ProblemBody = z.object({ title: z.string().min(1).max(200) });

/** "Too Many Requests" -> "too_many_requests". */
export function snakeCase(title: string): string {
  return title
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .slice(0, 80);
}

function retryAfterMs(response: Response): number | null {
  const raw = response.headers.get("retry-after");
  if (raw === null) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

async function errorClassOf(response: Response): Promise<string> {
  try {
    const parsed = ProblemBody.safeParse(await response.json());
    if (parsed.success) {
      const named = snakeCase(parsed.data.title);
      if (named) return named;
    }
  } catch {
    /* Not JSON: named by its status below. */
  }
  return `http_${response.status}`;
}

function body(input: TranscribeInput): FormData {
  const form = new FormData();
  form.append("audio", new Blob([input.audio as BlobPart], { type: input.mime }), input.mime === "audio/mp4" ? "clip.mp4" : "clip.webm");
  const config: Record<string, unknown> = {
    keyterms_prompt: [...input.keyterms],
    prompt: input.prompt,
    language_codes: ["en"],
  };
  if (input.conversationContext && input.conversationContext.length > 0) config.conversation_context = [...input.conversationContext];
  form.append("config", new Blob([JSON.stringify(config)], { type: "application/json" }));
  return form;
}

export async function transcribeVoice(input: TranscribeInput, deps: TranscribeDeps): Promise<TranscribeResult> {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadlineAt = deps.deadlineAt ?? now() + ROUTE_MAX_SECONDS * 1000;
  const timeoutMs = deps.timeoutMs ?? PROVIDER_TIMEOUT_MS;

  let retried = false;
  for (let attempt = 0; ; attempt += 1) {
    let response: Response;
    try {
      response = await doFetch(SYNC_TRANSCRIBE_URL, {
        method: "POST",
        headers: { Authorization: deps.apiKey, "X-AAI-Model": SYNC_MODEL },
        body: body(input),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      const timedOut = name === "TimeoutError" || name === "AbortError";
      return { text: "", audioSeconds: null, status: 0, errorClass: timedOut ? "timeout" : "network_error", retried };
    }

    const status = Number(response.status);
    if (response.ok) {
      try {
        const parsed = SuccessBody.safeParse(await response.json());
        if (!parsed.success) return { text: "", audioSeconds: null, status, errorClass: "invalid_response", retried };
        const ms = parsed.data.audio_duration_ms;
        const seconds = typeof ms === "number" ? ms / 1000 : null;
        return { text: parsed.data.text ?? "", audioSeconds: seconds, status, errorClass: null, retried };
      } catch {
        return { text: "", audioSeconds: null, status, errorClass: "invalid_response", retried };
      }
    }

    const wait = retryAfterMs(response);
    const errorClass = await errorClassOf(response);
    const waitMs = wait ?? DEFAULT_RETRY_WAIT_MS;
    const canRetry =
      attempt === 0 &&
      RETRYABLE.has(status) &&
      waitMs <= RETRY_MAX_WAIT_MS &&
      deadlineAt - now() - waitMs >= RETRY_MIN_REMAINING_MS;
    if (!canRetry) {
      return {
        text: "",
        audioSeconds: null,
        status,
        errorClass,
        retried,
        ...(wait === null ? {} : { retryAfterSeconds: Math.max(1, Math.ceil(wait / 1000)) }),
      };
    }
    retried = true;
    await sleep(waitMs);
  }
}
