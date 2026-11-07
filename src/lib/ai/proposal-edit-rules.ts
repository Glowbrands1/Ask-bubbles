import { formEditDateRulesEnabled, proposalPolicySetAsideEnabled } from "@/lib/config/chat-quality-flags";
import { correctiveActionIssue } from "@/lib/forms/incident-issue";
import { asksAboutPolicy, citationSetAside, policiesSetAside, setAsideAnything, withPolicySetAside } from "@/lib/forms/policy-set-aside";

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
  return withPolicySetAsideOnCard(withEditRules(response, request), request);
}

/**
 * PROPOSAL_POLICY_SET_ASIDE_ENABLED (QA, 8 Nov 2026, live here at 00:20): "take the attendance policy off the form"
 * after the manager named it left "Policy: Attendance, as you said" on the card. A policy the manager took off is
 * not cited on the card, and the card says so (`forms/policy-set-aside.ts`). Read from the manager's words, never the
 * app's state lines. Off, the response as it was.
 */
function withPolicySetAsideOnCard(response: AskResponse, request: AskRequest): AskResponse {
  if (!proposalPolicySetAsideEnabled() || !response.formProposal) return response;
  const users = [
    ...(request.history ?? []).filter((turn) => turn.role === "user").map((turn) => turn.content),
    request.question,
  ].map(managerWords);
  const setAside = policiesSetAside(users);
  if (!setAsideAnything(setAside)) return response;
  const citations = response.citations?.filter((citation) => !citationSetAside(citation, setAside));
  return { ...response, content: withPolicySetAside(response.content, setAside), ...(citations ? { citations } : {}) };
}

function withEditRules(response: AskResponse, request: AskRequest): AskResponse {
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
    // PROPOSAL_POLICY_SET_ASIDE_ENABLED: "take the … policy off" and "we have quoted the standards of conduct …" are asks, never the Issue.
    ...(proposalPolicySetAsideEnabled() ? { alsoAnAsk: asksAboutPolicy } : {}),
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
