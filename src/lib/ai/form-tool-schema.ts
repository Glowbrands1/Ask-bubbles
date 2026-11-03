import { z } from "zod/v4";

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

/* ------------------------------------------------------------ edit_form -- */

/**
 * FORM_EDIT_TOOL_IN_STREAM_ENABLED (Step 3, 4 Nov 2026): the one tool the main
 * answering call is offered while a draft form is open. Additive: the
 * `record_form_turn` tool above is unchanged.
 */
export const EDIT_FORM_TOOL_NAME = "edit_form";

/** The owner's approved wording (Pau, 4 Nov 2026), verbatim. */
export const EDIT_FORM_TOOL_DESCRIPTION =
  'Edit the HR form that is open in this chat. Use this tool only when the manager\'s latest message asks to add to, change or remove something on that form. Each op names one field key from the open form provided with this message. Use "append" to add the manager\'s own words to a text field, "set" only to replace a value the manager asked to change, and "clear" only when the manager asked to remove a value. Never touch a field the manager did not mention. Never invent names, dates, amounts or details; copy them as the manager gave them. If the message asks a question instead of asking for a change, do not use this tool.';

/** At most this many ops in one call. */
export const EDIT_FORM_MAX_OPS = 20;

/**
 * The tool's input: `{ ops: [...] }`, each op `set`, `clear` or `append` on
 * one of the open form's writable keys. A checkbox field's value is its
 * option keys; a text field's, the text. Strict: an extra key is a failed
 * parse, and the turn goes on as if the tool had not been called.
 */
export function editFormSchema(keys: readonly [string, ...string[]]) {
  const field = z.enum(keys);
  const value = z.union([z.string().max(4000), z.array(z.string().max(200)).max(20)]);
  return z
    .object({
      ops: z
        .array(
          z.union([
            z.object({ op: z.literal("set"), field, value }).strict(),
            z.object({ op: z.literal("append"), field, value: z.string().min(1).max(4000) }).strict(),
            z.object({ op: z.literal("clear"), field }).strict(),
          ]),
        )
        .min(1)
        .max(EDIT_FORM_MAX_OPS),
    })
    .strict();
}

export type EditFormInput = z.infer<ReturnType<typeof editFormSchema>>;

/** The tool as the Messages API takes it: the schema sent as `z.toJSONSchema`. */
export function editFormTool(keys: readonly [string, ...string[]]): {
  readonly name: string;
  readonly description: string;
  readonly input_schema: { readonly type: "object" } & Record<string, unknown>;
} {
  const { $schema: _dropped, ...schema } = z.toJSONSchema(editFormSchema(keys)) as Record<string, unknown>;
  void _dropped;
  return { name: EDIT_FORM_TOOL_NAME, description: EDIT_FORM_TOOL_DESCRIPTION, input_schema: { ...schema, type: "object" } };
}
