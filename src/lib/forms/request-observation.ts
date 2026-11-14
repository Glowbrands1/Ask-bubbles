import { caReasonDueToEnabled } from "@/lib/config/chat-quality-flags";

import { asksForTheForm } from "./draft-never-blank";
import { opensWithLevelLedRequest, requestIssueClause, withoutFormRequestLead } from "./incident-issue";

/**
 * ============================================================================
 * THE REQUEST IS NOT THE OBSERVATION (CA_REASON_DUE_TO_ENABLED; QA, live,
 * 4 Nov 2026; rebuilds #454)
 * ============================================================================
 *
 * "CA for <name> due to under performance in salon metrics" came back with
 * that whole sentence as the draft's Observation of Offense: the drafting
 * model copied the manager's request. With the flag on, an Observation whose
 * first sentence asks for the form (`asksForTheForm`, the reader the draft's
 * never-blank fallback uses) has that sentence replaced by the request's own
 * reason (`requestIssueClause`: "under performance in salon metrics"), or,
 * when the request names only the person and the store ("create a ca for
 * <name> at <store>, she was late on 10-5 and 10-15"), by the account after
 * its comma. With no reason to read, or the flag off, the Observation is left
 * as written.
 */

const LABEL = /^(\s*Observed:\s*\n?)/i;

/** The request sentence's reason, or null when it gives none. */
function reasonOf(sentence: string, employeeName: string | null): string | null {
  const issue = requestIssueClause(sentence, employeeName);
  if (issue) return issue;
  const rest = withoutFormRequestLead(sentence).trim();
  return rest && rest !== sentence.trim() && !asksForTheForm(rest) ? rest : null;
}

/** The drafted values with the request sentence in `fieldKey` replaced by its reason, or null when nothing changes. */
export function withoutRequestInObservation(
  values: Readonly<Record<string, string>>,
  fieldKey: string | null | undefined,
  employeeName: string | null,
): Record<string, string> | null {
  if (!caReasonDueToEnabled() || !fieldKey) return null;
  const value = values[fieldKey];
  if (!value?.trim()) return null;
  const label = LABEL.exec(value)?.[1] ?? "";
  const body = value.slice(label.length);
  const first = /^[^\n]*?(?:[.!?](?=\s|$)|$)/m.exec(body)?.[0] ?? "";
  // LEVEL_LEADS_REQUEST_ENABLED: "second verbal for <A>, she was late …" asks for the form too (QA, 14 Nov 2026).
  if (!first.trim() || !(asksForTheForm(first) || opensWithLevelLedRequest(first))) return null;
  const issue = reasonOf(first, employeeName);
  if (!issue) return null;
  const sentence = `${issue.charAt(0).toUpperCase()}${issue.slice(1)}${/[.!?]$/.test(issue) ? "" : "."}`;
  return { ...values, [fieldKey]: `${label}${sentence}${body.slice(first.length)}` };
}
