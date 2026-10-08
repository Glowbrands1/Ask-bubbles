import { AiError } from "./errors";

/**
 * ============================================================================
 * A RESPONSE THAT RAN OUT OF ROOM IS NOT AN ANSWER
 * ============================================================================
 *
 * When the model reaches `max_tokens` it stops wherever it is — mid-sentence,
 * or part-way through the JSON of a tool call. The text that comes back looks
 * like an answer, and the tool input parses into whatever fields were finished
 * before the cut. Neither says it is incomplete:
 *
 *   - a chat answer ends mid-sentence, possibly mid-way through a policy, and
 *     is shown as if it were the whole reply;
 *   - a drafted or revised form field is stored ending mid-sentence on an HR
 *     record, or the fields after the cut are silently left out.
 *
 * So `stop_reason: "max_tokens"` is checked on every model call that produces
 * something a manager reads or a form stores. The call is made ONCE MORE with a
 * larger budget — thinking shares the budget with the answer, so a long answer
 * after a long think is the usual cause, and more room usually fixes it. If it
 * is cut off again, nothing from either attempt is used: the caller gets an
 * `AiError("truncated")` whose message says what was not done.
 */

/** The budget a retry may grow to. Above the largest configured budget. */
export const TRUNCATION_RETRY_CEILING = 16_000;

interface MaybeTruncated {
  readonly stop_reason?: string | null;
}

export function wasTruncated(response: MaybeTruncated): boolean {
  return response.stop_reason === "max_tokens";
}

/** The retry's budget: double, within the ceiling, and never less than asked. */
export function retryBudget(maxTokens: number): number {
  return Math.max(maxTokens, Math.min(maxTokens * 2, TRUNCATION_RETRY_CEILING));
}

/**
 * Makes the call; if it ran out of room, makes it again with a larger budget;
 * if that ran out of room too, throws `AiError("truncated", message)`.
 *
 * `message` is written for the manager and says what did NOT happen ("nothing
 * was written to the form"), because that is what they need to know.
 */
export async function withTruncationRetry<T extends MaybeTruncated>(
  maxTokens: number,
  call: (maxTokens: number) => Promise<T>,
  message: string,
): Promise<T> {
  const first = await call(maxTokens);
  if (!wasTruncated(first)) return first;

  const larger = retryBudget(maxTokens);
  console.warn(`[ai] response cut off at max_tokens=${maxTokens}; retrying once with ${larger}`);
  if (larger > maxTokens) {
    const second = await call(larger);
    if (!wasTruncated(second)) return second;
  }

  console.warn(`[ai] response cut off again at max_tokens=${larger}; nothing from it is used`);
  throw new AiError("truncated", message, 502);
}
