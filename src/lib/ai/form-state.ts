import { rosterLocationName } from "@/lib/forms/location-mention";
import type { ChatFormProposal } from "@/types";

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

/**
 * What this conversation has already settled for a form.
 *
 * Read onto the next question before anything is asked again. A missing
 * table leaves the question as it was.
 */

export interface ConversationFormState {
  readonly employeeId: string | null;
  readonly employeeName: string | null;
  readonly keptTypedName: string | null;
  readonly locationId: string | null;
  readonly title: string | null;
  readonly formDate: string | null;
  readonly warningLevel: "verbal" | "written" | null;
  readonly payrollDeduct: "yes" | "no" | null;
  readonly policyHeading: string | null;
  readonly policyPage: number | null;
  readonly templateKey: string | null;
  readonly incident: string | null;
  readonly incidentType: string | null;
  readonly payrollAmount: string | null;
}

export const EMPTY_CONVERSATION_FORM_STATE: ConversationFormState = {
  employeeId: null,
  employeeName: null,
  keptTypedName: null,
  locationId: null,
  title: null,
  formDate: null,
  warningLevel: null,
  payrollDeduct: null,
  policyHeading: null,
  policyPage: null,
  templateKey: null,
  incident: null,
  incidentType: null,
  payrollAmount: null,
};

export function stateSentences(state: ConversationFormState): string[] {
  const lines: string[] = [];
  if (state.employeeName) lines.push(`The employee is ${state.employeeName}.`);
  if (state.title) lines.push(`Job title: ${state.title}.`);
  if (state.locationId) {
    const store = rosterLocationName(state.locationId);
    if (store) lines.push(`It happened at ${store}.`);
  }
  if (state.formDate) lines.push(`It happened on ${slashDate(state.formDate)}.`);
  if (state.warningLevel) lines.push(`Warning level: ${state.warningLevel}.`);
  if (state.payrollDeduct === "yes") lines.push("Payroll deduct applies.");
  if (state.payrollDeduct === "no") lines.push("No payroll deduction.");
  if (state.policyHeading) {
    const page = state.policyPage && state.policyPage > 0 ? ` p.${state.policyPage}` : "";
    lines.push(`Policy reference: ${state.policyHeading}, JBA Policy Manual${page}.`);
  }
  if (state.incidentType) lines.push(`Incident: ${state.incidentType}.`);
  if (state.payrollAmount) lines.push(`Payroll amount: ${state.payrollAmount}.`);
  return lines;
}

export function prependFormState(question: string, state: ConversationFormState | null): string {
  if (!state) return question;
  const lines = stateSentences(state).filter((line) => !question.includes(line));
  if (lines.length === 0) return question;
  return `${lines.join(" ")}\n${question}`;
}

export function captureFormState(
  previous: ConversationFormState | null,
  input: {
    readonly proposal: ChatFormProposal | null;
    readonly employeeId: string | null;
    readonly keptTypedName: string | null;
    readonly userText: string;
    readonly policyHeading: string | null;
    readonly policyPage: number | null;
  },
): ConversationFormState {
  const prior = previous ?? EMPTY_CONVERSATION_FORM_STATE;
  const proposal = input.proposal;
  const named = proposal?.employeeName?.trim() || null;
  const samePerson =
    named !== null && prior.employeeName !== null && named.toLowerCase() === prior.employeeName.toLowerCase();
  const incident = input.userText.trim().slice(0, 500);
  const warning = proposal?.warningLevel === "verbal" || proposal?.warningLevel === "written" ? proposal.warningLevel : null;
  const payroll = proposal?.payrollDeduct === "yes" || proposal?.payrollDeduct === "no" ? proposal.payrollDeduct : null;
  return {
    employeeId: named ? (input.employeeId ?? (samePerson ? prior.employeeId : null)) : prior.employeeId,
    employeeName: named ?? prior.employeeName,
    keptTypedName: input.keptTypedName ?? prior.keptTypedName,
    locationId: proposal?.locationId ?? prior.locationId,
    title: proposal?.employeeRole?.trim() || prior.title,
    formDate: proposal?.formDate ?? prior.formDate,
    warningLevel: warning ?? prior.warningLevel,
    payrollDeduct: payroll ?? prior.payrollDeduct,
    policyHeading: input.policyHeading ?? prior.policyHeading,
    policyPage: input.policyPage ?? prior.policyPage,
    templateKey: proposal?.templateKey ?? prior.templateKey,
    incident: incident || prior.incident,
    incidentType: prior.incidentType,
    payrollAmount: prior.payrollAmount,
  };
}

export function parseFormState(value: unknown): ConversationFormState | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<ConversationFormState>;
  const warning = row.warningLevel === "verbal" || row.warningLevel === "written" ? row.warningLevel : null;
  const payroll = row.payrollDeduct === "yes" || row.payrollDeduct === "no" ? row.payrollDeduct : null;
  return {
    employeeId: textOrNull(row.employeeId),
    employeeName: textOrNull(row.employeeName),
    keptTypedName: textOrNull(row.keptTypedName),
    locationId: textOrNull(row.locationId),
    title: textOrNull(row.title),
    formDate: textOrNull(row.formDate),
    warningLevel: warning,
    payrollDeduct: payroll,
    policyHeading: textOrNull(row.policyHeading),
    policyPage: typeof row.policyPage === "number" && row.policyPage > 0 ? row.policyPage : null,
    templateKey: textOrNull(row.templateKey),
    incident: textOrNull(row.incident),
    incidentType: textOrNull(row.incidentType),
    payrollAmount: textOrNull(row.payrollAmount),
  };
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function slashDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${Number(month)}/${Number(day)}/${year}`;
}
