import { dateReaskFreshEnabled } from "@/lib/config/chat-quality-flags";
import { askedForDate } from "@/lib/forms/incident-dates";

import type { AskRequest, AskResponse } from "./types";

/**
 * DATE_REASK_FRESH_ENABLED (QA D3, 27 Oct 2026, conv_mvpyha5v22c52vd): after
 * the date question, "10/5 and 10/15" did not pick one, and the app asked
 * again — in a reply byte for byte the same as the one before, so nothing on
 * the screen changed and it looked as if the app had not answered. With the
 * flag on, a reply that asks the date question again right after asking it,
 * to a turn that gave dates, leads with a line that says no date was picked, then the question, then
 * the rest of the card as built. The question's own words do not change, so
 * the next turn still reads its answer.
 */
const NOT_PICKED = "That doesn't pick one date yet.";
/** The turn tried to answer with dates ("10/5 and 10/15"); "verbal" or "no payroll deduct" answer another question. */
const GIVES_DATES = /\b\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b/;

export function withFreshDateReask(response: AskResponse, request: AskRequest): AskResponse {
  if (!dateReaskFreshEnabled() || !GIVES_DATES.test(request.question) || !askedForDate(response.content)) return response;
  const lastAssistant = [...(request.history ?? [])].reverse().find((turn) => turn.role === "assistant");
  if (!lastAssistant || !askedForDate(String(lastAssistant.content))) return response;
  const paragraphs = response.content.split(/\n{2,}/);
  const at = paragraphs.findIndex((paragraph) => askedForDate(paragraph));
  const question = paragraphs.splice(at, 1)[0]!;
  return { ...response, content: [`${NOT_PICKED} ${question}`, ...paragraphs].join("\n\n") };
}
