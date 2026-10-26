import { answerLengthGuardEnabled } from "@/lib/config/chat-quality-flags";
import { CLAUDE_MAX_TOKENS } from "@/lib/config/models";

import { chatTraceDraft } from "./chat-trace-store";
import { withTruncationRetry } from "./truncation";

/**
 * ============================================================================
 * A LONG ANSWER ENDS ON A WHOLE SENTENCE, NOT ON "…copy it [S5"
 * ============================================================================
 *
 * Ported from the sibling app, where a weekly coaching-plan answer (26 Oct
 * 2026) stopped at max_tokens. The answer call's 2048 tokens are shared by
 * adaptive thinking and the reply; 768 went to thinking, and the 3,485
 * characters the manager saw ended mid-sentence on a raw "[S5". Here the same
 * cut reached `withTruncationRetry`, which asked again with 4096 and, cut
 * again, showed the manager an error instead of the answer.
 *
 * With ANSWER_LENGTH_GUARD_ENABLED on, for the chat answer call only:
 *
 *   1. A 2048-token answer call asks for 3584 instead. Quick (1024) and
 *      detailed (4096) budgets are unchanged.
 *   2. A reply that still stops at max_tokens is asked for once more — the
 *      same request, the same budget — but only while the turn is under 35 s,
 *      and that attempt is abandoned when the turn reaches 60 s.
 *   3. Otherwise, or when the second reply is cut too, the reply ends at its
 *      last complete sentence or list item. A half-written bullet, heading or
 *      table row is dropped whole, and an unclosed "[S5" never survives.
 *   4. One console line records stop_reason=max_tokens and the elapsed ms.
 *
 * With the guard on, it REPLACES `withTruncationRetry` for the answer call
 * (`answerLengthRetry`), so a cut reply is asked for again once, never twice,
 * and never at 7168 tokens. The form draft and revision calls keep
 * `withTruncationRetry` as it is.
 *
 * A reply that did not stop at max_tokens is returned as the same object, so
 * an end_turn answer is byte-identical with the flag on and off. Off, no guard
 * exists and the answer call goes through `withTruncationRetry` as on main.
 */

/** The answer call's budget in place of 2048 (QA's GO, 26 Oct 2026). */
export const ANSWER_GUARD_MAX_TOKENS = 3584;
/** A cut reply is asked for again only while the turn is younger than this. */
export const LENGTH_RETRY_BEFORE_MS = 35_000;
/** The second attempt is abandoned when the turn reaches this. */
export const TURN_CEILING_MS = 60_000;

export interface AnswerLengthGuard {
  /** The max_tokens the answer call sends. */
  readonly maxTokens: number;
  /** When the turn started: the chat trace's start, else this call's. */
  readonly turnStartedAt: number;
}

/** Null when the flag is off or the caller is not the chat answer. */
export function answerLengthGuard(input: {
  readonly maxTokens: number;
  readonly answerLengthGuard?: boolean;
}): AnswerLengthGuard | null {
  if (!input.answerLengthGuard || !answerLengthGuardEnabled()) return null;
  return {
    maxTokens: input.maxTokens === CLAUDE_MAX_TOKENS.standard ? ANSWER_GUARD_MAX_TOKENS : input.maxTokens,
    turnStartedAt: chatTraceDraft()?.startedAt ?? Date.now(),
  };
}

/** How one model result is read and rewritten; the two apps hold different shapes. */
export interface LengthAdapter<T> {
  readonly stopReason: (result: T) => string | null;
  readonly text: (result: T) => string;
  readonly withText: (result: T, text: string) => T;
}

/**
 * The reply to use for a result that may have stopped at max_tokens. `again`
 * makes the same request once more; it gets a signal that aborts at the turn
 * ceiling, and it is abandoned then whether or not it honours the signal.
 */
export async function settleAnswerLength<T>(
  guard: AnswerLengthGuard,
  first: T,
  again: (signal: AbortSignal) => Promise<T>,
  adapter: LengthAdapter<T>,
): Promise<T> {
  if (adapter.stopReason(first) !== "max_tokens") return first;

  const elapsedMs = Math.max(0, Date.now() - guard.turnStartedAt);
  const retried = elapsedMs < LENGTH_RETRY_BEFORE_MS;
  const second = retried ? await attemptWithin(again, TURN_CEILING_MS - elapsedMs) : null;

  let settled: T;
  let outcome: "complete" | "cut";
  if (second !== null && finished(second, adapter)) {
    settled = second;
    outcome = "complete";
  } else {
    const cutReplies = second !== null && adapter.stopReason(second) === "max_tokens" ? [first, second] : [first];
    settled = cleanestCut(cutReplies, adapter);
    outcome = "cut";
  }
  console.warn(
    `[answer-length-guard] stop_reason=max_tokens max_tokens=${guard.maxTokens} elapsed_ms=${elapsedMs} retried=${retried} outcome=${outcome} turn_ms=${Math.max(0, Date.now() - guard.turnStartedAt)}`,
  );
  return settled;
}

/** A second reply that can be shown as it is. */
function finished<T>(result: T, adapter: LengthAdapter<T>): boolean {
  const stop = adapter.stopReason(result);
  return stop !== "max_tokens" && stop !== "refusal" && adapter.text(result).trim().length > 0;
}

