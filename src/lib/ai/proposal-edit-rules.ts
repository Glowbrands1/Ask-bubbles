import {
  formEditDateRulesEnabled,
  missedShiftCitesAttendanceEnabled,
  proposalPolicySetAsideEnabled,
  requestIssueKeptEnabled,
} from "@/lib/config/chat-quality-flags";
import { correctiveActionIssue } from "@/lib/forms/incident-issue";
import { asksAboutPolicy, citationSetAside, policiesSetAside, setAsideAnything, withPolicySetAside } from "@/lib/forms/policy-set-aside";

import { cardAccountText } from "@/lib/forms/account-spelling";
import { managerWords, readSentenceEdit, readTurnEdit, remapEditLine, remapObservation } from "./edit-date-rules";
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
  return withPlanOnReadPolicy(withPolicySetAsideOnCard(withEditRules(response, request), request));
}

/*
 * MISSED_SHIFT_CITES_ATTENDANCE_ENABLED (QA, the Bubbles round-7 live test, 9 Nov 2026): a card whose Policy line is
 * the app's own reading ("**Policy:** Attendance — read from this request.") still wrote its Action plan on "the
 * applicable company policy": the plan names only a policy read from the manual's words. With the flag, that plan
 * reviews the policy the card says it read. Off, the response as it was.
 */
const READ_POLICY_LINE = /^\*\*Policy:\*\*\s*(.+?)\s+—\s+read from this request\./m;
const GENERIC_PLAN = /(\*\*Action plan:\*\*[^\n]*?Management will review )the applicable company policy( with)/i;

function withPlanOnReadPolicy(response: AskResponse): AskResponse {
  if (!missedShiftCitesAttendanceEnabled() || !response.formProposal) return response;
  // Gate-Bubbles-2 on #818: the page the Policy line now carries ("Dress Code (JBA Policy Manual p.15)") is the card's, never the plan's.
  const read = READ_POLICY_LINE.exec(response.content)?.[1]?.replace(/\s*\(JBA Policy Manual pp?\.[^)]*\)/i, "").trim();
  if (!read || !GENERIC_PLAN.test(response.content)) return response;
  return { ...response, content: response.content.replace(GENERIC_PLAN, (_all, lead: string, tail: string) => `${lead}the ${read} policy${tail}`) };
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
  const reread = remapObservation({
    users,
    current: card.issue ?? null,
    reread: (account) => correctiveActionIssue(account, card.employeeName ?? null),
    // PROPOSAL_POLICY_SET_ASIDE_ENABLED: "take the … policy off" and "we have quoted the standards of conduct …" are asks, never the Issue.
    ...(proposalPolicySetAsideEnabled() ? { alsoAnAsk: asksAboutPolicy } : {}),
  });
  /*
   * REQUEST_ISSUE_KEPT_ENABLED (QA's live round 17b, P16): "Can you make a CA for <name> for failure to open on time?"
   * is read whole as an instruction, so its account was dropped and the Issue emptied. Kept when no turn replaces or
   * adds to it and the Issue is no instruction itself.
   */
  const keep =
    requestIssueKeptEnabled() &&
    !reread?.trim() &&
    Boolean(card.issue?.trim()) &&
    users.every((turn) => readTurnEdit(turn) === null) &&
    readSentenceEdit(card.issue ?? "") === null;
  const issue = keep ? (card.issue ?? null) : reread;
  const editLine = remapEditLine(managerWords(request.question));
  if (issue === (card.issue ?? null) && !editLine) return response;
  let content = response.content;
  if (issue !== (card.issue ?? null)) {
    // ACCOUNT_TYPOS_FIXED_ENABLED: the card shows the Issue as `form-proposal.ts` prints it (`forms/account-spelling.ts`).
    const shown = (text: string) => cardAccountText(text, card.employeeName ?? null);
    const before = card.issue ? `**Issue:** ${shown(card.issue)}` : null;
    content = before && content.includes(before) ? content.replace(before, `**Issue:** ${shown(issue ?? "")}`) : content;
  }
  if (editLine && !content.includes(editLine)) content = `${content}\n\n${editLine}`;
  return { ...response, content, formProposal: { ...card, issue } };
}
