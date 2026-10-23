/**
 * What a form-understanding tool call must return.
 *
 * The model proposes an intent and fields. Callers parse with this schema
 * and then run the existing readers as validators — a value that is not in
 * the manager's words, or not on the roster, does not survive that step.
 */

export const FORM_TOOL_NAME = "record_form_turn";

const INTENTS = [
  "create_form",
  "continue_form",
  "confirm",
  "provide_fields",
  "correct_fields",
  "form_command",
  "policy_question",
  "other",
] as const;

const TEMPLATES = ["dpoa", "coaching", "follow-up-coaching", "policy-review"] as const;

export interface FormToolFields {
  readonly employeeName: string | null;
  readonly jobTitle: string | null;
  readonly store: string | null;
  readonly incidentDateIso: string | null;
  readonly useToday: boolean;
  readonly payrollDeduct: "yes" | "no" | null;
  readonly payrollAmount: string | null;
  readonly warningLevel: "verbal" | "written" | null;
  readonly policySection: string | null;
  readonly deadline: string | null;
}

export interface FormToolTurn {
  readonly intent: (typeof INTENTS)[number];
  readonly templateKey: (typeof TEMPLATES)[number] | null;
  readonly confirmsOpenForm: boolean;
  readonly fields: FormToolFields;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseFormToolTurn(input: unknown): FormToolTurn | null {
  if (!isRecord(input)) return null;
  if (typeof input.intent !== "string" || !INTENTS.includes(input.intent as (typeof INTENTS)[number])) return null;
  const template = str(input.templateKey);
  if (template && !TEMPLATES.includes(template as (typeof TEMPLATES)[number])) return null;
  const fields = isRecord(input.fields) ? input.fields : {};
  const payroll = fields.payrollDeduct;
  const warning = fields.warningLevel;
  return {
    intent: input.intent as FormToolTurn["intent"],
    templateKey: (template as FormToolTurn["templateKey"]) ?? null,
    confirmsOpenForm: input.confirmsOpenForm === true,
    fields: {
      employeeName: str(fields.employeeName),
      jobTitle: str(fields.jobTitle),
      store: str(fields.store),
      incidentDateIso: str(fields.incidentDateIso),
      useToday: fields.useToday === true,
      payrollDeduct: payroll === "yes" || payroll === "no" ? payroll : null,
      payrollAmount: str(fields.payrollAmount),
      warningLevel: warning === "verbal" || warning === "written" ? warning : null,
      policySection: str(fields.policySection),
      deadline: str(fields.deadline),
    },
  };
}

export const FORM_TOOL_DESCRIPTION =
  "Record what this turn is doing with a form, and the fields the manager actually stated.";

export const FORM_TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  required: ["intent", "confirmsOpenForm", "fields"],
  properties: {
    intent: { type: "string", enum: [...INTENTS] },
    templateKey: { type: ["string", "null"], enum: [...TEMPLATES, null] },
    confirmsOpenForm: { type: "boolean" },
    fields: {
      type: "object",
      additionalProperties: false,
      properties: {
        employeeName: { type: ["string", "null"] },
        jobTitle: { type: ["string", "null"] },
        store: { type: ["string", "null"] },
        incidentDateIso: { type: ["string", "null"] },
        useToday: { type: "boolean" },
        payrollDeduct: { type: ["string", "null"], enum: ["yes", "no", null] },
        payrollAmount: { type: ["string", "null"] },
        warningLevel: { type: ["string", "null"], enum: ["verbal", "written", null] },
        policySection: { type: ["string", "null"] },
        deadline: { type: ["string", "null"] },
      },
    },
  },
};
