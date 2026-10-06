import { NOT_A_NAME } from "@/lib/forms/name-words";

import type { ClaudeTurn } from "./call-claude";

/**
 * ============================================================================
 * "WHAT ABOUT PART-TIMERS?" — A FOLLOW-UP AND THE TURN IT HANGS OFF
 * ============================================================================
 *
 * Ported from the reference platform's employee-performance gate, where the
 * same two functions decide whether a follow-up still needs the document its
 * anchor needed. The reading names no company and no document, so it is its
 * own module here and any gate can use it.
 *
 * WHAT MARKS A FRAGMENT is an opening that points BACKWARDS — "and…", "what
 * about…", "why?", "based on that," — or a turn that is nothing but a name.
 * Length is not the test: "Rank my team." is short and complete.
 *
 * NOT A TOPIC MEMORY. The walk returns the nearest manager turn that stands on
 * its own, steps over at most `MAX_CONTINUATION_HOPS` fragments, and never
 * reads an assistant turn: answers are not intent.
 */

const ELLIPSIS_PATTERNS: readonly RegExp[] = [
  /^\s*(?:and|or|but|so)\b/i,
  /^\s*what about\b/i,
  /^\s*how about\b/i,
  /^\s*what if\b/i,
  /^\s*(?:why|why not|how|when|where|who|which|whose)\s*\??\s*$/i,
  /^\s*(?:him|her|them|they|he|she|it)\s*\??\s*$/i,
  /^\s*(?:the other|the others|anyone else|anybody else|the rest)\b/i,
  /^\s*(?:same|same for|same with|also)\b/i,
  /^\s*(?:more|more detail|more details|go on|continue|keep going)\b/i,
  /^\s*how (?:so|come|is that|does that)\b/i,
  /^\s*why (?:is that|does that|not|then)\b/i,
  /^\s*what (?:then|else|now)\b/i,
  /^\s*what do(?:es)? (?:you|that|this|it) mean\b/i,
  /^\s*(?:meaning|in what way|in what sense|such as|like what|for example|e\.g\.)\b/i,
  /^\s*(?:really|seriously)\s*\??\s*$/i,
  /*
   * THE DEMONSTRATIVE HAS TO BE BARE. "Based on that, what should I do?"
   * points back; "Based on those numbers, what was our total?" is a new
   * question with its own subject.
   */
  /^\s*based on (?:that|this|those|these|it)\s*(?:[,.;:!?]|$)/i,
  /^\s*(?:according to|given) (?:that|this|those|these|it)\s*(?:[,.;:!?]|$)/i,
  /^\s*(?:from|because of) (?:that|this)\s*(?:[,.;:!?]|$)/i,
];

/** Whether a question is a fragment that depends on the previous turn. */
export function isEllipticalFollowUp(question: string): boolean {
  const text = (question ?? "").trim();
  if (text.length === 0) return false;
  if (ELLIPSIS_PATTERNS.some((pattern) => pattern.test(text))) return true;
  return isBareNameFragment(text);
}

/** Whether the text is nothing but a name or two — "Sarah?", "Sarah and Jane?". */
export function isBareNameFragment(text: string): boolean {
  const tokens = (text ?? "")
    .replace(/[?.!,]+$/, "")
    .split(/\s+/)
    .filter((token) => token.length > 0);
  if (tokens.length === 0 || tokens.length > 4) return false;

  const JOINERS = new Set(["and", "or", "&", "plus", "vs"]);
  let names = 0;
  for (const token of tokens) {
    const bare = token.replace(/[^A-Za-z'-]/g, "");
    if (JOINERS.has(bare.toLowerCase())) continue;
    if (!/^[A-Z][a-z]{1,}$/.test(bare)) return false;
    if (NOT_A_NAME.has(bare.toLowerCase())) return false;
    names += 1;
  }
  return names > 0;
}

/** How many consecutive fragments may separate a turn from its anchor. */
export const MAX_CONTINUATION_HOPS = 6;

/**
 * The manager turn a run of fragments hangs off, or null if there isn't one.
 * Walks backwards over the prior conversation, stepping over fragments and
 * skipping assistant turns entirely.
 */
export function findContinuationAnchor(
  history: readonly ClaudeTurn[],
  maxHops: number = MAX_CONTINUATION_HOPS,
  isFragment: (question: string) => boolean = isEllipticalFollowUp,
): string | null {
  let hops = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const turn = history[index]!;
    if (turn.role === "assistant") continue;
    if (!isFragment(turn.content)) return turn.content;
    hops += 1;
    if (hops > maxHops) return null;
  }
  return null;
}

/**
 * The text a gate should test for THIS turn: the question, and — only when
 * the question is a fragment — the anchor it hangs off. A gate that fires on
 * either keeps a follow-up on the same footing as the question it follows.
 */
export function gateTexts(question: string, history: readonly ClaudeTurn[]): string[] {
  if (!isEllipticalFollowUp(question)) return [question];
  const anchor = findContinuationAnchor(history);
  return anchor ? [question, anchor] : [question];
}
