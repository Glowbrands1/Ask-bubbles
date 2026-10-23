import type { GroundedCandidate } from "./roster-grounding";
import { EMPTY_CONFIRMED_FIELDS, type ConfirmedFormFields } from "./form-field-state";

/**
 * The form facts one conversation has already established.
 *
 * Read before any new question is asked. Written only when slot retention
 * is on. The table is not required for the flag to be off.
 */

export interface StoredFormState {
  readonly fields: ConfirmedFormFields;
  readonly incidentKey: string | null;
}

export function formStateFromRow(row: unknown): StoredFormState | null {
  if (!row || typeof row !== "object") return null;
  const record = row as { fields?: unknown; incident_key?: unknown };
  if (!record.fields || typeof record.fields !== "object") return null;
  const fields = record.fields as Partial<ConfirmedFormFields>;
  return {
    incidentKey: typeof record.incident_key === "string" ? record.incident_key : null,
    fields: {
      ...EMPTY_CONFIRMED_FIELDS,
      employeeName: stringOrNull(fields.employeeName),
      employeeId: stringOrNull(fields.employeeId),
      jobTitle: stringOrNull(fields.jobTitle),
      store: stringOrNull(fields.store),
      locationId: stringOrNull(fields.locationId),
      incidentDateIso: stringOrNull(fields.incidentDateIso),
      useToday: fields.useToday === true,
      payrollDeduct: fields.payrollDeduct === "yes" || fields.payrollDeduct === "no" ? fields.payrollDeduct : null,
      payrollAmount: stringOrNull(fields.payrollAmount),
      warningLevel: fields.warningLevel === "verbal" || fields.warningLevel === "written" ? fields.warningLevel : null,
      policySection: stringOrNull(fields.policySection),
      whatHappened: fields.whatHappened === true,
      deadline: stringOrNull(fields.deadline),
      pendingChoice: Array.isArray(fields.pendingChoice) ? (fields.pendingChoice as GroundedCandidate[]) : [],
    },
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
