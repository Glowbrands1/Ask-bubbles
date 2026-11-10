import { coachingCardPolicyEnabled, workAreaAbsenceCitesConductEnabled } from "@/lib/config/chat-quality-flags";
import { withCoachingCardPolicy } from "@/lib/forms/coaching-card-policy";
import type { ManualChunk } from "@/lib/forms/official-policy-manual";

import { turnsMadeAbout } from "./make-it-about";
import type { AskRequest, AskResponse } from "./types";

/**
 * COACHING_CARD_POLICY_ENABLED: the forms path's answer with its Coaching card citing the policy its account falls
 * under (`forms/coaching-card-policy.ts`). The route calls it on the proposal it returns (`ai/server-ask.ts`, one line,
 * coding 2's file). Off, or with no card, or a manual that cannot be read: the answer as it was.
 */
export async function withCoachingCardPolicyOnAnswer(
  response: AskResponse,
  request: Pick<AskRequest, "history" | "question">,
  readManual: () => Promise<{ readonly ok: boolean; readonly chunks?: readonly ManualChunk[] }>,
): Promise<AskResponse> {
  if (!coachingCardPolicyEnabled() || !response.formProposal) return response;
  try {
    const manual = await readManual();
    if (!manual.ok || !manual.chunks) return response;
    const turns = [...(request.history ?? []).filter((turn) => turn.role === "user").map((turn) => turn.content), request.question];
    /*
     * WORK_AREA_ABSENCE_CITES_CONDUCT_ENABLED (QA, 9 Nov 2026): "make it about leaving the front desk unattended on 11/6/26"
     * on a Coaching card about a missed meeting still cited Attendance: the policy was read from every turn. The account
     * from the last "make it about …" on is what the card is about, as its Observation already reads (`make-it-about.ts`).
     */
    const notes = (workAreaAbsenceCitesConductEnabled() ? turnsMadeAbout(turns) : turns).join("\n");
    const content = withCoachingCardPolicy({ content: response.content, templateKey: response.formProposal.templateKey, notes, chunks: manual.chunks });
    return content === response.content ? response : { ...response, content };
  } catch {
    // A manual read that fails leaves the card as the forms path wrote it.
    return response;
  }
}
