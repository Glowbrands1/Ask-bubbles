import { NextResponse } from "next/server";

import { assertLiveMode, assertNoConfigurationProblems, assertWithinRateLimit, errorResponse } from "@/lib/api/respond";
import { parseJsonBody } from "@/lib/api/validation";
import { authorizeRequest } from "@/lib/auth/server";
import { NO_STORE } from "@/lib/google-reviews/route-helpers";
import { REPLY_REASONS, discardReplyDraft, publishReply, replyHttpStatus, saveReplyDraft, type ReplyResult } from "@/lib/google-reviews/replies";
import { replyActorLabel, type ReplyActor } from "@/lib/google-reviews/reply-access";

/**
 * /api/google-reviews/reviews/{reviewId}/reply — answer one Google review.
 *
 *   PUT     { "body": string, "version"?: number }   create or edit the DRAFT. Sends nothing to Google.
 *   DELETE                                           discard the open draft (or failed attempt).
 *   POST    { "version": number, "confirmPublish": true, "confirmReplace"?: true }
 *                                                    PUBLISH the draft to Google, once, as the version named.
 *
 * `reply_to_reviews`, and then — inside the service, on every call — the review's salon must be one
 * the person's assignment covers (admins: all seven). The person is the VERIFIED session; nothing in
 * the body names or changes who is acting. Publishing needs `confirmPublish: true` exactly (and
 * `confirmReplace: true` when an owner reply already exists), the switch
 * GOOGLE_REVIEWS_REPLIES_ENABLED, and a live Google connection. The response carries codes and
 * the person's own reply; never Google's error body, a token, or review text.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function actorFor(request: Request): Promise<ReplyActor> {
  const context = await authorizeRequest(request, "reply_to_reviews");
  assertWithinRateLimit(request, "mutate");
  const { identity } = context;
  return { label: replyActorLabel(identity), role: identity.role, scope: identity.scope, verified: identity.verified };
}

function respond(result: ReplyResult): NextResponse {
  if (result.ok) return NextResponse.json({ status: "ok", reply: result.reply, alreadyOnGoogle: result.alreadyOnGoogle === true }, { headers: NO_STORE });
  return NextResponse.json(
    { status: "failed", code: result.code, reason: REPLY_REASONS[result.code] ?? null, field: result.field ?? null, reply: result.reply ?? null },
    { status: replyHttpStatus(result.code), headers: NO_STORE },
  );
}

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  try {
    assertLiveMode();
    assertNoConfigurationProblems();
    const actor = await actorFor(request);
    const body = await parseJsonBody<{ body: unknown; version: unknown }>(request);
    return respond(await saveReplyDraft({ actor, reviewId: (await params).id, body: body.body, expectedVersion: body.version }));
  } catch (error) {
    return errorResponse(error, "google-reviews/reply");
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    assertLiveMode();
    assertNoConfigurationProblems();
    const actor = await actorFor(request);
    return respond(await discardReplyDraft({ actor, reviewId: (await params).id }));
  } catch (error) {
    return errorResponse(error, "google-reviews/reply");
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    assertLiveMode();
    assertNoConfigurationProblems();
    const actor = await actorFor(request);
    const body = await parseJsonBody<{ version: unknown; confirmPublish: unknown; confirmReplace: unknown }>(request);
    return respond(await publishReply({ actor, reviewId: (await params).id, version: body.version, confirmPublish: body.confirmPublish, confirmReplace: body.confirmReplace }));
  } catch (error) {
    return errorResponse(error, "google-reviews/reply");
  }
}
