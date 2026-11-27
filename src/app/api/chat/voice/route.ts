import { NextResponse } from "next/server";
import { z } from "zod";

import { modelSpendGuard } from "@/lib/ai/spend-guard";
import { withSpendMeter } from "@/lib/ai/spend-meter-run";
import { noteSpendUser } from "@/lib/ai/spend-meter";
import { errorResponse } from "@/lib/api/respond";
import { getRateLimiter, RATE_LIMITS } from "@/lib/api/rate-limit";
import { authorizeRequest } from "@/lib/auth/server";
import { isClientConversationId } from "@/lib/chat/client-ids";
import { l10Viewer, listMyMeetings } from "@/features/l10/data.server";
import { isMeetingKey } from "@/features/l10/lib/config";
import { isSameOriginRequest } from "@/lib/google-reviews/csrf";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { AccessScope, Role } from "@/types";
import { buildChatHints, buildMeetingHints } from "@/lib/voice/keyterms";
import { transcribeVoice, VOICE_ENDPOINT, VOICE_PROVIDER, type VoiceMime } from "@/lib/voice/transcribe";
import { voiceInputEnabledFor, voiceProviderKey } from "@/lib/voice/voice-config";
import { MAX_BYTES, MAX_SECONDS, MIN_BYTES, MIN_SECONDS, ROUTE_MAX_SECONDS } from "@/lib/voice/voice-limits";
import { sniffMime, VOICE_MESSAGES } from "@/lib/voice/voice-messages";
import { chatHintSources, meetingHintSources } from "@/lib/voice/voice-sources.server";
import {
  claimVoiceUsage,
  finishedAudioSeconds,
  finishVoiceUsage,
  spendAudioSeconds,
  voiceTraceRow,
  type RpcClient,
  type VoiceSurface,
} from "@/lib/voice/voice-usage";

/**
 * ============================================================================
 * POST /api/chat/voice — ONE CLIP IN, ITS TEXT OUT (VOICE_INPUT_ENABLED)
 * ============================================================================
 *
 * The one route behind the mic in all four AI chat boxes: main chat ("chat"), the Overview ask band ("overview"), a
 * report's ask bar ("report") and the L10 tab assistant ("l10"). Voice only fills a text box: the text goes back to
 * the box, the person checks it, and Send works as it always did. Nothing here talks to a model.
 *
 * `src/middleware.ts` skips /api, so this route authorizes itself, in this order:
 *   a. same origin (403);
 *   b. the access the calling box already has, checked again here, never taken from the browser's word:
 *        chat / overview / report: `authorizeRequest(request, "ask_questions")`, as /api/chat does (401 / 403);
 *        l10: a verified viewer (`l10Viewer`, else 404) and a meeting the Hub lists for them (`listMyMeetings`, else 404);
 *   c. the pilot gate (`voiceInputEnabledFor`): 404, the same answer as a route that does not exist;
 *   d. a per-person first guard in memory, then the model spend guard (its own sentence);
 *   e. the body, read as a stream and cut at MAX_BYTES, its type and first bytes checked;
 *   f. the usage row (pending, before the vendor), the hints, AssemblyAI, the trace row, `{ text, traceId }`.
 *
 * WHICH BOX IS CALLING TRAVELS IN THE QUERY STRING (`?surface=…&meetingKey=…`), not the multipart body, so that (b)
 * can run before the upload is read (e). Both are validated strictly; an unknown parameter or form field is refused.
 *
 * NOTHING IS KEPT: the audio lives in this request's memory only, no Storage call is made, and no log line carries the
 * transcript, a name, an email or the hint list (counts and codes only). The text is returned as the provider wrote it.
 */

export const runtime = "nodejs";
export const maxDuration = 45;
export const dynamic = "force-dynamic";

const SURFACES = ["chat", "overview", "report", "l10"] as const;

const QuerySchema = z.strictObject({
  surface: z.enum(SURFACES),
  meetingKey: z.string().max(40).optional(),
});

