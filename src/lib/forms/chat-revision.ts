import "server-only";

import { getAnthropicClient } from "@/lib/ai/anthropic";
import type { AskResponse } from "@/lib/ai/types";
import { ACTIVE_BRAND } from "@/lib/brand";
import { CLAUDE_MAX_TOKENS, CLAUDE_MODEL } from "@/lib/config/models";
import type { ChatMessage } from "@/types";

import { interpolate, parseFormDocument } from "./document";
import { stripPlaceholdersFromDraft } from "./drafted-text";
import { applyEmployeeName, employeeNameRules } from "./employee-reference";
import { datesInText } from "./form-date-answer";
import { authorizeInstance } from "./instance-scope";
import { FollowUpError, applyAssistantRevision, setFollowUpDate } from "./instances";
import {
  EXPECTATION_LABEL,
  GOING_FORWARD_LABEL,
  OBSERVED_EXPECTATION,
  OBSERVED_LABEL,
  guardNarrativeDraft,
} from "./narrative-draft";
import { extractEmployeeNames, managerContext, samePerson } from "./proposal";
import { draftableCheckboxGroups, draftableFields } from "./responsibility";
import {
  asksAboutFollowUpDate,
  isRevisableTemplate,
  isRevisionRequest,
  planRevision,
  scopeRevision,
  type CurrentValue,
  type RevisableField,
  type RevisionScope,
} from "./revision";
import { detectTemplateIntent } from "./template-intent";

/**
 * ============================================================================
 * "CHANGE THE SUMMARY TO SAY …" — REVISING THE OPEN FORM FROM CHAT
 * ============================================================================
 *
 * Runs only when the conversation has an open form instance, the manager's
 * message reads as a change to it, and the company registry marks that form
 * `revisable`. Otherwise it returns null and the turn is answered normally.
 *
 * THE GUARANTEES:
 *
 *   - the instance is re-authorized for EDIT on every call — the browser's
 *     claim that a form is open proves nothing;
 *   - a finalized form is never changed; the reply says how to revise it;
 *   - only the fields the request names change (`scopeRevision` /
 *     `planRevision`), and everything the model writes goes back through the
 *     same responsibility rules as a first draft — a signature or a manager's
 *     own field is never written by the assistant;
 *   - a follow-up date is set only from ONE unambiguous future date the
 *     manager typed.
 */
