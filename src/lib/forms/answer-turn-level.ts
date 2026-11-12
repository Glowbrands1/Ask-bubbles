import { answerTurnLevelEnabled } from "@/lib/config/chat-quality-flags";

/*
 * ============================================================================
 * A LEVEL STATED IN THE ANSWER TO THE APP'S OWN QUESTION IS THIS FORM'S (ANSWER_TURN_LEVEL_ENABLED)
 * ============================================================================
 *
 * QA (12 Nov 2026, from B#808's gate): after "Is this for **<roster name>**? Tell me if that should change.", the
 * manager answered "no call no show on 11/3, verbal warning". The card said "I've treated the earlier warning you
 * mentioned as previous corrective action history … Verbal or Written?", and its Issue kept ", verbal warning". A level
 * in a trailing clause after an earlier incident date is history by QA's 22 Oct 2026 rule ("she was late last night,
 * verbal warning" is asked), and that rule stays everywhere else. QA's ruling (a): ONLY in a turn that answers the app's
 * own question ("Is this for <name>?", "Who is this … for?", the card's open level question), a trailing bare-level
 * clause with no words of history is this form's level, and the Issue drops it.
 *
 * With the flag on, such a turn is read with that clause on a line of its own — the reading the warning-level reader
 * already gives a level said on its own line (an answer) — so the card ticks the level and the Issue is the account
 * alone. The stored message is unchanged. Off, as before. Pure.
 */

/** The app's own questions, as the last assistant turn asks them. */
const APP_QUESTION =
  /Is this for \*\*[^*\n]+\*\*\? Tell me if that should change\.|Who is this \*\*[^*\n]+\*\* for\?|Is this new corrective action a \*\*Verbal Warning\*\* or a \*\*Written Warning\*\*\?/;
/** "…, verbal warning", "…, written", "… - a verbal" at the end of the turn. */
const TRAILING_LEVEL = /^([\s\S]*?\S)\s*(?:,|;|\s[-–—])\s*((?:a\s+)?(?:verbal|written)(?:\s+(?:warning|ca|c\/a|corrective\s+action))?)\s*[.!]*\s*$/i;
/** Words of history in the turn: the level is then an earlier warning, as before. */
const HISTORY =
  /\b(?:had|has|have|got|received|given|issued|previous(?:ly)?|prior|past|earlier|already|before|history|record|ago|last|again|another|second|third)\b/i;

interface Turn {
  readonly role: string;
  readonly content: string;
}

/** The question with its trailing level clause on a line of its own, when it answers the app's own question. */
export function withAnswerTurnLevel<A extends { question: string; history: readonly Turn[] }>(asked: A): A | null {
  if (!answerTurnLevelEnabled()) return null;
  const last = [...asked.history].reverse().find((turn) => turn.role === "assistant");
  if (!last || typeof last.content !== "string" || !APP_QUESTION.test(last.content)) return null;
  const trailing = TRAILING_LEVEL.exec(asked.question.trim());
  if (!trailing || HISTORY.test(asked.question)) return null;
  return { ...asked, question: `${trailing[1]}\n${trailing[2]}` };
}

/**
 * The conversation's turns with the same reading (Create re-reads them to confirm the card's level): each manager
 * turn that answers the app's own question. Off, as given.
 */
export function turnsWithAnswerTurnLevel<T extends Turn>(turns: readonly T[]): T[] {
  if (!answerTurnLevelEnabled()) return [...turns];
  return turns.map((turn, index) => {
    if (turn.role !== "user" || typeof turn.content !== "string") return turn;
    const read = withAnswerTurnLevel({ question: turn.content, history: turns.slice(0, index) });
    return read ? { ...turn, content: read.question } : turn;
  });
}
