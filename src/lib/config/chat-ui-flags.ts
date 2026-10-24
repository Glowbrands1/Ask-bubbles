/**
 * Visible chat changes. Each one defaults off.
 *
 * These are read with a direct `process.env.NEXT_PUBLIC_…` access so the
 * client bundle can see them. A dynamic `process.env[name]` read is always
 * false in the browser. Unset, empty, "0", "false", and "off" leave the
 * screen as it is.
 */

function on(value: string | undefined): boolean {
  if (typeof value !== "string") return false;
  return ["1", "true", "on", "yes"].includes(value.trim().toLowerCase());
}

/** The reply arrives as text while the model is still writing. */
export function chatStreamingEnabled(): boolean {
  return on(process.env.NEXT_PUBLIC_CHAT_STREAMING_ENABLED);
}

/** A filled / missing list beside a corrective-action card. */
export function fieldChecklistEnabled(): boolean {
  return on(process.env.NEXT_PUBLIC_FIELD_CHECKLIST_ENABLED);
}

/** The card's employee, date, warning, and payroll lines can be edited in place. */
export function inlineCardEditEnabled(): boolean {
  return on(process.env.NEXT_PUBLIC_INLINE_CARD_EDIT_ENABLED);
}

/** Section and page chips that open the cited document. */
export function citationChipsEnabled(): boolean {
  return on(process.env.NEXT_PUBLIC_CITATION_CHIPS_ENABLED);
}

/** Verbal / written and payroll yes / no chips on a corrective-action card. */
export function quickRepliesEnabled(): boolean {
  return on(process.env.NEXT_PUBLIC_QUICK_REPLIES_ENABLED);
}

/** A banner when this conversation has a saved form draft. */
export function resumeDraftEnabled(): boolean {
  return on(process.env.NEXT_PUBLIC_RESUME_DRAFT_ENABLED);
}

/** aria-live on new messages, and focus moves to a new form card. */
export function chatA11yEnabled(): boolean {
  return on(process.env.NEXT_PUBLIC_CHAT_A11Y_ENABLED);
}

export const CHAT_UI_FLAG_NAMES = [
  "NEXT_PUBLIC_CHAT_STREAMING_ENABLED",
  "NEXT_PUBLIC_FIELD_CHECKLIST_ENABLED",
  "NEXT_PUBLIC_INLINE_CARD_EDIT_ENABLED",
  "NEXT_PUBLIC_CITATION_CHIPS_ENABLED",
  "NEXT_PUBLIC_QUICK_REPLIES_ENABLED",
  "NEXT_PUBLIC_RESUME_DRAFT_ENABLED",
  "NEXT_PUBLIC_CHAT_A11Y_ENABLED",
] as const;
