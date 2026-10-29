import { formEditDateRulesEnabled } from "@/lib/config/chat-quality-flags";
import { correctiveActionIssue } from "@/lib/forms/incident-issue";

import { managerWords, remapEditLine, remapObservation } from "./edit-date-rules";
import type { AskRequest, AskResponse } from "./types";

/**
 * ============================================================================
 * EDITS ON THE PROPOSAL PATH — FORM_EDIT_DATE_RULES_ENABLED
 * ============================================================================
 *
 * QA, 29 Oct 2026: the flag was built on the full remap, which production
 * switched off on 26 Oct. On the proposal path production uses today, the
 * card's Issue is read from the latest turn, so
 *
 *   "add that she was also on her phone"   (B17, conv_mvnuh50i2hanl53)
 *   "change observation of offense to: …"  (S22)
 *
 * replaced the incident with the instruction itself, or left the old text
 * when the manager gave the new text word for word. The same three edit
 * kinds as the remap (`edit-date-rules.ts`) are applied to the card's Issue:
 * a replace sets it to the manager's text, an add is appended in the
 * manager's words, and an instruction never becomes the Issue (it is read
 * again from the manager's account). The reply says what an edit did. The
 * date rules already hold on this path (the proposal's own date reading).
 *
 * Off: the response as it was.
 */
export function withProposalEditRules(response: AskResponse, request: AskRequest): AskResponse {
  if (!formEditDateRulesEnabled()) return response;
  const card = response.formProposal;
  if (!card || card.issue === undefined) return response;
  const users = [
    ...(request.history ?? []).filter((turn) => turn.role === "user").map((turn) => turn.content),
    request.question,
  ].map(managerWords);
  const issue = remapObservation({
    users,
    current: card.issue ?? null,
    reread: (account) => correctiveActionIssue(account, card.employeeName ?? null),
  });
  const editLine = remapEditLine(managerWords(request.question));
  if (issue === (card.issue ?? null) && !editLine) return response;
  let content = response.content;
  if (issue !== (card.issue ?? null)) {
    const before = card.issue ? `**Issue:** ${card.issue}` : null;
    content = before && content.includes(before) ? content.replace(before, `**Issue:** ${issue ?? ""}`) : content;
  }
  if (editLine && !content.includes(editLine)) content = `${content}\n\n${editLine}`;
  return { ...response, content, formProposal: { ...card, issue } };
}
