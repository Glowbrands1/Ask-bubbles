import { NextResponse } from "next/server";
import { z } from "zod";

import { modelSpendGuard } from "@/lib/ai/spend-guard";
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
import { correctSpokenNames } from "@/lib/voice/spoken-names";
import { mintStreamingToken, readSessionHandle, sessionSeconds, signSessionHandle, streamingSocketUrl, SESSION_MAX_SECONDS } from "@/lib/voice/streaming";
import { VOICE_PROVIDER } from "@/lib/voice/transcribe";
import { voiceInputEnabledFor, voiceProviderKey } from "@/lib/voice/voice-config";
import { VOICE_MESSAGES } from "@/lib/voice/voice-messages";
import { chatHintSources, meetingHintSources } from "@/lib/voice/voice-sources.server";
import { claimVoiceUsage, finishVoiceUsage, voiceTraceRow, type RpcClient, type VoiceSurface } from "@/lib/voice/voice-usage";

/**
 * ============================================================================
 * POST /api/chat/voice/stream — LIVE DICTATION (VOICE_INPUT_ENABLED; ported from the sibling app)
 * ============================================================================
 *
 * The owner, 27 Nov 2026: "it transcribes as you talk then when done, press check mark and auto send". JSON, two
 * steps, each checked like a clip on POST /api/chat/voice (same origin; the calling box's own access; the pilot gate;
 * the first guard and the spend guard; the usage caps):
 *
 *   "start"   claims a usage row for a full session and mints a short-lived AssemblyAI streaming token (`streaming.ts`).
 *             Answers the socket URL (never the API key, never any names) and a session handle signed for this person.
 *             Any failure answers an error the browser reads as "use the recording instead".
 *   "finish"  the final text and how long the socket was open. The row is finished with those seconds, the trace row
 *             written (`endpoint: "streaming"`). For ✓ ("send") the text is respelled against the person's scoped people
 *             and stores (`spoken-names.ts`) and the corrected text answered; for ✕ ("discard") only the trace id.
 *
 * Logs carry codes and counts only: never the text, a name, an email, the token or the handle.
 */

export const runtime = "nodejs";
export const maxDuration = 20;
export const dynamic = "force-dynamic";

const MAX_TEXT = 5_000;

const Where = {
  surface: z.enum(["chat", "overview", "report", "l10"]),
  conversationId: z.string().max(80).optional(),
  meetingKey: z.string().max(40).optional(),
};

const Body = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("start"), ...Where }),
  z.strictObject({
    action: z.literal("finish"),
    ...Where,
    session: z.string().min(10).max(200),
    outcome: z.enum(["send", "discard"]),
    text: z.string().max(MAX_TEXT),
    seconds: z.number().min(0).max(10_000),
  }),
]);

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
    { status, headers: { "Cache-Control": "no-store", ...(retryAfterSeconds === undefined ? {} : { "Retry-After": String(retryAfterSeconds) }) } },
  );
}

const NOT_FOUND: Refusal = { status: 404, message: "Not found.", code: "not_found" };
const UNAVAILABLE: Refusal = { status: 503, message: VOICE_MESSAGES.unavailable, code: "voice_unavailable" };
const STREAM_UNAVAILABLE: Refusal = { status: 503, message: VOICE_MESSAGES.unavailable, code: "stream_unavailable" };
const BAD_REQUEST: Refusal = { status: 400, message: VOICE_MESSAGES.unavailable, code: "bad_request" };

function logCode(code: string, status: number | string): void {
  console.warn(`[POST /api/chat/voice/stream] ${code} ${status}`);
}

export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (error) {
    logCode(`unexpected_${error instanceof Error ? error.name.replace(/[^A-Za-z0-9_]/g, "").slice(0, 40) || "Error" : "non_error"}`, 503);
    return refuse(STREAM_UNAVAILABLE);
  }
}

