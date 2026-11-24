import { describedAttendanceKeys } from "@/lib/forms/ca-policy";

/**
 * ============================================================================
 * DID THE MANAGER'S WORDS SAY WHAT KIND OF ATTENDANCE IT WAS? (QA's live re-test, 21 Nov 2026, item 25)
 * ============================================================================
 *
 * propose_form requires the attendance kind (absence, lateness, left early, both) on a Corrective Action card citing
 * Attendance, so a missed shift is never written up as lateness (QA's review of #1137). "create ca form for <A> for
 * violating attendance policy on 10-20-26. verbal. no payroll deduct. jba manual 1-1-26 for previous coaching" says no
 * kind at all: the card was refused, the model could only ask, and "verbal" (no kind either) was refused again.
 *
 * This only decides whether the refusal applies: where the request's words describe a kind, the model must pass it on
 * evidence as before; where they describe none, the card is made without one and the kind is asked beside it. It never
 * sets the kind: that is the model's, kept only on the manager's quoted words.
 */
const LEFT_EARLY =
  /\b(?:left|leaving|leaves|went\s+home|clocked\s+out|clocking\s+out|walked\s+out|walking\s+out)\b[^.!?\n]{0,30}?\b(?:early|before\s+(?:the\s+end|close|closing|her|his|their|the)\b|mid[- ]?shift)|\bwalked\s+(?:out|off)\b/i;

/** A shift missed, in the words the tool's own description gives for an absence (did not come in, called out, …). */
const ABSENCE_SAID =
  /\b(?:did\s*n[o']?t|didnt|never)\s+(?:come|show|make\s+it|report)\b|\bcall(?:ed|s)?[- ]?(?:out|off|in\s+sick)\b|\bmiss(?:ed|es|ing)\s+(?:(?:her|his|their|a|the|a\s+scheduled|her\s+scheduled|his\s+scheduled|their\s+scheduled)\s+)?shifts?\b|\bno[- ]?show\b/i;

export function attendanceKindSaid(requestWords: string): boolean {
  return describedAttendanceKeys(requestWords) !== null || LEFT_EARLY.test(requestWords) || ABSENCE_SAID.test(requestWords);
}

/** The one question the card asks beside itself, when the words say no kind. */
export const ATTENDANCE_KIND_QUESTION = "Was it an absence, lateness or leaving early?";
