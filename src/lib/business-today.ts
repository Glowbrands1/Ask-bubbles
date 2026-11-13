import { formDateBusinessTodayEnabled } from "@/lib/config/chat-quality-flags";

import { businessToday } from "./business-date";

/**
 * FORM_DATE_BUSINESS_TODAY_ENABLED (live bug, QA, 13 Nov 2026; ported from the sibling app): "today" as a business
 * date was the UTC date (`toISOString().slice(0, 10)`), already tomorrow from about 6–7 PM Central. Here the form's
 * date and the preview already use `businessToday()`; the day Woven's termination and new-hire dates are read
 * against did not, so a termination or a hire dated tomorrow was applied that evening. With the flag on it is the
 * business date (`business-date.ts` businessToday, in BUSINESS_TIMEZONE). Off, the UTC date, exactly as before.
 */
export function recordToday(now: Date = new Date()): string {
  return formDateBusinessTodayEnabled() ? businessToday(now) : now.toISOString().slice(0, 10);
}