async function handle(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return refuse({ status: 403, message: "Cross-site request refused.", code: "forbidden" });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return refuse(BAD_REQUEST);
  const body = parsed.data;
  const surface: VoiceSurface = body.surface;
  const { meetingKey, conversationId } = body;
  if (surface === "l10" ? !meetingKey || !isMeetingKey(meetingKey) || conversationId !== undefined : meetingKey !== undefined) return refuse(BAD_REQUEST);
  if (conversationId !== undefined && !isClientConversationId(conversationId)) return refuse(BAD_REQUEST);

  /* The calling box's own access, again (as POST /api/chat/voice). */
  let caller: Caller;
  if (surface === "l10") {
    const viewer = await l10Viewer();
    if (!viewer) return refuse(NOT_FOUND);
    let meetings: Awaited<ReturnType<typeof listMyMeetings>>;
    try {
      meetings = await listMyMeetings();
    } catch {
      logCode("hub_unavailable", 503);
      return refuse(STREAM_UNAVAILABLE);
    }
    if (!meetings.some((meeting) => meeting.key === meetingKey)) return refuse(NOT_FOUND);
    caller = { userId: viewer.userId, email: viewer.email, role: viewer.role, scope: viewer.scope };
  } else {
    try {
      const context = await authorizeRequest(request, "ask_questions");
      caller = { userId: context.identity.subject, email: context.identity.email, role: context.identity.role, scope: context.identity.scope };
    } catch (error) {
      return errorResponse(error, "POST /api/chat/voice/stream");
    }
  }
  if (!voiceInputEnabledFor({ email: caller.email })) return refuse(NOT_FOUND);
  const apiKey = voiceProviderKey();
  if (!apiKey) return refuse(NOT_FOUND);

  let rpc: RpcClient;
  try {
    rpc = getSupabaseAdmin() as unknown as RpcClient;
  } catch {
    logCode("usage_unavailable", 503);
    return refuse(body.action === "start" ? STREAM_UNAVAILABLE : UNAVAILABLE);
  }

  if (body.action === "finish") {
    const usageId = readSessionHandle(apiKey, caller.userId, body.session);
    if (!usageId) return refuse(NOT_FOUND);
    const seconds = sessionSeconds(body.seconds);
    await finishVoiceUsage(rpc, { id: usageId, succeeded: true, audioSeconds: seconds });
    let text = "";
    let vocabularySize = 0;
    if (body.outcome === "send" && body.text.trim()) {
      const hints = await (surface === "l10"
        ? buildMeetingHints(meetingHintSources({ meetingKey: meetingKey as string, scope: caller.scope }))
        : buildChatHints(conversationId, chatHintSources({ userId: caller.userId, scope: caller.scope }))
      ).catch(() => null);
      vocabularySize = hints?.vocabulary?.entries.length ?? 0;
      text = hints?.vocabulary ? correctSpokenNames(body.text, hints.vocabulary) : body.text;
    }
    const outcome = body.outcome === "discard" ? "discarded" : text.trim() ? "ok" : "no_speech";
    await writeTrace(
      voiceTraceRow({
        userId: caller.userId,
        surface,
        latencyMs: 0,
        succeeded: outcome === "ok",
        errorStatus: null,
        errorClass: outcome === "ok" ? null : outcome,
        audioSeconds: seconds,
        spendAudioSeconds: seconds,
        bytes: 0,
        mime: "audio/pcm",
        keytermCount: vocabularySize,
        retried: false,
        outcome,
        provider: VOICE_PROVIDER,
        endpoint: "streaming",
      }),
      usageId,
    );
    console.info(`[POST /api/chat/voice/stream] finish ${body.outcome} seconds=${Math.round(seconds)}`);
    if (body.outcome === "discard") return NextResponse.json({ traceId: usageId }, { headers: { "Cache-Control": "no-store" } });
    if (!text.trim()) return refuse({ status: 422, message: VOICE_MESSAGES.nothingHeard, code: "no_speech" });
    return NextResponse.json({ text, traceId: usageId }, { headers: { "Cache-Control": "no-store" } });
  }

  /* start: the first guard and the spend guard, as a clip. */
  noteSpendUser(caller.userId);
  const firstGuard = getRateLimiter().check(`voice:${caller.userId}`, RATE_LIMITS.voice);
  if (!firstGuard.allowed) {
    return refuse({ status: 429, message: VOICE_MESSAGES.perMinute(firstGuard.retryAfterSeconds), code: "rate_limited", retryAfterSeconds: firstGuard.retryAfterSeconds });
  }
  const capped = await modelSpendGuard({ userId: caller.userId, role: caller.role });
  if (capped) return refuse({ status: 429, message: capped.content, code: "spend_limit" });

  const storeId = caller.scope.level === "location" ? caller.scope.primaryAreaId : null;
  const claim = await claimVoiceUsage(rpc, { userId: caller.userId, storeId, surface, clipSeconds: SESSION_MAX_SECONDS });
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
      return refuse(STREAM_UNAVAILABLE);
  }

  const minted = await mintStreamingToken({ fetch: globalThis.fetch, apiKey });
  if (!minted.ok) {
    await finishVoiceUsage(rpc, { id: claim.id, succeeded: false, audioSeconds: 0 });
    logCode("token_failed", minted.status ?? "none");
    return refuse(STREAM_UNAVAILABLE);
  }
  console.info(`[POST /api/chat/voice/stream] ${surface} started`);
  return NextResponse.json(
    { socketUrl: streamingSocketUrl(minted.token), session: signSessionHandle(apiKey, caller.userId, claim.id), maxSeconds: SESSION_MAX_SECONDS },
    { headers: { "Cache-Control": "no-store" } },
  );
}

async function writeTrace(row: Record<string, unknown>, id: string): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin().from("chat_traces").insert({ id, ...row });
    if (error) console.warn("[POST /api/chat/voice/stream] trace insert failed");
  } catch {
    console.warn("[POST /api/chat/voice/stream] trace insert failed");
  }
}
