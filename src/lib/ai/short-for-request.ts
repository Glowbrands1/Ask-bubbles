import { shortForRequestEnabled } from "@/lib/config/chat-quality-flags";

import type { AskRequest } from "./types";

/**
 * SHORT_FOR_REQUEST_ENABLED: "ca for <name> …, previous coaching …" asks for
 * the form.
 *
 * QA live run, 26 Oct 2026 (tester 2, P4b conv_mvop6trc2lbk8yz, P4c
 * conv_mvop7h1s28j9ega; names invented): "ca for <name> at <store>, late
 * today, previous coaching verbal 6/25" (and "… and written 7/28") opened no
 * card and offered the form suggestions instead ("Based on what you've
 * described, I can prepare:"); without the prior clause, or as "create a ca
 * for …", the card opened. A prior action in a short request made the request
 * read as a description of what happened.
 *
 * Before any reader sees a manager turn, a turn that opens "ca / c/a /
 * coaching / coach / exit (form) for <name>" and names a prior action
 * ("previous coaching", "prior verbal", "written 7/28") is read with "create
 * a" (or "create an" before "exit") in front. The rest stays as typed. Off,
 * every turn is read as typed.
 *
 * QA-4, 26 Oct 2026: a prior action that is denied ("she has no previous
 * coaching", "never had a previous verbal", "without any previous coaching",
 * "previous coaching was not documented") or that follows a question ("ca for
 * <name>? no, previous coaching verbal 6/25") is not a prior action the request
 * names, and the turn is read as typed.
 */

const SHORT_FOR = /^\s*(?:(?:verbal|written)\s+)?(?:ca|c\/a|dpoa|coaching|coach|exit)(?:\s+form)?\s+for\s+\S/i;
const PRIOR = /\b(?:previous|prior|past)\s+(?:coaching|coached|verbal|written|warnings?|cas?|corrective\s+actions?)\b/i;
const DENIED_BEFORE = /\b(?:no(?!\s+(?:call|show)\b)|never|not|without|nor|nothing|none)\b(?:\s+[a-z'’]+){0,3}\s*$/i;
const DENIED_AFTER = /^\s*(?:\S+\s+){0,2}?(?:(?:was|were|is|has|had|have)\s+)?(?:not|never)\b|^\s*(?:\S+\s+){0,2}?(?:wasn'?t|weren'?t|isn'?t|hasn'?t|hadn'?t)\b/i;

export function withShortForRequest(request: AskRequest): AskRequest {
  if (!shortForRequestEnabled()) return request;
  const question = shortForRequest(request.question);
  let changed = question !== request.question;
  const history = request.history.map((turn) => {
    if (turn.role !== "user" || typeof turn.content !== "string") return turn;
    const content = shortForRequest(turn.content);
    if (content === turn.content) return turn;
    changed = true;
    return { ...turn, content };
  });
  return changed ? { ...request, question, history } : request;
}

/** "ca for <name> …, previous coaching …" as "create a ca for <name> …". */
export function shortForRequest(text: string): string {
  if (typeof text !== "string" || !SHORT_FOR.test(text)) return text;
  const prior = PRIOR.exec(text);
  if (!prior) return text;
  const before = text.slice(0, prior.index);
  const after = text.slice(prior.index + prior[0].length);
  if (before.includes("?") || DENIED_BEFORE.test(before) || DENIED_AFTER.test(after)) return text;
  const typed = text.trimStart();
  return `${/^exit\b/i.test(typed) ? "create an" : "create a"} ${typed}`;
}
