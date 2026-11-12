import { typoFullNameToRosterEnabled } from "@/lib/config/chat-quality-flags";

import type { WarningLevel } from "./warning-level";

/*
 * ============================================================================
 * THE LEVEL SAID AFTER "IS THIS FOR <NAME>?" IS THE CARD'S (TYPO_FULL_NAME_TO_ROSTER_ENABLED; QA's ruling on #776)
 * ============================================================================
 *
 * QA's audit item 15.10, sf-b5 (invented people): "create a ca form for Delphine Marlwoe Ostrander" — a typo of a
 * roster person's full name — is asked "Is this for **Delphine Marlowe Ostrander**?" first (QA, 12 Nov 2026: a typo can
 * be a different person, and the confirmation costs one turn). The next turn, "verbal warning The date she complained
 * was Oct 31st …", opens her card (NEAR_MISS_DETAILS_ACCEPT), but the level read it as a mention: "verbal warning" runs
 * into the account with no stop, so it is not a sentence of its own. After that question, a turn that OPENS with a level
 * ("verbal warning …", "written CA …"), on a Corrective Action card for the person asked about and with no level yet, is
 * this form's level; the reply says so in the words a stated level gets. Off, as given.
 */
const ASKED =
  "Is this new corrective action a **Verbal Warning** or a **Written Warning**? Tell me here, or tick it on the form — I won't choose it for you.";
/** The notice the level question carries when the level was read as an earlier step (`ai/form-proposal.ts`). */
const HISTORY_NOTICE = "I've treated the earlier warning you mentioned as previous corrective action history — it doesn't decide this one.";
const CONFIRM = /^Is this for \*\*([^*\n]+)\*\*\?/;
const OPENS_WITH_LEVEL = /^\s*(?:(?:ok(?:ay)?|yes|yeah|yep|correct|right)[,.!\s]+)?(verbal|written)\s+(?:warning|ca|c\/a|corrective(?:\s+action)?)\b/i;

interface Turn {
  readonly role: string;
  readonly content: string;
}

interface Card {
  readonly templateKey?: string | null;
  readonly employeeName?: string | null;
  readonly warningLevel?: WarningLevel | null;
}

export function withConfirmedNameLevel<T extends { content: string; formProposal?: Card | null }>(
  answer: T,
  history: readonly Turn[],
  question: string,
): T {
  if (!typoFullNameToRosterEnabled()) return answer;
  const card = answer.formProposal;
  if (!card || card.templateKey !== "dpoa" || card.warningLevel || !card.employeeName || !answer.content.includes(ASKED)) return answer;
  const at = history.map((turn) => turn.role === "assistant" && CONFIRM.exec(String(turn.content))?.[1]?.trim()).lastIndexOf(card.employeeName);
  if (at === -1) return answer;
  const after = [...history.slice(at + 1).filter((turn) => turn.role === "user").map((turn) => String(turn.content)), question];
  const levels = new Set(after.map((turn) => OPENS_WITH_LEVEL.exec(turn)?.[1]?.toLowerCase()).filter((level): level is string => Boolean(level)));
  if (levels.size !== 1) return answer;
  const level = [...levels][0] as WarningLevel;
  const line = `**Type of warning:** ${level === "verbal" ? "Verbal Warning" : "Written Warning"}, as you said — tell me if that should change.`;
  // QA (12 Nov 2026, after G4-776b): the history notice in front of the question ("I've treated the earlier warning you
  // mentioned as previous corrective action history …") read the level as an earlier step; with the level set, it goes.
  const content = answer.content.replace(`${HISTORY_NOTICE} ${ASKED}`, line).replace(ASKED, line);
  return { ...answer, content, formProposal: { ...card, warningLevel: level } };
}
