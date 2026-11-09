import { madeAbout } from "@/lib/ai/make-it-about";

import { datesInText } from "./form-date-answer";

/**
 * STEP_B_MAKE_IT_ABOUT_ACCOUNT_ENABLED (QA's live round-6 trace, Ask Bubbles, 9 Nov 2026): the one date the made-about
 * incident is told with ("make it about leaving the front desk unattended on 11/6/26" → 2026-11-06), or null (no
 * "make it about", no date, or more than one). The new account follows this date, not the form's old one.
 */
export function madeAboutDate(question: string, today: string | undefined): string | null {
  const about = madeAbout(question);
  if (!about || !today) return null;
  const dates = [...new Set(datesInText(about, today).flatMap((date) => (date.iso ? [date.iso] : [])))];
  return dates.length === 1 ? dates[0]! : null;
}
