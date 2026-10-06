import "server-only";

import { companyFormFor, type ChatCorrectableField } from "@/config/company/forms";
import type { AskResponse } from "@/lib/ai/types";

import { checkboxGroupsForVariant, displayDate, fieldsForVariant, parseFormDocument } from "./document";
import { authorizeInstance } from "./instance-scope";
import { saveInstanceValues } from "./instances";
import { extractEmployeeNames, samePerson } from "./proposal";
import { isQuestion } from "./question";
import { singleSpokenDate } from "./relative-date";
import { enforcePersonEdit } from "./responsibility";
import { detectTemplateIntent } from "./template-intent";

/**
 * ============================================================================
 * CORRECTING A FORM THAT ALREADY EXISTS, FROM THE CONVERSATION
 * ============================================================================
 *
 * Ported from the reference platform's `chat-correction.ts`. "Change the date
 * to yesterday" or "change the name to Jane Doe-Smith", typed after a draft was
 * created in this conversation, updates THAT draft rather than starting the
 * interview again or answering with advice.
 *
 * WHAT WAS PORTED is the machinery, which names no form: the cheap first
 * reading, re-authorization, the "a new request is not a correction" and
 * "somebody else is not this employee" guards, the person-edit rules, one
 * save, and a reply in the form's own labels with a `formUpdate` the browser
 * uses to refresh the open form.
 *
 * WHAT WAS NOT is the reference company's own field readers (its transfer,
 * demotion, exit and payroll lines). Here a form opts in through the company
 * registry, `chatCorrectableFields`, and only the header lines the platform
 * can read generically are offered: the employee's name and the form's date.
 *
 * EVERYTHING IS RE-CHECKED. The browser names the instance; this loads it and
 * runs `authorizeInstance` with the "edit" action, which applies the
 * template's own permission and the location scope exactly as the inline
 * editor's save does. An id that fails returns null and the turn is answered
 * as it always would have been.
 *
 * IT IS THE MANAGER'S OWN EDIT. Saved through `saveInstanceValues` — the same
 * path as typing into the field — so it is recorded as the manager's, refused
 * on a finalized form, and limited to fields a person may edit.
 */

const VERB = String.raw`(?:change|update|correct|fix|set|make)`;
const NAME_CORRECTION = new RegExp(
  String.raw`\b${VERB}\s+(?:the\s+|her\s+|his\s+|their\s+)?(?:employee(?:'s)?\s+|team member(?:'s)?\s+)?name\s+(?:to|is|should be)\s+(.+?)\s*[.!]?$`,
  "i",
);
/* "Actually her name is Jane Doe-Smith." — the correction said as a statement. */
const NAME_STATEMENT =
  /^(?:(?:sorry|oops|actually|no)[,.!\s]+)*(?:her|his|their|the employee'?s|the team member'?s)\s+(?:full\s+)?name\s+is\s+(?:actually\s+)?(.+?)\s*[.!]?$/i;
const DATE_CORRECTION = new RegExp(
  String.raw`\b${VERB}\s+(?:the\s+)?(?:form(?:'s)?\s+)?date\s+(?:to|is|should be|as)\s+`,
  "i",
);
const DATE_STATEMENT =
  /^(?:(?:sorry|oops|actually|no)[,.!\s]+)*(?:the\s+)?(?:form(?:'s)?\s+)?date\s+(?:should\s+(?:be|say|read)|is\s+(?:actually|wrong[,\s]+it(?:'s|\s+is|\s+should\s+be)))\s+/i;

export interface HeaderCorrection {
  readonly values: Partial<Record<ChatCorrectableField, string>>;
}

/**
 * The header lines `text` corrects, or null when it corrects none. Pure, so
 * the reading is testable without a form.
 */
