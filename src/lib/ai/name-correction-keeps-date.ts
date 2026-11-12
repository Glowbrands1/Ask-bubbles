import { nameCorrectionKeepsDateEnabled } from "@/lib/config/chat-quality-flags";
import { extractFormDate } from "@/lib/forms/form-date-answer";

import type { AskRequest, AskResponse } from "./types";

/**
 * ============================================================================
 * A NAME CORRECTION NEVER CLEARS THE CARD'S DATE
 * ============================================================================
 *
 * NAME_CORRECTION_KEEPS_DATE_ENABLED (QA, 11 Nov 2026; Gate-Bubbles' probe of s14 path 1; default off). "help me create a
 * coaching form" → "October 1st" → "ok, create a follow-up coaching form for rozline quellmar. …" → "Is this for **Rozlyn
 * Quellmar**?" → "Oops, it's Rozlyn quellmar": the card held 2026-10-01 until the answer, then lost it, on production's
 * flags too. The answer is read as the request again with the name in full (`first-name-suggest.ts`), a fresh request's
 * turns start at it, and the card's date is not carried in the conversation's history; every later card for her lost it
 * too. On: a card for the person whose name the manager corrected in answer to "Is this for …?" / "Did you mean …?" that
 * has no date of its own takes the date the manager gave before that question (their latest turn that names one, at most
 * four turns back). Only a missing date is filled; a date the turn gives is the turn's. Off: the response as built.
 */
const ASKED = /^(?:Is this for \*\*([^*]+)\*\*\? Tell me if that should change\.|Did you mean (.+?)\? Tell me which, or give the full name\.)/;
const LOOK_BACK = 4;

type Turn = { readonly role: string; readonly content: unknown };

/** The date the manager gave before the latest name question answered about `employee`, or null. */
function dateBeforeCorrection(history: readonly Turn[], employee: string, today: string): string | null {
  const name = employee.trim().toLowerCase();
  for (let at = history.length - 1; at >= 0; at -= 1) {
    const turn = history[at]!;
    if (turn.role !== "assistant") continue;
    const asked = ASKED.exec(String(turn.content).trim());
    if (!asked) continue;
    const options = asked[1] ? [asked[1]] : [...(asked[2] ?? "").matchAll(/\*\*([^*]+)\*\*/g)].map((match) => match[1]!);
    if (!options.some((option) => option.trim().toLowerCase() === name)) continue;
    const said = history.slice(0, at).filter((earlier) => earlier.role === "user").slice(-LOOK_BACK).reverse();
    for (const earlier of said) {
      const date = extractFormDate(String(earlier.content), today);
      if (date) return date;
    }
    return null;
  }
  return null;
}

export function withNameCorrectionDate(response: AskResponse, request: Pick<AskRequest, "history" | "context">): AskResponse {
  if (!nameCorrectionKeepsDateEnabled()) return response;
  const card = response.formProposal;
  if (!card || card.formDate || !card.employeeName) return response;
  const formDate = dateBeforeCorrection(request.history ?? [], card.employeeName, request.context.todayIso);
  return formDate ? { ...response, formProposal: { ...card, formDate } } : response;
}