/** The longest clean cut among the cut replies; the first reply when none has a whole sentence. */
function cleanestCut<T>(results: readonly T[], adapter: LengthAdapter<T>): T {
  let best: { result: T; text: string } | null = null;
  for (const result of results) {
    const text = cutAtLastComplete(adapter.text(result));
    if (text.length > 0 && (best === null || text.length > best.text.length)) best = { result, text };
  }
  if (best) return adapter.withText(best.result, best.text);
  const first = results[0]!;
  return adapter.withText(first, withoutUnclosedCitation(adapter.text(first)).trimEnd());
}

/** The second attempt, or null when it fails or the turn reaches the ceiling first. */
async function attemptWithin<T>(again: (signal: AbortSignal) => Promise<T>, budgetMs: number): Promise<T | null> {
  if (budgetMs <= 0) return null;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ceiling = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, budgetMs);
  });
  const attempt = Promise.resolve()
    .then(() => again(controller.signal))
    .catch((error: unknown) => {
      // Only the class: an SDK error can echo the request.
      console.warn(
        `[answer-length-guard] second attempt failed: ${error instanceof Error ? error.constructor.name : typeof error}`,
      );
      return null;
    });
  try {
    return await Promise.race([attempt, ceiling]);
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------- the cut -- */

const LIST_ITEM = /^\s{0,8}(?:[-*+•]|\d{1,3}[.)])\s/;
const HEADING = /^\s{0,3}#{1,6}(?:\s|$)/;
const TABLE_ROW = /^\s*\|/;
const FENCE = /^\s*```/;
/** "**Week 2**" or "**Week 2:**" on its own line: a label with nothing under it yet. */
const BOLD_LABEL = /^\s*(?:\*\*|__)[^*_\n]+(?:\*\*|__)\s*:?\s*$/;
const RULE = /^\s*(?:[-*_]\s*){3,}$/;
/** A full stop that ends a sentence, with any closing marks and closed [S#] markers after it. */
const TERMINATOR = /[.!?]["'”’)*_]*(?:\s*\[S\d+\])*(?=\s|$)/g;
/** Words whose full stop is not the end of a sentence ("p. 19", "e.g. the"). */
const ABBREVIATION = /(?:^|[\s(])(?:p|pp|e\.g|i\.e|vs|no|approx|mr|mrs|ms|dr|st|jr|sr)$/i;

/**
 * The text up to its last complete sentence or list item. The last line is
 * where the stop fell: a list item, heading or table row there is dropped
 * whole, and a paragraph keeps its sentences up to the last full stop. A
 * heading, bold label or "…:" lead-in left with nothing under it goes too.
 * Empty when not one complete sentence or item was written.
 */
export function cutAtLastComplete(text: string): string {
  const lines = text.replace(/\s+$/, "").split("\n");
  const last = lines.pop() ?? "";
  if (!LIST_ITEM.test(last) && !HEADING.test(last) && !TABLE_ROW.test(last) && !FENCE.test(last)) {
    const sentences = completeSentences(last);
    if (sentences.length > 0) lines.push(sentences);
  }
  dropDanglingTail(lines);
  if (lines.filter((line) => FENCE.test(line)).length % 2 === 1) {
    let open = lines.length - 1;
    while (open >= 0 && !FENCE.test(lines[open]!)) open -= 1;
    lines.splice(open);
    dropDanglingTail(lines);
  }
  return withoutUnclosedCitation(lines.join("\n")).trimEnd();
}

/** The line up to and including its last sentence-ending full stop; empty when it has none. */
function completeSentences(line: string): string {
  let end = 0;
  for (const match of line.matchAll(TERMINATOR)) {
    const at = match.index ?? 0;
    if (ABBREVIATION.test(line.slice(0, at))) continue;
    const after = line.slice(at + match[0].length).trimStart();
    if (after.length > 0 && /^[a-z0-9]/.test(after)) continue;
    end = at + match[0].length;
  }
  return line.slice(0, end).trimEnd();
}

function dropDanglingTail(lines: string[]): void {
  while (lines.length > 0) {
    const tail = lines[lines.length - 1]!;
    if (tail.trim() === "" || HEADING.test(tail) || BOLD_LABEL.test(tail) || RULE.test(tail) || /:\s*$/.test(tail)) {
      lines.pop();
      continue;
    }
    return;
  }
}

/** A trailing "[S5", "[S" or "[" that was never closed. */
export function withoutUnclosedCitation(text: string): string {
  return text.replace(/\s*\[[^\]\n]{0,40}$/, "");
}

/** The SDK message the answer call returns: its text blocks are the reply. */
interface MessageLike {
  readonly stop_reason?: string | null;
  readonly content?: readonly { readonly type: string; readonly text?: string }[];
}

const MESSAGE: LengthAdapter<MessageLike> = {
  stopReason: (message) => message.stop_reason ?? null,
  text: (message) =>
    (message.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text ?? "")
      .join("\n")
      .trim(),
  withText: (message, text) => ({ ...message, content: [{ type: "text", text, citations: null }] }),
};

/**
 * The answer call's stand-in for `withTruncationRetry` while the guard is on:
 * the first reply, and for a cut one, the same budget once more within the
 * turn's time or a clean cut. It never throws "truncated".
 */
export function answerLengthRetry(guard: AnswerLengthGuard): typeof withTruncationRetry {
  return async <T extends { readonly stop_reason?: string | null }>(
    maxTokens: number,
    call: (maxTokens: number) => Promise<T>,
  ): Promise<T> => {
    const first = await call(maxTokens);
    // `call` takes no signal here, so a second reply still running at 60 s is abandoned, not aborted.
    return settleAnswerLength(guard, first, () => call(maxTokens), MESSAGE as unknown as LengthAdapter<T>);
  };
}