const FieldsSchema = z.strictObject({
  clipSeconds: z
    .string()
    .max(16)
    .regex(/^\d+(\.\d+)?$/)
    .transform(Number)
    .pipe(z.number().finite().nonnegative()),
  conversationId: z.string().max(80).optional(),
});

/** Multipart overhead (boundaries, part headers, the small fields) allowed on top of the clip. */
const FORM_OVERHEAD_BYTES = 64 * 1024;

interface Caller {
  readonly userId: string;
  readonly email: string;
  readonly role: Role;
  readonly scope: AccessScope;
}

type Refusal = { status: number; message: string; code: string; retryAfterSeconds?: number };

function refuse({ status, message, code, retryAfterSeconds }: Refusal): NextResponse {
  return NextResponse.json(
    { error: message, code, ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }) },
    { status, headers: retryAfterSeconds === undefined ? undefined : { "Retry-After": String(retryAfterSeconds) } },
  );
}

const NOT_FOUND: Refusal = { status: 404, message: "Not found.", code: "not_found" };
const UNAVAILABLE: Refusal = { status: 503, message: VOICE_MESSAGES.unavailable, code: "voice_unavailable" };
const BAD_AUDIO: Refusal = { status: 400, message: VOICE_MESSAGES.badAudio, code: "bad_audio" };
const UNSUPPORTED_AUDIO: Refusal = { status: 415, message: VOICE_MESSAGES.badAudio, code: "bad_audio" };
const TOO_LONG: Refusal = { status: 413, message: VOICE_MESSAGES.tooLong, code: "too_long" };
const NOTHING_HEARD: Refusal = { status: 422, message: VOICE_MESSAGES.nothingHeard, code: "no_speech" };

/** One log line per refusal that needs an operator: the code and status only. */
function logCode(code: string, status: number | string): void {
  console.warn(`[POST /api/chat/voice] ${code} ${status}`);
}

export async function POST(request: Request) {
  /*
   * NEVER A BLANK BODY (QA, 27 Nov 2026): anything unexpected (a reader, the Hub, the spend guard) is the plain
   * "not available" sentence, and the log line carries the error's name only, never its message, text or an email.
   */
  try {
    return await withSpendMeter("voice", () => postVoice(request));
  } catch (error) {
    logCode(`unexpected_${error instanceof Error ? error.name.replace(/[^A-Za-z0-9_]/g, "").slice(0, 40) || "Error" : "non_error"}`, 503);
    return refuse(UNAVAILABLE);
  }
}

