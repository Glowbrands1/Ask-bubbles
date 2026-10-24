import { payrollDeductAmountFieldEnabled, priorCoachingOptionalEnabled } from "@/lib/config/chat-quality-flags";
import { readCorrectiveActionIntake, describesIncident, type IntakeItem } from "@/lib/forms/corrective-action-intake";
import { extractFormDate } from "@/lib/forms/form-date-answer";
import { payrollDeductAmount } from "@/lib/forms/payroll-deduct";
import { statedPayrollDeduct } from "@/lib/forms/payroll-deduct-answer";
import { extractJobTitle } from "@/lib/forms/proposal";
import { readLocationMentions, rosterLocationName } from "@/lib/forms/location-mention";
import { statedWarningLevel } from "@/lib/forms/warning-level";
import type { RosterEmployee } from "@/lib/forms/employee-match";

import { groundEmployee, type GroundedCandidate } from "./roster-grounding";
import type { FormToolTurn } from "./form-tool-schema";

/**
 * Fields a form turn has already established.
 *
 * Built from the existing readers and, when a roster is supplied, from that
 * roster. A tool-call value is kept only when the manager's words
 * corroborate it. A store is never the employee. A date that was not typed
 * is dropped. A payroll amount that was not stated is dropped. Confirmed
 * fields stay when a later turn does not repeat them.
 */

export interface ConfirmedFormFields {
  readonly employeeName: string | null;
  readonly employeeId: string | null;
  readonly jobTitle: string | null;
  readonly store: string | null;
  readonly locationId: string | null;
  readonly incidentDateIso: string | null;
  readonly useToday: boolean;
  readonly payrollDeduct: "yes" | "no" | null;
  readonly payrollAmount: string | null;
  readonly warningLevel: "verbal" | "written" | null;
  readonly policySection: string | null;
  readonly whatHappened: boolean;
  readonly deadline: string | null;
  readonly pendingChoice: readonly GroundedCandidate[];
}

export const EMPTY_CONFIRMED_FIELDS: ConfirmedFormFields = {
  employeeName: null,
  employeeId: null,
  jobTitle: null,
  store: null,
  locationId: null,
  incidentDateIso: null,
  useToday: false,
  payrollDeduct: null,
  payrollAmount: null,
  warningLevel: null,
  policySection: null,
  whatHappened: false,
  deadline: null,
  pendingChoice: [],
};

function appears(text: string, phrase: string | null | undefined): boolean {
  const needle = phrase?.trim().toLowerCase() ?? "";
  return needle.length > 1 && text.toLowerCase().includes(needle);
}

function asWritten(text: string, phrase: string): string {
  const trimmed = phrase.trim();
  const index = text.toLowerCase().indexOf(trimmed.toLowerCase());
  if (index < 0) return trimmed;
  return text.slice(index, index + trimmed.length);
}

function storeFromText(text: string): { name: string; locationId: string | null } | null {
  const mentions = readLocationMentions(text).filter((mention) => !mention.confirm && !mention.collision);
  const ids = [...new Set(mentions.flatMap((mention) => mention.locationIds))];
  if (ids.length !== 1) return null;
  const name = rosterLocationName(ids[0]!);
  return name ? { name, locationId: ids[0]! } : null;
}

function dollarsIn(text: string): string[] {
  return [...text.matchAll(/\$\s?\d+(?:,\d{3})*(?:\.\d{2})?/g)].map((match) => match[0].replace(/\s+/g, ""));
}

function warningOf(text: string): "verbal" | "written" | null {
  const level = statedWarningLevel(text);
  return level === "verbal" || level === "written" ? level : null;
}

/** What the existing readers, and the roster when one is passed, can prove. */
export function fieldsFromManagerText(
  text: string,
  today: string,
  roster: readonly RosterEmployee[] = [],
): ConfirmedFormFields {
  const intake = readCorrectiveActionIntake({
    text,
    employeeKnown: false,
    salonSettled: false,
  });
  const grounded = groundEmployee(text, roster);
  const person = grounded && !grounded.needsChoice && grounded.name ? grounded : null;
  const date = extractFormDate(text, today);
  const useToday = date === null && intake.supplied.includes("form_date");
  const store = storeFromText(text);
  const title = extractJobTitle(text) ?? person?.title ?? null;
  return {
    employeeName: person?.name ?? null,
    employeeId: person?.employeeId ?? null,
    jobTitle: title,
    store: store?.name ?? person?.locationName ?? null,
    locationId: store?.locationId ?? person?.locationId ?? null,
    incidentDateIso: date ?? (useToday ? today : null),
    useToday,
    payrollDeduct: statedPayrollDeduct(text),
    payrollAmount: payrollDeductAmount(text),
    warningLevel: warningOf(text),
    policySection: null,
    whatHappened: describesIncident(text) || intake.supplied.includes("what_happened"),
    deadline: null,
    pendingChoice: grounded?.needsChoice ? grounded.candidates : [],
  };
}