export function readHeaderCorrection(text: string, today: string): HeaderCorrection | null {
  const trimmed = text.trim();
  if (isQuestion(trimmed)) return null;
  const values: Partial<Record<ChatCorrectableField, string>> = {};

  const name = NAME_CORRECTION.exec(trimmed) ?? NAME_STATEMENT.exec(trimmed);
  if (name) {
    const typed = name[1]!.replace(/^["'“‘(]+|["'”’)]+$/g, "").replace(/\s+/g, " ").trim();
    if (typed) values.employee_name = typed;
  }

  const date = DATE_CORRECTION.exec(trimmed) ?? DATE_STATEMENT.exec(trimmed);
  if (date) {
    const iso = singleSpokenDate(trimmed.slice(date.index + date[0].length), today);
    if (iso) values.form_date = iso;
  }

  return Object.keys(values).length > 0 ? { values } : null;
}

/** A turn that asks for a form — this one again, or another — is never a correction. */
const NEW_REQUEST = /\b(?:create|make|start|pull up|new|another|need)\b/i;

export async function correctActiveForm(input: {
  request: Request;
  instanceId: string;
  question: string;
  today: string;
}): Promise<AskResponse | null> {
  // A cheap first reading, before anything is loaded: most turns are not corrections.
  const correction = readHeaderCorrection(input.question, input.today);
  if (!correction) return null;

  /*
   * A NEW REQUEST IS NEVER A CORRECTION TO THE LAST FORM. Found in the
   * reference platform's QA: with a form for one employee open, a request for
   * another form was read as a correction and wrote onto the wrong record.
   */
  const intent = detectTemplateIntent(input.question);
  if (intent.kind === "ambiguous") return null;
  if (intent.kind === "explicit" && NEW_REQUEST.test(input.question)) return null;

  let authorized: Awaited<ReturnType<typeof authorizeInstance>>;
  try {
    authorized = await authorizeInstance(input.request, input.instanceId, "edit");
  } catch {
    // Not visible, not permitted, or gone: the turn goes on as a normal one.
    return null;
  }
  const { actor, loaded } = authorized;
  const instance = loaded.instance;
  if (intent.kind === "explicit" && intent.templateKey !== instance.templateKey) return null;

  const allowed = new Set<string>(companyFormFor(instance.templateKey)?.chatCorrectableFields ?? []);
  if (allowed.size === 0) return null;

  /*
   * SOMEBODY ELSE IS NOT THIS EMPLOYEE. "Change the date to yesterday for
   * Jordan" with Avery's form open is about another record. Renaming is the one
   * correction that names somebody new on purpose, so it is exempt.
   */
  if (!correction.values.employee_name) {
    const named = extractEmployeeNames(input.question);
    if (named.length > 0 && !named.some((name) => samePerson(name, instance.employeeName))) return null;
  }

  const document = parseFormDocument(loaded.version.document);
  const variantKey = instance.variantKey;
  const present = new Set([
    ...fieldsForVariant(document, variantKey).map((field) => field.key),
    ...checkboxGroupsForVariant(document, variantKey).map((group) => group.key),
  ]);
  const values = Object.fromEntries(
    Object.entries(correction.values).filter(
      (entry): entry is [string, string] => allowed.has(entry[0]) && present.has(entry[0]) && Boolean(entry[1]),
    ),
  );
  if (Object.keys(values).length === 0) return null;

  const who = `**${instance.templateName}** for **${instance.employeeName}**`;
  if (instance.status !== "draft") {
    return reply(
      `The ${who} is finalized, so I haven't changed it. Open it from the forms register and create a revision to make a change.`,
    );
  }

  /*
   * WHAT THE PERSON MAY WRITE, decided before anything is saved — the same
   * `enforcePersonEdit` the save applies.
   */
  const accepted = enforcePersonEdit(document, variantKey, { values, checked: {} });
  const keys = Object.keys(accepted.values);
  if (keys.length === 0) return null;

  const saved = await saveInstanceValues(input.instanceId, { values: accepted.values, checked: {} }, actor.id);
  const refused = new Set(saved.rejected.map((entry) => entry.key));
  const written = keys.filter((key) => !refused.has(key));
  if (written.length === 0) return null;

  const described = written.map((key) => {
    const field = fieldsForVariant(document, variantKey).find((entry) => entry.key === key);
    const value = accepted.values[key] ?? "";
    return `${field?.label ?? key} → ${field?.input === "date" ? displayDate(value, document.style) : value}`;
  });

  const lines = [`Updated the ${who}: ${described.join("; ")}.`];
  /*
   * A drafted paragraph that names the old value is not rewritten here — the
   * reference platform only rewrites paragraphs for its own field readers —
   * so the manager is told to give it a read.
   */
  const drafted = loaded.values.some(
    (row) => row.filledBy === "ai" && (row.value ?? "").trim() !== "" && !written.includes(row.fieldKey),
  );
  if (drafted && written.includes("employee_name")) {
    lines.push("", "The drafted text was written before this change — give it a quick read to make sure it still names the right person.");
  }

  return { ...reply(lines.join("\n")), formUpdate: { instanceId: input.instanceId, updated: written } };
}

function reply(content: string): AskResponse {
  return { content, citations: [], coverage: "not_applicable" };
}