async function postVoice(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const deadlineAt = startedAt + ROUTE_MAX_SECONDS * 1000 - 2000;

  /* a. Same origin. */
  if (!isSameOriginRequest(request)) return refuse({ status: 403, message: "Cross-site request refused.", code: "forbidden" });

  const query = QuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return refuse(BAD_AUDIO);
  const surface: VoiceSurface = query.data.surface;
  const meetingKey = query.data.meetingKey;
  if (surface === "l10" ? !meetingKey || !isMeetingKey(meetingKey) : meetingKey !== undefined) return refuse(BAD_AUDIO);

  /* b. The calling box's own access, again. */
  let caller: Caller;
  if (surface === "l10") {
    const viewer = await l10Viewer();
    if (!viewer) return refuse(NOT_FOUND);
    let meetings: Awaited<ReturnType<typeof listMyMeetings>>;
    try {
      meetings = await listMyMeetings();
    } catch (error) {
      // The Hub could not be asked: not a refusal of the person, and never a throw.
      logCode(`hub_unavailable_${error instanceof Error ? error.name.replace(/[^A-Za-z0-9_]/g, "").slice(0, 40) : "non_error"}`, 503);
      return refuse(UNAVAILABLE);
    }
    if (!meetings.some((meeting) => meeting.key === meetingKey)) return refuse(NOT_FOUND);
    caller = { userId: viewer.userId, email: viewer.email, role: viewer.role, scope: viewer.scope };
  } else {
    try {
      const context = await authorizeRequest(request, "ask_questions");
      caller = { userId: context.identity.subject, email: context.identity.email, role: context.identity.role, scope: context.identity.scope };
    } catch (error) {
      return errorResponse(error, "POST /api/chat/voice");
    }
  }
  noteSpendUser(caller.userId);

  /* c. The pilot gate: the same 404 as a route that does not exist. */
  if (!voiceInputEnabledFor({ email: caller.email })) return refuse(NOT_FOUND);
  const apiKey = voiceProviderKey();
  if (!apiKey) return refuse(NOT_FOUND);

  /* d. A cheap first guard in memory (the real caps are in the database), then the spend guard. */
  const firstGuard = getRateLimiter().check(`voice:${caller.userId}`, RATE_LIMITS.voice);
  if (!firstGuard.allowed) {
    return refuse({ status: 429, message: VOICE_MESSAGES.perMinute(firstGuard.retryAfterSeconds), code: "rate_limited", retryAfterSeconds: firstGuard.retryAfterSeconds });
  }
  const capped = await modelSpendGuard({ userId: caller.userId, role: caller.role });
  if (capped) return refuse({ status: 429, message: capped.content, code: "spend_limit" });

  /* e. The body: streamed, cut at MAX_BYTES, then its fields, type and first bytes. */
  const read = await readBounded(request, MAX_BYTES + FORM_OVERHEAD_BYTES);
  if (read === "too_large") return refuse(TOO_LONG);
  if (read === null) return refuse(BAD_AUDIO);
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data;/i.test(contentType)) return refuse(UNSUPPORTED_AUDIO);
  let form: FormData;
  try {
    form = await new Response(read as BlobPart, { headers: { "content-type": contentType } }).formData();
  } catch {
    return refuse(BAD_AUDIO);
  }
  const audioPart = form.get("audio");
  const textFields: Record<string, string> = {};
  for (const [name, value] of form.entries()) {
    if (name === "audio") continue;
    if (typeof value !== "string" || name in textFields) return refuse(BAD_AUDIO);
    textFields[name] = value;
  }
  if (form.getAll("audio").length !== 1 || !(audioPart instanceof Blob)) return refuse(BAD_AUDIO);
  const fields = FieldsSchema.safeParse(textFields);
  if (!fields.success) return refuse(BAD_AUDIO);
  const conversationId = fields.data.conversationId;
  if (conversationId !== undefined && (surface === "l10" || !isClientConversationId(conversationId))) return refuse(BAD_AUDIO);
  const clipSeconds = fields.data.clipSeconds;
  if (clipSeconds > MAX_SECONDS + 1) return refuse(TOO_LONG);

  if (audioPart.size > MAX_BYTES) return refuse(TOO_LONG);
  const declared = declaredMime(audioPart.type);
  if (!declared) return refuse(UNSUPPORTED_AUDIO);
  const audio = new Uint8Array(await audioPart.arrayBuffer());
  if (sniffMime(audio) !== declared) return refuse(UNSUPPORTED_AUDIO);
  if (audio.byteLength < MIN_BYTES || clipSeconds < MIN_SECONDS) return refuse(NOTHING_HEARD);

  /* f. The pending usage row, BEFORE the vendor. Fails closed. */
  let rpc: RpcClient;
  try {
    rpc = getSupabaseAdmin() as unknown as RpcClient;
  } catch {
    logCode("usage_unavailable", 503);
    return refuse(UNAVAILABLE);
  }
  const storeId = caller.scope.level === "location" ? caller.scope.primaryAreaId : null;
  const claim = await claimVoiceUsage(rpc, { userId: caller.userId, storeId, surface, clipSeconds });
  switch (claim.kind) {
    case "claimed":
      break;
    case "user_minute":
      return refuse({ status: 429, message: VOICE_MESSAGES.perMinute(claim.retryAfterSeconds), code: "rate_limited", retryAfterSeconds: claim.retryAfterSeconds });
    case "user_day":
      return refuse({ status: 429, message: VOICE_MESSAGES.userDay, code: "user_limit", retryAfterSeconds: 3600 });
    case "store_day":
      return refuse({ status: 429, message: VOICE_MESSAGES.storeDay, code: "store_limit", retryAfterSeconds: 3600 });
    case "company_day":
      return refuse({ status: 429, message: VOICE_MESSAGES.companyDay, code: "company_limit", retryAfterSeconds: 3600 });
    default:
      logCode("usage_unavailable", 503);
      return refuse(UNAVAILABLE);
  }

  const hints =
    surface === "l10"
      ? await buildMeetingHints(meetingHintSources({ meetingKey: meetingKey as string, scope: caller.scope }))
      : await buildChatHints(conversationId, chatHintSources({ userId: caller.userId, scope: caller.scope }));

  const result = await transcribeVoice(
    { audio, mime: declared, keyterms: hints.keyterms, prompt: hints.prompt, conversationContext: hints.conversationContext },
    { apiKey, deadlineAt },
  );

  const text = result.errorClass === null ? result.text : "";
  const outcome = outcomeOf(result.status, result.errorClass, text);
  const traceId = claim.id;
  // QA, 27 Nov 2026: 0 seconds only after a clear rejection; any other failure keeps the reported length (null).
  await finishVoiceUsage(rpc, { id: claim.id, succeeded: outcome === "ok" || outcome === "no_speech", audioSeconds: finishedAudioSeconds(result) });
  await writeTrace(
    voiceTraceRow({
      userId: caller.userId,
      surface,
      latencyMs: Date.now() - startedAt,
      succeeded: outcome === "ok",
      errorStatus: result.status,
      errorClass: result.errorClass ?? (outcome === "no_speech" ? "no_speech" : null),
      audioSeconds: result.audioSeconds,
      spendAudioSeconds: spendAudioSeconds(result, clipSeconds),
      bytes: audio.byteLength,
      mime: declared,
      keytermCount: hints.keyterms.length,
      retried: result.retried,
      outcome,
      provider: VOICE_PROVIDER,
      endpoint: VOICE_ENDPOINT,
    }),
    traceId,
  );

  switch (outcome) {
    case "ok":
      return NextResponse.json({ text, traceId });
    case "no_speech":
      return refuse(NOTHING_HEARD);
    case "too_long":
      return refuse(TOO_LONG);
    case "bad_audio":
      return refuse(BAD_AUDIO);
    case "busy":
      return refuse({ status: 503, message: VOICE_MESSAGES.busy, code: "voice_busy", retryAfterSeconds: result.retryAfterSeconds ?? 5 });
    case "timeout":
      return refuse({ status: 504, message: VOICE_MESSAGES.timeout, code: "voice_timeout" });
    default:
      logCode(`provider_${result.errorClass ?? "error"}`, result.status);
      return refuse(UNAVAILABLE);
  }
}

