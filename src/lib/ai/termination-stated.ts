import { terminationStatedTicksEnabled } from "@/lib/config/chat-quality-flags";
import {
  TERMINATION_APPROVAL_LINE,
  TERMINATION_PLAN_SENTENCE,
  statesTermination,
} from "@/lib/forms/termination-stated";

import type { AskRequest, AskResponse } from "./types";

/**
 * TERMINATION_STATED_TICKS_ENABLED, on the card (ported from the sibling app: Pau's P15 ruling, 10 Nov 2026). A
 * Corrective Action card with no level, for a termination the manager stated: the level question ("Is this new
 * corrective action a **Verbal Warning** or a **Written Warning**? …") becomes "**Type of Warning:** Termination, as you
 * said", followed by the one approval line, and the card's Action plan line ends with the termination sentence instead
 * of the closing for a future violation. Create ticks it (`api/forms/instances`). After the reply is built, outside the
 * proposal flow. Off (`statesTermination` is false), the reply is as built.
 */
const CORRECTIVE = /corrective action/i;
const LEVEL_ASKED = /^Is this new corrective action a \*\*Verbal Warning\*\* or a \*\*Written Warning\*\*\?[^\n]*$/m;
const TYPE_LINE = "**Type of Warning:** Termination, as you said — I'll tick it on the form. Tell me if that should change.";

export function withTerminationStated(response: AskResponse, request: AskRequest): AskResponse {
  if (!terminationStatedTicksEnabled()) return response;
  const proposal = response.formProposal;
  if (!proposal || !(proposal.templateKey === "dpoa" || CORRECTIVE.test(proposal.templateName ?? ""))) return response;
  if (proposal.warningLevel || response.content.includes(TERMINATION_APPROVAL_LINE)) return response;
  const said = [...(request.history ?? []).filter((turn) => turn.role === "user").map((turn) => String(turn.content)), request.question].join("\n");
  if (!statesTermination(said)) return response;
  const typeLines = `${TYPE_LINE}\n\n${TERMINATION_APPROVAL_LINE}`;
  let content = response.content;
  if (LEVEL_ASKED.test(content)) {
    content = content.replace(LEVEL_ASKED, typeLines);
  } else {
    const lines = content.split("\n");
    lines.splice(Math.min(1, lines.length), 0, "", typeLines);
    content = lines.join("\n");
  }
  // The card's Action plan line: the termination sentence, not the closing for a future violation.
  content = content.replace(
    /^(\*\*Action plan:\*\*[^\n]*?)\s*Future policy violations may result in additional corrective action up to and including termination of employment\.\s*$/im,
    (_line, lead: string) => `${lead.trimEnd()} ${TERMINATION_PLAN_SENTENCE}`,
  );
  return { ...response, content: content.replace(/\n{3,}/g, "\n\n").trim() };
}
