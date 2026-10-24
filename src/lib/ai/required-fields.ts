import { CORRECTIVE_ACTION_INTAKE, readCorrectiveActionIntake } from "@/lib/forms/corrective-action-intake";
import type { ChatFormProposal } from "@/types";

/**
 * Template fields still empty on a proposal.
 *
 * The list is the corrective-action intake the form already asks, not a
 * second checklist. A name the manager typed is present even when Woven
 * has nobody by that name. Optional intake lines (the job title) are not
 * listed. Nothing here removes the card or the duplicate-create guard.
 */

export interface MissingRequiredField {
  readonly key: string;
  readonly label: string;
}

const CORRECTIVE = /corrective|dpoa/i;

export function missingRequiredFields(proposal: ChatFormProposal, notes: string): MissingRequiredField[] {
  if (!CORRECTIVE.test(`${proposal.templateKey} ${proposal.templateName}`)) return [];
  const typedName = proposal.employeeName?.trim() ?? "";
  const intake = readCorrectiveActionIntake({
    text: notes,
    employeeKnown: typedName.length > 0,
    salonSettled: Boolean(proposal.locationId),
    payrollDeduct: proposal.payrollDeduct ?? null,
  });
  const held = new Set(intake.supplied.map((item) => item));
  if (typedName) held.add("employee_name");
  if (proposal.locationId) held.add("salon");
  if (proposal.formDate) held.add("form_date");
  if (proposal.issue?.trim()) held.add("what_happened");
  if (proposal.warningLevel) held.add("warning_level");
  if (proposal.payrollDeduct === "yes" || proposal.payrollDeduct === "no") held.add("payroll_deduct");
  if (proposal.employeeRole?.trim()) held.add("job_title");

  return CORRECTIVE_ACTION_INTAKE.filter((item) => !item.optional && !held.has(item.key)).map((item) => ({
    key: item.key,
    label: item.prompt,
  }));
}

/** One sentence after the card. Empty when nothing required is missing. */
export function requiredFieldSentence(missing: readonly MissingRequiredField[]): string {
  if (missing.length === 0) return "";
  const labels = missing.map((item) => item.label);
  return `Still needed on the form: ${labels.join("; ")}.`;
}
