import { resentRequestIsYesEnabled } from "@/lib/config/chat-quality-flags";

/*
 * ============================================================================
 * THE SAME REQUEST AGAIN, WHILE "IS THIS FOR <NAME>?" WAITS, IS A YES (RESENT_REQUEST_IS_YES_ENABLED)
 * ============================================================================
 *
 * QA (12 Nov 2026), found on production's flags: a manager asked for an exit form with a pasted letter, the reply was
 * "Is this for **<roster name>**? Tell me if that should change.", and the manager sent the same request again (or the
 * same letter with "I need an exit form with this information." before it). The reply was "Who is this **Resignation/
 * Exit Form** for?": the name the app itself had offered was lost. Sending the request again does not turn the name
 * down; it repeats who it is for. With the flag on, such a turn is read as "yes" to the pending question; the stored
 * message is unchanged. Off, as before. Pure.
 */

const ASKED = /^Is this for \*\*([^*\n]+)\*\*\? Tell me if that should change\.\s*$/;
/** Long enough to be the same request or letter, not a short answer that happens to match. */
const MIN_REPEAT = 40;

interface Turn {
  readonly role: string;
  readonly content: string;
}

const norm = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

/** The question read as "yes" when it repeats the request the pending "Is this for <name>?" was asked about. */
export function withResentRequestAsYes<A extends { question: string; history: readonly Turn[] }>(asked: A): A | null {
  if (!resentRequestIsYesEnabled()) return null;
  const last = asked.history[asked.history.length - 1];
  if (!last || last.role !== "assistant" || typeof last.content !== "string" || !ASKED.test(last.content.trim())) return null;
  const before = [...asked.history.slice(0, -1)].reverse().find((turn) => turn.role === "user" && typeof turn.content === "string");
  if (!before) return null;
  const said = norm(asked.question);
  const earlier = norm(before.content);
  const repeats = said === earlier || (earlier.length >= MIN_REPEAT && said.includes(earlier)) || (said.length >= MIN_REPEAT && earlier.includes(said));
  return repeats ? { ...asked, question: "yes" } : null;
}
