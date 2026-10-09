import { JOIN } from "./bounded-context";
import { canonicalWarningWording } from "./template-intent";

/**
 * ============================================================================
 * "NEEDS A WRITTEN WARNING" — THE WARNING LEVEL THE MANAGER STATED
 * ============================================================================
 *
 * Signed-in QA, 8 Oct 2026: "jordan testperson needs a written warning for
 * cash handling" produced a Corrective Action Form with no Type of Warning
 * ticked. The level was the drafting model's alone to tick, and a level the
 * manager SAID is not a judgement for anybody else to make.
 *
 * So the level is read here, deterministically, and the draft ticks it as
 * stated (`warning_type`). It is read, never inferred:
 *
 *   - only "verbal"/"written" warnings and "final written" are levels; a bare
 *     "warning" is not, and nothing is defaulted;
 *   - a level in the employee's HISTORY ("she already got a verbal warning",
 *     "after her verbal last month") is a prior step, not this one;
 *   - a NEGATED level ("not a written warning") is not stated;
 *   - the LATEST turn that states one wins, so "actually make it a verbal"
 *     corrects it; a turn naming both, undecided, states neither.
 *
 * Pure and browser-safe.
 */

export type StatedWarningLevel = "verbal" | "written";

export const WARNING_LEVEL_LABEL: Record<StatedWarningLevel, string> = {
  verbal: "Verbal Warning",
  written: "Written Warning",
};

const MENTION =
  /\b(?:(final)\s+)?(written|verbal)(?:\s+(warning|write[- ]?up))?\b/gi;

/** Words just before a mention that make it something already received. */
const HISTORY_BEFORE =
  /\b(?:got|gotten|had|has\s+had|have\s+had|received|receiving|gave\s+(?:her|him|them)|given|issued|was\s+given|already|previous|previously|prior|earlier|last|before|after|since|from)\b(?:\s+[^\s,;:.!?]+){0,2}\s*$/i;
/*
 * WHAT IS BEING ASKED FOR NOW, directly before the level: "needs a written
 * warning", "give her a verbal", "make it a written". Wins over a history cue
 * earlier in the sentence — "was $40 short last night, needs a written warning"
 * is this warning, not a prior one (owner's retest variants, 9 Oct 2026).
 */
const ASKED_NOW_BEFORE =
  /\b(?:needs?|needed|give|giving|issue|issuing|make\s+it|do|start|write\s+up|deserves?|requires?|wants?|getting|gets)\s+(?:(?:her|him|them)\s+)?(?:(?:a|an)\s+)?(?:final\s+)?$/i;
/** Words just after a mention that make it history. */
const HISTORY_AFTER = /^\s*(?:\S+\s+){0,2}?(?:last|ago|earlier|already|previously|before|in\s+(?:january|february|march|april|may|june|july|august|september|october|november|december))\b/i;

const NEGATED_BEFORE = /\b(?:not|no|never|isn't|is\s+not|wasn't|don't|do\s+not|instead\s+of|rather\s+than)\s+(?:a\s+|an\s+|the\s+)?(?:final\s+)?$/i;

/** One turn's statement of the level, or null when it states none or both. */
function levelIn(turn: string): StatedWarningLevel | null {
  const found = new Set<StatedWarningLevel>();
  for (const match of turn.matchAll(MENTION)) {
    const [, final, level, noun] = match;
    // "written" or "verbal" alone is a level only as "a written", "final written".
    if (!noun && !final && !/\b(?:a|an|the|this|it'?s|its|is|be|make\s+it|do\s+a)\s*$/i.test(turn.slice(0, match.index))) continue;
    const before = turn.slice(0, match.index);
    const after = turn.slice(match.index! + match[0].length);
    if (NEGATED_BEFORE.test(before)) continue;
    if (!ASKED_NOW_BEFORE.test(before) && (HISTORY_BEFORE.test(before) || HISTORY_AFTER.test(after))) continue;
    // A bare "written" before a noun that is not a warning: "written statement".
    if (!noun && /^\s+(?:statement|notice|policy|policies|request|record|records|note|notes|test|up)\b/i.test(after)) continue;
    found.add(level!.toLowerCase() as StatedWarningLevel);
  }
  return found.size === 1 ? [...found][0]! : null;
}

/**
 * The warning level the manager's turns state, latest first, or null.
 *
 * @param text The manager's turns joined by `JOIN`, oldest first — the
 *             proposal's context or the draft's notes.
 */
export function statedWarningLevel(text: string): StatedWarningLevel | null {
  const turns = canonicalWarningWording(text ?? "")
    .replace(/[‘’‛]/g, "'")
    .split(JOIN)
    .map((turn) => turn.trim())
    .filter(Boolean);
  for (const turn of [...turns].reverse()) {
    // Sentence by sentence, the last stating sentence of the turn deciding.
    const sentences = [...turn.matchAll(/[^.!?\n]+[.!?]*/g)].map((match) => match[0]).filter((s) => !/\?\s*$/.test(s));
    for (const sentence of sentences.reverse()) {
      const level = levelIn(sentence);
      if (level) return level;
    }
  }
  return null;
}