export function corroborateModelFields(
  base: ConfirmedFormFields,
  model: FormToolTurn["fields"],
  text: string,
  today: string,
  roster: readonly RosterEmployee[] = [],
): ConfirmedFormFields {
  let employeeName = base.employeeName;
  let employeeId = base.employeeId;
  if (!employeeName && model.employeeName && appears(text, model.employeeName)) {
    const grounded = groundEmployee(model.employeeName, roster);
    if (grounded && !grounded.needsChoice && grounded.name) {
      employeeName = grounded.name;
      employeeId = grounded.employeeId;
    } else if (roster.length === 0) {
      employeeName = asWritten(text, model.employeeName);
    }
  }

  let jobTitle = base.jobTitle;
  if (!jobTitle && model.jobTitle && appears(text, model.jobTitle)) jobTitle = asWritten(text, model.jobTitle);

  let store = base.store;
  let locationId = base.locationId;
  if (!store && model.store && appears(text, model.store)) {
    const fromPhrase = storeFromText(model.store) ?? storeFromText(text);
    if (fromPhrase) {
      store = fromPhrase.name;
      locationId = fromPhrase.locationId;
    }
  }

  let incidentDateIso = base.incidentDateIso;
  let useToday = base.useToday;
  const extracted = extractFormDate(text, today);
  if (extracted) {
    incidentDateIso = extracted;
    useToday = false;
  } else if ((base.useToday || model.useToday) && /\btodays?\b|\btoday\b/i.test(text)) {
    useToday = true;
    incidentDateIso = today;
  }
  if (model.incidentDateIso && model.incidentDateIso !== incidentDateIso && model.incidentDateIso !== extracted) {
    incidentDateIso = extracted ?? (useToday ? today : incidentDateIso);
  }

  const payrollDeduct = base.payrollDeduct ?? null;
  let payrollAmount = base.payrollAmount;
  if (payrollDeductAmountFieldEnabled()) {
    /*
     * The model does not choose the amount. A dollar figure that only appears
     * because the cited policy states it ("$25.00 via payroll deduction") is
     * not this field.
     */
    payrollAmount = payrollDeduct === "no" ? null : payrollDeductAmount(text);
  } else if (!payrollAmount && payrollDeduct === "yes" && model.payrollAmount) {
    const stated = dollarsIn(text);
    const wanted = model.payrollAmount.replace(/\s+/g, "");
    if (stated.includes(wanted)) payrollAmount = wanted;
  }

  const deadline = model.deadline && appears(text, model.deadline) ? asWritten(text, model.deadline) : null;

  return {
    employeeName,
    employeeId,
    jobTitle,
    store,
    locationId,
    incidentDateIso,
    useToday,
    payrollDeduct,
    payrollAmount,
    warningLevel: base.warningLevel,
    policySection: base.policySection,
    whatHappened: base.whatHappened,
    deadline: base.deadline ?? deadline,
    pendingChoice: base.pendingChoice,
  };
}

export function mergeConfirmed(
  previous: ConfirmedFormFields,
  next: ConfirmedFormFields,
  correct: boolean,
): ConfirmedFormFields {
  const pick = <T>(prior: T | null, incoming: T | null): T | null => {
    if (correct) return incoming ?? prior;
    return prior ?? incoming;
  };
  const payrollDeduct = pick(previous.payrollDeduct, next.payrollDeduct);
  return {
    employeeName: pick(previous.employeeName, next.employeeName),
    employeeId: pick(previous.employeeId, next.employeeId),
    jobTitle: pick(previous.jobTitle, next.jobTitle),
    store: pick(previous.store, next.store),
    locationId: pick(previous.locationId, next.locationId),
    incidentDateIso: pick(previous.incidentDateIso, next.incidentDateIso),
    useToday: correct ? next.useToday || previous.useToday : previous.useToday || next.useToday,
    payrollDeduct,
    payrollAmount:
      payrollDeductAmountFieldEnabled() && payrollDeduct === "no"
        ? null
        : pick(previous.payrollAmount, next.payrollAmount),
    warningLevel: pick(previous.warningLevel, next.warningLevel),
    policySection: pick(previous.policySection, next.policySection),
    whatHappened: previous.whatHappened || next.whatHappened,
    deadline: pick(previous.deadline, next.deadline),
    pendingChoice: next.pendingChoice.length > 0 ? next.pendingChoice : previous.pendingChoice,
  };
}

export function confirmedFromToolTurn(
  previous: ConfirmedFormFields,
  reading: FormToolTurn,
  managerText: string,
  today: string,
  roster: readonly RosterEmployee[] = [],
): ConfirmedFormFields {
  const base = fieldsFromManagerText(managerText, today, roster);
  const corroborated = corroborateModelFields(base, reading.fields, managerText, today, roster);
  return mergeConfirmed(previous, corroborated, reading.intent === "correct_fields");
}

