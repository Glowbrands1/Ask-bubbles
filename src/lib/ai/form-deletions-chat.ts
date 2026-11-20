import { formatBusinessTime } from "@/lib/business-date";

/**
 * ============================================================================
 * WHO DELETED A FORM, IN CHAT (port from Ask Sunny, board f066; Pau approved 20 Nov 2026)
 * ============================================================================
 *
 * Every deleted form now leaves an append-only record (`form_instance_deletions`,
 * `20261120001000_form_instance_deletions.sql`). This app's AI reads the app only through its readers (CLAUDE.md §5),
 * so an administrator's "who deleted <name>'s form?" gets the record as a FORM DELETION RECORD block. Administrators
 * only (the roles with Manage users), as the record itself is; anyone else gets a one-line decline and nothing from it.
 *
 * Pure: the question reader and the block's words. The read is `form-deletions-chat-read.ts`.
 */

/** One row of the record, as the block reads it (never the snapshot). */
export interface FormDeletionRow {
  readonly templateName: string | null;
  readonly employeeName: string | null;
  readonly formDate: string | null;
  readonly status: string | null;
  readonly locationName: string | null;
  readonly deletedBy: string | null;
  /** The deleter's name from the user directory, when the account is found. */
  readonly deletedByName: string | null;
  readonly deletedByRole: string | null;
  readonly deletedVia: string;
  readonly deletedAt: string;
}

/** The day the record began: a form deleted before it was never recorded. */
export const FORM_DELETIONS_SINCE = "Nov 20, 2026";
export const FORM_DELETIONS_MAX = 20;

const ASKS = /\b(?:who|which\s+\w+|when\s+was|when\s+were)\b[^.?!\n]{0,40}\bdeleted?\b|\bdeleted\b[^.?!\n]{0,40}\bforms?\b|\bdeletion\s+record\b/i;

/** Whether the turn asks who deleted a form ("who deleted Test Testy's form", "which forms were deleted"). */
export function asksWhoDeletedAForm(question: string): boolean {
  return ASKS.test(question ?? "");
}

/** The employee a "who deleted <name>'s form" names, as typed; null when it names none. */
export function deletedFormsEmployee(question: string): string | null {
  const said = /\bdeleted\s+(?:the\s+)?([\p{L}][\p{L}' -]{1,60}?)['’]s?\s+(?:\w+\s+){0,3}?(?:forms?|drafts?|ca|write-?ups?|coaching)\b/iu.exec(question ?? "");
  const name = said?.[1]?.trim() ?? "";
  return name && !/^(?:my|our|her|his|their|a|an|this|that|the)$/i.test(name) ? name : null;
}

const VIA: Record<string, string> = {
  route: "Forms Register",
  chat: "in chat",
  demo_sweep: "the demo records clean-up",
  other: "outside the app (directly in the database)",
};

export function formDeletionsNotPermittedBlock(): string {
  return "FORM DELETION RECORD\n\nWho deleted a form is for administrators only. Nothing from the record was read; say so plainly, in one line.";
}

export function formDeletionsUnavailableBlock(): string {
  return "FORM DELETION RECORD\n\nThe deletion record could not be read just now. Say so; never guess who deleted a form.";
}

/** The block the answering model reads. */
export function formatFormDeletionsBlock(rows: readonly FormDeletionRow[], employee: string | null): string {
  const since = `The record starts on ${FORM_DELETIONS_SINCE}: a form deleted before then was not recorded.`;
  if (rows.length === 0) {
    return `FORM DELETION RECORD\n\nNo deleted form is on record${employee ? ` for ${employee}` : ""}. ${since}`;
  }
  const lines = rows.map((row) => {
    const who = row.deletedByName ?? (row.deletedBy ? `account ${row.deletedBy}` : "not recorded (deleted outside the app)");
    const when = formatBusinessTime(row.deletedAt, { year: true }) ?? row.deletedAt;
    return `- ${row.templateName ?? "Form"} for ${row.employeeName ?? "(no name)"}${row.formDate ? `, dated ${row.formDate}` : ""}${row.status ? ` (${row.status})` : ""}${row.locationName ? `, ${row.locationName}` : ""}: deleted ${when} by ${who}${row.deletedByRole ? ` (${row.deletedByRole})` : ""}, ${VIA[row.deletedVia] ?? row.deletedVia}.`;
  });
  return [
    "FORM DELETION RECORD",
    "",
    `Who deleted each form, when and how, newest first${employee ? ` (forms for ${employee})` : ""}. Give them as listed; never guess one not listed.`,
    ...lines,
    ...(rows.length === FORM_DELETIONS_MAX ? [`Only the latest ${FORM_DELETIONS_MAX} are listed.`] : []),
    since,
  ].join("\n");
}
