import { NextResponse } from "next/server";

import { loadConversationFormState } from "@/lib/ai/form-state-store";
import { authorizeRequest } from "@/lib/auth/server";
import { resumeDraftEnabled } from "@/lib/config/chat-ui-flags";

/**
 * The saved form draft for this conversation, for the resume banner.
 * The flag off returns an empty body and does not read the table.
 */
export async function GET(request: Request) {
  if (!resumeDraftEnabled()) return NextResponse.json({ draft: null });
  try {
    const context = await authorizeRequest(request, "ask_questions");
    const conversationId = new URL(request.url).searchParams.get("conversationId")?.trim() ?? "";
    if (!conversationId || !context.identity.subject) return NextResponse.json({ draft: null });
    const state = await loadConversationFormState({
      userId: context.identity.subject,
      conversationId,
    });
    if (!state) return NextResponse.json({ draft: null });
    const { fields } = state;
    if (!fields.employeeName && !fields.store && !fields.warningLevel) {
      return NextResponse.json({ draft: null });
    }
    return NextResponse.json({
      draft: {
        employeeName: fields.employeeName,
        store: fields.store,
        warningLevel: fields.warningLevel,
      },
    });
  } catch {
    return NextResponse.json({ draft: null });
  }
}
