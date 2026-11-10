import { formatManualCitation } from "@/lib/ai/policy-citation-fields";

import { workAreaAbsenceCitesConductEnabled } from "@/lib/config/chat-quality-flags";

import { describedAttendanceKeys, readCaPolicy, statedOffenseKeys } from "./ca-policy";
import { manualSectionsFor, type ManualChunk } from "./official-policy-manual";
import { specificTopic, specificTopicSection } from "./specific-policy-topics";

/**
 * ============================================================================
 * THE COACHING CARD CITES THE POLICY ITS ACCOUNT FALLS UNDER
 * ============================================================================
 *
 * COACHING_CARD_POLICY_ENABLED (QA's live test, Ask Bubbles production, 8 Nov 2026; port of the sibling app's card
 * citation). "my employee <A> was late on 10-20-26, create a coaching form" gave a Coaching card with no policy line;
 * the sibling app's card reads "Attendance Policy, JBA Policy Manual p.14" (`ai/form-card-slots.ts`
 * attachFormTurnSources, called after its forms path). Not on purpose here: this app never had the step.
 *
 * On a Coaching or Follow-Up Coaching card that cites no manual line yet, the sections the account points at (a
 * policy the manager named, or the attendance boxes it describes, or the Standards of Conduct it reads as) are cited
 * by the manual's heading and the page it prints. A section the manual does not state, or prints no page for, is not
 * cited. Pure: the caller decides when the flag applies, and reads the manual.
 */

const COACHING_TEMPLATES = new Set(["coaching", "follow-up-coaching"]);
const MANUAL_LINE = /\bJBA Policy Manual\b/i;

export function withCoachingCardPolicy(input: {
  readonly content: string;
  readonly templateKey: string | null | undefined;
  /** The manager's turns, one per line. */
  readonly notes: string;
  readonly chunks: readonly ManualChunk[];
}): string {
  if (!input.templateKey || !COACHING_TEMPLATES.has(input.templateKey)) return input.content;
  if (MANUAL_LINE.test(input.content) || input.chunks.length === 0) return input.content;
  const reading = readCaPolicy(input.notes);
  const keys =
    statedOffenseKeys(reading, input.notes) ??
    describedAttendanceKeys(input.notes) ??
    (reading.suggestion === "standards_of_conduct" && !reading.ambiguous ? ["standards_of_conduct"] : []);
  if (keys.length === 0) return withWorkAreaAbsence(input);
  const lines = manualSectionsFor({ chunks: input.chunks, offenseKeys: keys, notes: input.notes })
    .filter((section) => section.page > 0)
    .map((section) => formatManualCitation(section.heading, section.page));
  if (lines.length === 0) return input.content;
  return `${input.content.trim()}\n\n${[...new Set(lines)].join("\n")}`.trim();
}

/**
 * WORK_AREA_ABSENCE_CITES_CONDUCT_ENABLED (Pau's decision, 9 Nov 2026): "left the front desk unattended" on a Coaching
 * card cites the Standards of Conduct line for an unauthorized absence from the work area, by the page the manual prints
 * for it (`forms/specific-policy-topics.ts`).
 * Only this incident: the other specific topics are left as they were on a Coaching card. Off, the content as it was.
 */
function withWorkAreaAbsence(input: { readonly content: string; readonly notes: string; readonly chunks: readonly ManualChunk[] }): string {
  if (!workAreaAbsenceCitesConductEnabled() || specificTopic(input.notes)?.id !== "work_area_absence") return input.content;
  const found = specificTopicSection({ text: input.notes, chunks: input.chunks });
  if (!found) return input.content;
  const lines = [found.section].filter((section) => section.page > 0).map((section) => formatManualCitation(section.heading, section.page));
  if (lines.length === 0) return input.content;
  return `${input.content.trim()}\n\n${[...new Set(lines)].join("\n")}`.trim();
}
