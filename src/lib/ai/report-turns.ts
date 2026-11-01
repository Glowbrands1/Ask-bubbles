import { reportNameNotAPersonEnabled } from "@/lib/config/chat-quality-flags";
import { extractEmployeeNames } from "@/lib/forms/proposal";
import { detectTemplateIntent } from "@/lib/forms/template-intent";

import { isReportName, mentionsReportName } from "./report-name";
import type { AskRequest } from "./types";

/**
 * ============================================================================
 * A QUESTION ABOUT A REPORT IS NOT THE ACCOUNT ON A FORM
 * ============================================================================
 *
 * REPORT_NAME_NOT_A_PERSON_ENABLED (the sibling app's live retest, 1 Nov
 * 2026). In a new chat a question about one of its reports, then "create a
 * coaching form", made a card for the report's name: the card is built from
 * every manager turn of the conversation, and the report question was one of
 * them. Ported as the mechanism: this app's report catalog
 * (`config/company/reports.ts`) is empty today, so nothing is left out until a
 * report is registered.
 *
 * On a form-request turn, a manager turn that asks about one of the app's
 * reports and names nobody — and the answer to it — is left out of the
 * history the form is built from. Every other turn, and every turn that names
 * somebody, is kept; turns that are not form requests are untouched.
 */
function asksOnlyAboutAReport(text: string): boolean {
  if (!mentionsReportName(text)) return false;
  if (detectTemplateIntent(text).kind !== "none") return false;
  return extractEmployeeNames(text).every((name) => isReportName(name));
}

export function withoutReportTurnsForForm(request: AskRequest): AskRequest {
  if (!reportNameNotAPersonEnabled()) return request;
  const formTurn = detectTemplateIntent(request.question).kind !== "none" || Boolean(request.continueProposalTemplateKey);
  if (!formTurn) return request;
  const kept: AskRequest["history"] = [];
  let skipAnswer = false;
  for (const turn of request.history) {
    if (turn.role === "user") {
      skipAnswer = asksOnlyAboutAReport(turn.content ?? "");
      if (!skipAnswer) kept.push(turn);
      continue;
    }
    if (skipAnswer) {
      skipAnswer = false;
      continue;
    }
    kept.push(turn);
  }
  return kept.length === request.history.length ? request : { ...request, history: kept };
}