export async function reviseActiveForm(input: {
  request: Request;
  instanceId: string;
  question: string;
  history: Pick<ChatMessage, "id" | "role" | "content" | "error">[];
  today?: string;
}): Promise<AskResponse | null> {
  const asksRevision = isRevisionRequest(input.question);
  const asksDate = asksAboutFollowUpDate(input.question);
  if (!asksRevision && !asksDate) return null;

  let authorized: Awaited<ReturnType<typeof authorizeInstance>>;
  try {
    authorized = await authorizeInstance(input.request, input.instanceId, "edit");
  } catch {
    return null;
  }
  const { actor, loaded } = authorized;
  const instance = loaded.instance;
  if (!isRevisableTemplate(instance.templateKey)) return null;

  /*
   * A REQUEST FOR A DIFFERENT FORM IS NOT A REVISION OF THIS ONE, and neither
   * is a message about somebody else.
   */
  const intent = detectTemplateIntent(input.question);
  if (intent.kind === "explicit" && intent.templateKey !== instance.templateKey) return null;

  const document = parseFormDocument(loaded.version.document);
  const variantKey = instance.variantKey;
  const formWords = formVocabulary(document, variantKey);
  const named = extractEmployeeNames(input.question).filter(
    (name) =>
      !formWords.has(name.toLowerCase()) &&
      !new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+\\d{1,2}\\b`).test(input.question),
  );
  if (named.length > 0 && !named.some((name) => samePerson(name, instance.employeeName))) return null;

  const who = `**${instance.templateName}** for **${instance.employeeName}**`;
  if (instance.status !== "draft") {
    return reply(
      `The ${who} is finalized, so I haven't changed it. Open it from the forms register and create a revision to make a change.`,
    );
  }

  const fields = draftableFields(document, variantKey);
  const groups = draftableCheckboxGroups(document, variantKey);

  const labelled: RevisableField[] = [
    ...fields.map((field) => ({ key: field.key, label: interpolate(field.label, null) })),
    ...groups.map((group) => ({
      key: group.key,
      label: group.label?.trim() || humanize(group.key),
      options: group.options.map((option) => ({ key: option.key, label: option.label })),
    })),
  ];
  const labelOf = (key: string) =>
    key === FOLLOW_UP_DATE_KEY
      ? "Follow-up date"
      : (labelled.find((entry) => entry.key === key)?.label ?? humanize(key));

  /* -------------------------------------------------------- follow-up -- */
  const dateLines: string[] = [];
  let dateChanged = false;
  if (asksDate) {
    const dates = [...new Set(datesInText(input.question, input.today ?? "").map((found) => found.iso))];
    const target = dates.length === 1 ? dates[0]! : null;
    if (!input.today || dates.length === 0) {
      dateLines.push(`${DATE_NOT_CHANGED} I couldn't tell which day you meant.`);
    } else if (!target) {
      dateLines.push(`${DATE_NOT_CHANGED} You gave more than one date, so I didn't choose between them.`);
    } else if (target < input.today) {
      dateLines.push(`${DATE_NOT_CHANGED} ${dateInWords(target)} has already passed.`);
    } else {
      try {
        const before = instance.followUpDate;
        await setFollowUpDate(input.instanceId, target, actor.id);
        dateChanged = before !== target;
        dateLines.push(`Set the follow-up date to **${dateInWords(target)}**.`);
      } catch (error) {
        if (!(error instanceof FollowUpError)) throw error;
        dateLines.push(`${DATE_NOT_CHANGED} ${error.message}`);
      }
    }
  }

  const current = new Map<string, CurrentValue>(
    loaded.values.map((row) => [
      row.fieldKey,
      { value: row.value, checked: row.checked ?? [], filledBy: row.filledBy },
    ]),
  );

  const notes = managerContext(input.history, { content: input.question }).text;
  const currentText = [...current.values()].map((entry) => entry.value ?? "").join("\n");

  let scope: RevisionScope = scopeRevision(input.question, labelled, new Set<string>());
  if (asksDate) {
    const more = (scope.mode === "fields" || scope.mode === "findings") && scope.keys.size > 0;
    if (!more) return dateReply(dateLines, dateChanged ? input.instanceId : null);
  }
  if (!asksRevision) return dateReply(dateLines, dateChanged ? input.instanceId : null);

  const describeCurrent = [
    ...fields.map((field) => {
      const entry = current.get(field.key);
      const value = (entry?.value ?? "").trim();
      const label = interpolate(field.label, null);
      const by =
        entry && value
          ? ` [written by ${entry.filledBy === "ai" ? ACTIVE_BRAND.assistantName : "the manager"}]`
          : "";
      return `- ${field.key} (${label})${field.narrative ? ` [${field.narrative}]` : ""}: ${value ? JSON.stringify(value) : "(empty)"}${by}`;
    }),
    ...groups.map((group) => {
      const ticked = current.get(group.key)?.checked ?? [];
      return `- ${group.key} (checkbox): options ${group.options.map((option) => `${option.key} = ${option.label}`).join("; ")}. Ticked now: ${ticked.length ? ticked.join(", ") : "(none)"}`;
    }),
  ];

  const system = [
    `You revise drafts of ${ACTIVE_BRAND.brandName} forms for a manager, who reviews and signs them.`,
    "You are given the form as it stands and the manager's requested change. Make THAT change and nothing else.",
    "PRESERVE THE FORM. Return only the fields whose value the request changes. A field you leave out keeps exactly what it says now — so leave out every field the request does not ask you to change, including empty ones.",
    "Never remove or empty a field unless the manager asked for it to be removed. If they did, list its key under `clear`.",
    "Never change a field marked [written by the manager] unless the request names it.",
    "FACTS come only from what the manager said in this conversation and from the form as it stands. Never invent dates, figures, names, prior incidents, policy names or policy wording.",
    "Never write a placeholder such as [Follow-Up Date]. If you do not have a value, leave the field out.",
    "Do not mention follow-up dates or scheduling in any field: the follow-up date is recorded separately by the manager.",
    `A field marked [${OBSERVED_EXPECTATION}] keeps its labelled sections — "${OBSERVED_LABEL}", "${EXPECTATION_LABEL}" and, where present, "${GOING_FORWARD_LABEL}" — each label on its own line.`,
    ...employeeNameRules(instance.employeeName),
    "Never add a disciplinary step, a warning level, a termination, a demotion or a suspension the manager did not state.",
    scopeInstruction(scope, labelOf),
  ].join(" ");

  const prompt = [
    `FORM: ${instance.templateName}`,
    `EMPLOYEE: ${instance.employeeName}`,
    instance.locationName ? `LOCATION: ${instance.locationName}` : "",
    "",
    "THE FORM AS IT STANDS:",
    ...describeCurrent,
    "",
    "WHAT THE MANAGER HAS SAID IN THIS CONVERSATION:",
    notes,
    "",
    "THE CHANGE THE MANAGER IS ASKING FOR NOW:",
    input.question,
  ]
    .filter((line) => line !== "")
    .join("\n");

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: CLAUDE_MAX_TOKENS.detailed,
    system,
    messages: [{ role: "user", content: prompt }],
    tools: [
      {
        name: "revise_form_fields",
        description: "Write ONLY the fields the requested change alters.",
        input_schema: {
          type: "object",
          properties: {
            values: {
              type: "object",
              additionalProperties: { type: "string" },
              description: "Field key to its new text. Only fields the request changes.",
            },
            checked: {
              type: "object",
              additionalProperties: { type: "array", items: { type: "string" } },
              description: "Checkbox group key to its new option keys. Only groups the request changes.",
            },
            clear: {
              type: "array",
              items: { type: "string" },
              description: "Keys the manager asked to have removed. Usually empty.",
            },
          },
          required: ["values"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "revise_form_fields" },
  });

  const call = response.content.find(
    (block): block is Extract<typeof block, { type: "tool_use" }> => block.type === "tool_use",
  );
  const proposed = (call?.input ?? {}) as {
    values?: Record<string, unknown>;
    checked?: Record<string, unknown>;
    clear?: unknown;
  };

  const plan = planRevision({ question: input.question, fields: labelled, current, proposed, scope });

  const grounding = `${notes}\n${currentText}`;
  const cleaned = stripPlaceholdersFromDraft(plan.values);
  const narrated = guardNarrativeDraft(cleaned.values, fields, grounding);
  const byName = applyEmployeeName({
    values: narrated.values,
    fields,
    employeeName: instance.employeeName,
    knownWords: [ACTIVE_BRAND.brandName, ...(instance.locationName ? [instance.locationName] : [])],
  });

  const changed = Object.keys(byName.values).length + Object.keys(plan.checked).length;
  if (changed === 0 && plan.cleared.length === 0) {
    const lines = [...dateLines, ...(dateLines.length ? [""] : [])];
    lines.push(
      dateLines.length
        ? `I haven't changed anything else on the ${who}.`
        : `I haven't changed the ${who} — everything on it is as it was.`,
    );
    lines.push("", "Tell me which part to change and what it should say, and I'll update just that.");
    return dateChanged
      ? { ...reply(lines.join("\n")), formUpdate: { instanceId: input.instanceId, updated: [FOLLOW_UP_DATE_KEY] } }
      : reply(lines.join("\n"));
  }

  const saved = await applyAssistantRevision(
    input.instanceId,
    { values: byName.values, checked: plan.checked },
    plan.cleared,
    actor.id,
  );
  const written = [
    ...Object.keys(saved.accepted.values),
    ...Object.keys(saved.accepted.checked),
    ...saved.cleared,
  ];
  if (written.length === 0) {
    if (dateLines.length) return dateReply(dateLines, dateChanged ? input.instanceId : null);
    return reply(`I haven't changed the ${who} — everything on it is as it was.`);
  }

  const updated = written
    .filter((key) => !saved.cleared.includes(key))
    .map(labelOf)
    .filter((label) => label.trim() !== "");
  const lines = [
    ...dateLines,
    ...(dateLines.length ? [""] : []),
    `Updated the ${who}${updated.length ? `: ${updated.join(", ")}` : ""}.${saved.cleared.length ? ` Removed ${saved.cleared.map(labelOf).join(", ")}.` : ""} Everything else on the form is as it was.`,
    "",
    "Give it a read below before you finalize.",
  ];

  return {
    ...reply(lines.join("\n")),
    formUpdate: {
      instanceId: input.instanceId,
      updated: dateChanged ? [...written, FOLLOW_UP_DATE_KEY] : written,
    },
  };
}

