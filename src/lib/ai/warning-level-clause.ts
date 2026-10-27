import { warningLevelAndClauseEnabled } from "@/lib/config/chat-quality-flags";
import { type WarningLevel } from "@/lib/forms/warning-level";
import { levelInOwnClause } from "@/lib/forms/warning-level-clause";

import type { AskRequest, AskResponse } from "./types";

/**
 * WARNING_LEVEL_AND_CLAUSE_ENABLED (ported from the sibling app, QA S12 / SF4, 27
 * Oct 2026): "this should be a written and note a verbal ca was given on
 * 9-1-26" left the warning level blank and the card asked "Verbal Warning or
 * Written Warning?" — the sentence's earlier step was read as history and the
 * level beside it with it. With the flag on, a Corrective Action card with no
 * level reads the manager's turns a clause at a time ("… and …"), latest turn
 * first; one level stated in a clause of its own is the card's level, and the
 * reply says so in the words a stated level gets. Two levels, or a level only
 * in the step's history, state nothing.
 */
const ASKED =
  "Is this new corrective action a **Verbal Warning** or a **Written Warning**? Tell me here, or tick it on the form — I won't choose it for you.";

function label(level: WarningLevel): string {
  return level === "verbal" ? "Verbal Warning" : level === "written" ? "Written Warning" : "Final Warning";
}

export function withWarningLevelFromClause(response: AskResponse, request: AskRequest): AskResponse {
  if (!warningLevelAndClauseEnabled()) return response;
  const proposal = response.formProposal;
  if (!proposal || proposal.warningLevel || !response.content.includes(ASKED)) return response;
  const turns = [...(request.history ?? []).filter((turn) => turn.role === "user").map((turn) => String(turn.content)), request.question];
  let level: WarningLevel | null = null;
  for (const turn of [...turns].reverse()) {
    level = levelInOwnClause(turn);
    if (level) break;
  }
  if (!level) return response;
  const line = `**Type of warning:** ${label(level)}, as you said — tell me if that should change.`;
  return { ...response, content: response.content.replace(ASKED, line), formProposal: { ...proposal, warningLevel: level } };
}
