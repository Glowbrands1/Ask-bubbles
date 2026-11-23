import "server-only";

import { offeredInChooser } from "@/lib/forms/chooser";
import { type TemplateSummary } from "@/lib/forms/repository";
import { DEFAULT_PERMISSION_MATRIX, hasPermission } from "@/lib/permissions";
import type { ChatFormSelection } from "@/types";

import type { ChatActor } from "./form-proposal";
import type { AskResponse } from "./types";

/**
 * ============================================================================
 * A FORM THE LIBRARY DOES NOT HAVE IS SAID SO, WITH THE FORMS THAT EXIST (board f099, QA, 23 Nov 2026)
 * ============================================================================
 *
 * The old chat, a Coaching card open: "can you make a store manager interview form" came back as the open Coaching
 * card again, and in a fresh chat as "Which form do you need?" with nothing saying that form doesn't exist. A turn whose
 * own words ask for a form outside the library (`namesFormNotInLibrary`) is answered here: the form isn't in the
 * library (named by the form's own words, `formNameNotInLibrary`, never the whole message), then the forms this person can create, as the chooser lists them (Coaching first, withheld forms left out).
 * No card is proposed, so a card already open stays as it was.
 */
const PRIMARY_TEMPLATE_KEY = "coaching";

export function formNotInLibraryReply(
  summaries: readonly TemplateSummary[],
  actor: ChatActor,
  formName: string | null,
  /** The template of the card on screen, if any: its menu would be dropped (NO_SELECTION_ON_OPEN_CARD), so the forms are named in the reply and the card is said to be still open. */
  openTemplateKey?: string | null,
): AskResponse {
  const offered = summaries
    .filter((summary) => summary.active && summary.currentVersion?.status === "published")
    .filter((summary) => Boolean(actor.role) && hasPermission(DEFAULT_PERMISSION_MATRIX, actor.role!, summary.requiredPermission as Parameters<typeof hasPermission>[2]))
    .filter((summary) => offeredInChooser(summary.key));
  const primary = offered.find((summary) => summary.key === PRIMARY_TEMPLATE_KEY) ?? offered[0];
  const missing = formName ? `There's no ${formName} form in the forms library` : "That form isn't in the forms library";
  if (!primary) {
    return { content: `${missing}, and there are no published forms available to you right now. An administrator publishes them under Form Templates.`, citations: [], coverage: "not_applicable" };
  }
  const ordered = [primary, ...offered.filter((summary) => summary.key !== primary.key)];
  if (openTemplateKey) {
    const open = summaries.find((summary) => summary.key === openTemplateKey)?.name;
    const names = ordered.map((summary) => `**${summary.name}**`);
    return {
      content: `${missing}, so I can't start it. The forms you can create are ${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]} — ask for one by name.${open ? ` Your ${open} card is still open above.` : ""}`,
      citations: [],
      coverage: "not_applicable",
    };
  }
  const choice = (summary: TemplateSummary) => ({ templateKey: summary.key, templateName: summary.name, description: summary.description });
  const formSelection: ChatFormSelection = { primary: choice(primary), additional: ordered.slice(1).map(choice) };
  return { content: `${missing}, so I can't start it. These are the forms you can create — choose one:`, citations: [], coverage: "not_applicable", formSelection };
}