function formVocabulary(document: ReturnType<typeof parseFormDocument>, variantKey: string | null): Set<string> {
  const words = new Set<string>();
  for (const field of draftableFields(document, variantKey)) words.add(interpolate(field.label, null).toLowerCase());
  for (const group of draftableCheckboxGroups(document, variantKey)) {
    if (group.label) words.add(group.label.toLowerCase());
    for (const option of group.options) words.add(option.label.toLowerCase());
  }
  return words;
}

const FOLLOW_UP_DATE_KEY = "follow_up_date";

const DATE_NOT_CHANGED = "I didn't change the follow-up date. Use the Follow-up date control on the form.";

function dateReply(lines: readonly string[], changedInstanceId: string | null): AskResponse {
  const content = [...lines, "", "Nothing else on the form was changed."].join("\n");
  return changedInstanceId
    ? { ...reply(content), formUpdate: { instanceId: changedInstanceId, updated: [FOLLOW_UP_DATE_KEY] } }
    : reply(content);
}

function dateInWords(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function humanize(key: string): string {
  const words = key.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function scopeInstruction(scope: RevisionScope, labelOf: (key: string) => string): string {
  const names = [...scope.keys].map(labelOf).join(", ");
  const kept = scope.protectedKeys.size
    ? ` The manager asked you to keep ${[...scope.protectedKeys].map(labelOf).join(", ")} exactly as it is.`
    : "";
  switch (scope.mode) {
    case "fields":
      return `THIS REQUEST CHANGES ONLY: ${names}. Return no other field.${kept}`;
    case "findings":
      return `From the manager's words only, write: ${names}. Return no other field.${kept}`;
    case "additive":
      return `ADD THE NEW INFORMATION to the text field it belongs in, keeping everything that field already says. Do not change any checkbox, and do not touch fields the new information is not about.${kept}`;
    case "wording":
      return `IMPROVE THE WORDING ONLY. Reword text that is already on the form, keeping every fact. Do not fill an empty field, do not empty a field, and do not change any checkbox.${kept}`;
  }
}

function reply(content: string): AskResponse {
  return { content, citations: [], coverage: "not_applicable" };
}
