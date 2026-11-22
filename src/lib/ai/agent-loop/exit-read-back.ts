import { EXIT_ROLE_LABEL } from "@/lib/forms/exit-facts";
import { EXIT_DETAIL_LABEL } from "@/lib/forms/exit-library";

import { readDates } from "./dates";

/**
 * ============================================================================
 * AN EXIT CARD'S REPLY READS BACK ONLY WHAT CREATE SAVES (QA's Bubbles round 2, 22 Nov 2026, U22; Pau's "as you said only
 * for manager facts")
 * ============================================================================
 *
 * T1 "create exit for <P>. <P>'s last day worked was TBD. On 11-14-26 General Manager, <G>, messaged <P> via woven … <P>
 * messaged back stating she did not work 11-13-26 and she was quitting effective immediately." The reply read back
 * "**Date that notice was given:** 11/14/2026" (never stated, never saved) and labelled the account "**Reason for
 * Resignation:**" (it is saved to Additional Details).
 *
 *   READ BACK   the exit card's result lists the lines Create will save, each "**<the form's label>:** <value>": the
 *               dates the exit form's own reader read (`exit_dates`) and the account under the field it is saved to
 *               (Reason for Resignation on a termination, Additional Details otherwise).
 *   CHECK       a reply line labelled with one of the exit form's own date or detail labels that is not one of those
 *               lines goes back to the model once; still there, it is left out of the reply. The labels are the form's
 *               own (`EXIT_ROLE_LABEL`, `EXIT_DETAIL_LABEL`, "Additional Details"), never a list of phrasings.
 */

export const EXIT_ACCOUNT_LABEL = { termination: EXIT_DETAIL_LABEL.resignationReason, resignation: "Additional Details" } as const;

const CHECKED_LABELS: readonly string[] = [...new Set([...Object.values(EXIT_ROLE_LABEL), EXIT_DETAIL_LABEL.resignationReason, EXIT_ACCOUNT_LABEL.resignation])];

const flat = (text: string) => text.toLowerCase().replace(/[*_]/g, "").replace(/[^a-z0-9/]+/g, " ").trim();

/** The lines Create saves for this exit card, as the reply may read them back. */
export function exitReadBack(input: { readonly dateLines: readonly string[]; readonly account: string | null; readonly termination: boolean }): string[] {
  const label = input.termination ? EXIT_ACCOUNT_LABEL.termination : EXIT_ACCOUNT_LABEL.resignation;
  return [...input.dateLines, ...(input.account?.trim() ? [`**${label}:** ${input.account.trim()}`] : [])];
}

interface LabelledLine {
  readonly label: string;
  readonly value: string;
  readonly line: string;
}

function labelledLines(reply: string): LabelledLine[] {
  const out: LabelledLine[] = [];
  for (const line of reply.split("\n")) {
    const match = /^\s*(?:[-*]\s+)?\*\*([^*:]+):?\*\*:?\s*(.*)$/.exec(line);
    if (!match) continue;
    const label = CHECKED_LABELS.find((known) => known.toLowerCase() === match[1]!.trim().toLowerCase());
    if (label) out.push({ label, value: match[2]!.trim(), line });
  }
  return out;
}

/** A reply line under one of the exit form's labels the card does not save that way ("<label> (<value>)"). */
function unsaved(reply: string, readBack: readonly string[]): LabelledLine[] {
  const saved = readBack.map((line) => labelledLines(line)[0]).filter((line): line is LabelledLine => Boolean(line));
  const dateLabels = new Set<string>(Object.values(EXIT_ROLE_LABEL));
  return labelledLines(reply).filter((said) => {
    /* A date line that states no date ("**Last Day Worked:** not set — you said TBD") claims nothing. */
    if (dateLabels.has(said.label) && readDates(said.value).length === 0) return false;
    const same = saved.find((line) => line.label === said.label);
    if (!same) return true;
    /* The value may be cut short in the reply ("…"), never another value. */
    const value = flat(said.value).replace(/\s*$/, "");
    return value !== "" && !flat(same.value).startsWith(value.slice(0, Math.max(1, Math.min(value.length, 40))));
  });
}

export function exitReadBackMismatch(reply: string, readBack: readonly string[] | null | undefined): string[] {
  if (!readBack) return [];
  return unsaved(reply, readBack).map((line) => `exit field "${line.label}" (${line.value.slice(0, 80)})`);
}

/** The reply without the lines the card does not save. */
export function withoutUnsavedExitLines(reply: string, readBack: readonly string[] | null | undefined): string {
  if (!readBack) return reply;
  const drop = new Set(unsaved(reply, readBack).map((line) => line.line));
  return reply.split("\n").filter((line) => !drop.has(line)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