type Outcome = "ok" | "no_speech" | "too_long" | "bad_audio" | "busy" | "timeout" | "unavailable";

function outcomeOf(status: number, errorClass: string | null, text: string): Outcome {
  if (errorClass === null) return text.trim() ? "ok" : "no_speech";
  if (errorClass === "timeout" || status === 504) return "timeout";
  if (status === 413) return "too_long";
  if (status === 400 || status === 415) return "bad_audio";
  if (status === 429 || status === 503) return "busy";
  return "unavailable";
}

async function writeTrace(row: Record<string, unknown>, id: string): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin().from("chat_traces").insert({ id, ...row });
    if (error) console.warn("[POST /api/chat/voice] trace insert failed");
  } catch {
    console.warn("[POST /api/chat/voice] trace insert failed");
  }
}

/** The body, read chunk by chunk and abandoned past `limit` whatever Content-Length says. Null when unreadable. */
async function readBounded(request: Request, limit: number): Promise<Uint8Array | "too_large" | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return "too_large";
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        return "too_large";
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

/** The recording's declared type, its parameters (";codecs=opus") ignored. */
function declaredMime(type: string): VoiceMime | null {
  const base = type.split(";")[0]?.trim().toLowerCase();
  if (base === "audio/webm") return "audio/webm";
  if (base === "audio/mp4" || base === "audio/x-m4a" || base === "audio/m4a") return "audio/mp4";
  if (base === "audio/ogg") return "audio/ogg";
  if (base === "audio/wav" || base === "audio/x-wav" || base === "audio/wave") return "audio/wav";
  return null;
}