export function missingIntakeItems(text: string, fields: ConfirmedFormFields): IntakeItem[] {
  const intake = readCorrectiveActionIntake({
    text,
    employeeKnown: fields.employeeName !== null,
    salonSettled: fields.store !== null,
    payrollDeduct: fields.payrollDeduct,
  });
  return intake.missing.filter((item) => {
    if (item.key === "employee_name" && fields.employeeName) return false;
    if (item.key === "salon" && fields.store) return false;
    if (item.key === "form_date" && (fields.incidentDateIso || fields.useToday)) return false;
    if (item.key === "job_title" && fields.jobTitle) return false;
    if (item.key === "what_happened" && fields.whatHappened) return false;
    if (item.key === "warning_level" && fields.warningLevel) return false;
    if (item.key === "payroll_deduct" && fields.payrollDeduct) return false;
    if (item.key === "previous_action") return !priorCoachingOptionalEnabled();
    return true;
  });
}

const ASK_LINE: { key: keyof ConfirmedFormFields; pattern: RegExp }[] = [
  { key: "employeeName", pattern: /employee'?s full name/i },
  { key: "store", pattern: /(?:^|\n)\s*(?:\d+\.\s*)?store\s*$/i },
  { key: "incidentDateIso", pattern: /date for the form/i },
  { key: "jobTitle", pattern: /job title/i },
  { key: "warningLevel", pattern: /verbal or written warning/i },
  { key: "payrollDeduct", pattern: /payroll deduct applicable/i },
];

function fieldIsHeld(fields: ConfirmedFormFields, key: keyof ConfirmedFormFields): boolean {
  if (key === "incidentDateIso") return Boolean(fields.incidentDateIso) || fields.useToday;
  if (key === "whatHappened") return fields.whatHappened;
  if (key === "useToday") return fields.useToday;
  const value = fields[key];
  return value !== null && value !== "" && !Array.isArray(value);
}

/** Drop intake lines for fields the conversation already established. */
export function retainFieldsInReply(content: string, fields: ConfirmedFormFields): string {
  const kept = content.split("\n").filter((line) => {
    for (const ask of ASK_LINE) {
      if (ask.pattern.test(line) && fieldIsHeld(fields, ask.key)) return false;
    }
    return true;
  });
  let text = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (fields.employeeName && /nothing has been created/i.test(text)) {
    text = text.replace(/nothing has been created yet\.?/gi, `I still have ${fields.employeeName} for this form.`);
  }
  return text;
}

export function retentionReply(fields: ConfirmedFormFields, missing: readonly IntakeItem[]): string {
  const held: string[] = [];
  if (fields.employeeName) held.push(fields.employeeName);
  if (fields.jobTitle) held.push(`title ${fields.jobTitle}`);
  if (fields.store) held.push(fields.store);
  if (fields.useToday) held.push("today's date");
  else if (fields.incidentDateIso) held.push(fields.incidentDateIso);
  if (fields.warningLevel) held.push(`a ${fields.warningLevel} warning`);
  if (fields.payrollDeduct === "yes") {
    held.push(fields.payrollAmount ? `a payroll deduction of ${fields.payrollAmount}` : "a payroll deduction");
  } else if (fields.payrollDeduct === "no") {
    held.push("no payroll deduction");
  }
  const lines = [held.length > 0 ? `I already have ${held.join(", ")}.` : "Tell me who the form is for."];
  if (missing.length === 0) lines.push("I will not ask for those again.");
  else {
    lines.push("I only still need:");
    missing.forEach((item, index) => lines.push(`${index + 1}. ${item.prompt}`));
  }
  return lines.join("\n");
}

/** Restate corroborated fields in words the existing intake already understands. */
export function questionWithConfirmedFields(question: string, fields: ConfirmedFormFields): string {
  const lines = [question.trim()];
  if (fields.employeeName) lines.push(`Employee name: ${fields.employeeName}.`);
  if (fields.jobTitle) lines.push(`Job title: ${fields.jobTitle}.`);
  if (fields.store) lines.push(`The store is ${fields.store}.`);
  if (fields.useToday) lines.push("Use today's date.");
  else if (fields.incidentDateIso) lines.push(`Date for the form: ${fields.incidentDateIso}.`);
  if (fields.warningLevel) lines.push(`${fields.warningLevel} warning.`);
  if (fields.payrollDeduct === "yes") {
    lines.push(fields.payrollAmount ? `Payroll deduction of ${fields.payrollAmount}.` : "Payroll deduction yes.");
  } else if (fields.payrollDeduct === "no") {
    lines.push("No payroll deduction.");
  }
  if (!/\bkeep this as\b/i.test(question)) lines.push("keep this as this form");
  return lines.join("\n");
}
