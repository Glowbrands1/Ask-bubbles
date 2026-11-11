import { businessToday } from "@/lib/business-date";

import { statedWarningLevel, type WarningLevel } from "./warning-level";

/**
 * WARNING_LEVEL_AND_CLAUSE_ENABLED (QA S12 / SF4, 27 Oct 2026): "this should
 * be a written and note a verbal ca was given on 9-1-26" states Written in a
 * clause of its own. Read by the card (`ai/warning-level-clause.ts`) and by
 * the create and draft routes' check of the stated level
 * (`warning-level-conversation.ts`), so the card and the saved draft agree.
 */
/** The one level a turn states in an "and"-clause of its own, or null. */
export function levelInOwnClause(turn: string, today: string = businessToday()): WarningLevel | null {
  const levels = new Set<WarningLevel>();
  for (const sentence of turn.split(/[.;!?\n]+/)) {
    const clauses = sentence.split(/\s+and\s+/i);
    if (clauses.length < 2) continue;
    for (const clause of clauses) {
      const level = statedWarningLevel(clause.trim(), today);
      if (level) levels.add(level);
    }
  }
  return levels.size === 1 ? [...levels][0]! : null;
}

