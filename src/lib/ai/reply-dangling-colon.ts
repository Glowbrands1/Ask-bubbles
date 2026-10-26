import { replyNoDanglingColonEnabled } from "@/lib/config/chat-quality-flags";

/**
 * ============================================================================
 * A CHAT REPLY NEVER ENDS ON A LEAD-IN COLON WITH NOTHING AFTER IT
 * ============================================================================
 *
 * QA, 26 Oct 2026 (four chats out of four): the manager typed "ca for test
 * employee at kearney, late today, previous coaching verbal 6/25", no card
 * opened, and the reply ended "Based on what you've described, I can
 * prepare:" with nothing after the colon. The manager is left waiting for a
 * list that never comes.
 *
 * With REPLY_NO_DANGLING_COLON_ENABLED on, that FINAL dangling lead-in (the
 * last sentence of the last non-empty line, or the whole line) is taken out
 * and every other word is kept. Left alone:
 *   - a reply that carries a card (the card is what follows the colon);
 *   - a colon with anything after it: a list, more prose, "at 10:30";
 *   - a colon inside the text; only the very end of the reply is read;
 *   - list items, table rows, quotes and a run of label lines ("Name:" then
 *     "Date:"), which ask the manager to fill something in;
 *   - code fences;
 *   - a reply that would be empty without its lead-in: it is returned as is.
 * Off, the reply is the same object as before.
 */

/** The answer fields that mean a card follows the reply. */
export interface DanglingColonReply {
  readonly content: string;
  readonly formProposal?: unknown;
  readonly formProposals?: readonly unknown[] | null;
  readonly formSelection?: unknown;
  readonly formUpdate?: unknown;
  readonly formOpened?: unknown;
}

/** The hook the chat route calls on every reply. Flag off: the same object. */
export function withoutDanglingColon<T extends DanglingColonReply>(reply: T): T {
  if (!replyNoDanglingColonEnabled()) return reply;
  if (carriesCard(reply)) return reply;
  if (typeof reply.content !== "string") return reply;
  const content = stripDanglingLeadIn(reply.content);
  return content === reply.content ? reply : { ...reply, content };
}

function carriesCard(reply: DanglingColonReply): boolean {
  if (reply.formProposal != null) return true;
  if (Array.isArray(reply.formProposals) && reply.formProposals.length > 0) return true;
  return reply.formSelection != null || reply.formUpdate != null || reply.formOpened != null;
}

const FENCE = /^\s*(```|~~~)/;
/** Markdown that may wrap the end of a line: bold, italics, inline code. */
const TRAILING_MARKUP = /[\s*_`~]+$/;
const LEADING_MARKUP = /^[\s*_`~]+/;
/** A line the manager is asked to fill in, or structure that is not prose. */
const STRUCTURED_LINE = /^\s*(?:[-*+•]\s|\d+[.)]\s|>|\|)/;
const ABBREVIATION = /\b(?:st|mr|mrs|ms|dr|jr|sr|vs|etc|e\.g|i\.e|no|approx|dept|mt|ft)\.$/i;

/** The text of the last line without trailing markdown, and whether it ends on a colon. */
function endsOnColon(line: string): boolean {
  return line.replace(TRAILING_MARKUP, "").endsWith(":");
}

/**
 * The reply without its final dangling lead-in, or the reply unchanged.
 * Never returns an empty reply.
 */
export function stripDanglingLeadIn(content: string): string {
  const lines = content.split("\n");
  // A code fence that is still open: the end of the reply is code.
  if (lines.filter((line) => FENCE.test(line)).length % 2 === 1) return content;

  let last = lines.length - 1;
  while (last >= 0 && lines[last]!.trim() === "") last -= 1;
  if (last < 0) return content;
  const line = lines[last]!;
  if (FENCE.test(line) || STRUCTURED_LINE.test(line) || !endsOnColon(line)) return content;

  // "Name:" then "Date:": a run of labels for the manager to fill in.
  let previous = last - 1;
  while (previous >= 0 && lines[previous]!.trim() === "") previous -= 1;
  if (previous >= 0 && last - previous === 1 && endsOnColon(lines[previous]!)) return content;

  const kept = keptPartOfLine(line);
  const before = lines.slice(0, last);
  const result = (kept ? [...before, kept] : before).join("\n").trimEnd();
  if (result.replace(/[\s*_`~#>-]/g, "") === "") return content;
  return result;
}

/**
 * The part of the last line before its final sentence, when that sentence is
 * the lead-in ("Thanks. Based on what you've described, I can prepare:"), or
 * null when the whole line is the lead-in.
 */
function keptPartOfLine(line: string): string | null {
  const boundary = /([.!?]["')\]]*)(\s+)(?=[*_`~]*[A-Z])/g;
  let cut = -1;
  for (const match of line.matchAll(boundary)) {
    const end = (match.index ?? 0) + match[1]!.length;
    if (ABBREVIATION.test(line.slice(0, end))) continue;
    cut = end;
  }
  if (cut < 0) return null;
  const kept = line.slice(0, cut).trimEnd();
  // A line that opened in markdown ("**Got it. Here is:**") keeps its text, not a stray "**".
  if (kept.replace(LEADING_MARKUP, "").trim() === "") return null;
  const open = (kept.match(/\*\*/g) ?? []).length % 2 === 1;
  return open ? `${kept}**` : kept;
}
