import "server-only";

import { randomUUID } from "node:crypto";

import { PRIMARY_FORM_KEY, companyFormFor } from "@/config/company/forms";
import { ACTIVE_BRAND } from "@/lib/brand";
import { businessToday } from "@/lib/business-date";
import {
  answersNameConfirmation,
  matchEmployeeName,
  nameConfirmationQuestion,
  settledNameQuestions,
} from "@/lib/forms/employee-match";
import { loadScopedRoster } from "@/lib/forms/employee-roster";
import { extractFormDate } from "@/lib/forms/form-date-answer";
import { inlineDraftVariantKey, supportsInlineDraft } from "@/lib/forms/inline-draft";
import {
  buildProposal,
  extractEmployeeNames,
  managerContext,
  resolveEmployee,
  type EmployeeResolution,
  type ManagerContext,
} from "@/lib/forms/proposal";
import { endsIntake } from "@/lib/forms/proposal-continuation";
import { type TemplateSummary } from "@/lib/forms/repository";
import { detectTemplateIntent, type TemplateIntent } from "@/lib/forms/template-intent";
import { DEFAULT_PERMISSION_MATRIX, hasPermission } from "@/lib/permissions";
import type {
  AccessScope,
  ChatFormChoice,
  ChatFormProposal,
  ChatFormSelection,
  ChatMessage,
  Permission,
  Role,
} from "@/types";

import type { AskResponse } from "./types";

/**
 * ============================================================================
 * PROPOSING A FORM FROM A CONVERSATION
 * ============================================================================
 *
 * WHICH FORM, WHO IT IS ABOUT AND WHICH LOCATION ARE NEVER THE MODEL'S TO
 * DECIDE. This module reads the manager's own words deterministically and
 * PROPOSES: a validated, published template the actor may create, whoever the
 * manager actually named, the location their scope proves, and a plain list of
 * what is still missing. Nothing is written here, and no value is invented to
 * fill a gap.
 *
 * Which forms exist and how each behaves in chat is company configuration
 * (`src/config/company/forms/`). This module is the platform flow around it:
 *
 *   1. intent        a named form, "a form", or a continuation of the intake
 *                    the previous turn opened
 *   2. validation    published and active, and the actor's role may create it
 *   3. the employee  read from the manager's turns; checked against the
 *                    employee directory when the registry asks for it
 *   4. the location  `proposeLocation` — the manager's words, the employee's
 *                    directory location, the account's scope
 *   5. the card      a `ChatFormProposal` the thread renders; the create action
 *                    appears only when nothing is missing
 */

export interface ChatActor {
  role: Role | null;
  scope: AccessScope | null;
}

export interface ProposalTurn {
  history: Pick<ChatMessage, "id" | "role" | "content" | "error">[];
  question: string;
  questionMessageId?: string;
  actor: ChatActor;
  /** The template a previous turn's proposal was for, when the browser says one is open. */
  continueTemplateKey?: string;
  summaries: readonly TemplateSummary[];
  today?: string;
}

function isCreatable(summary: TemplateSummary): boolean {
  return summary.active && summary.currentVersion?.status === "published";
}

/**
 * Checked against the SERVER matrix, never a browser copy. A null role (an
 * unverified preview actor) permits nothing.
 */
function permits(actor: ChatActor, summary: TemplateSummary): boolean {
  if (!actor.role) return false;
  return hasPermission(
    DEFAULT_PERMISSION_MATRIX,
    actor.role,
    summary.requiredPermission as Permission,
  );
}

function offeredInChooser(templateKey: string): boolean {
  return companyFormFor(templateKey)?.offeredInChooser === true;
}

function bulletList(names: string[]): string {
  return names.map((name) => `- ${name}`).join("\n");
}

function turn(
  content: string,
  formProposal?: ChatFormProposal,
  formSelection?: ChatFormSelection,
): AskResponse {
  return {
    content,
    citations: [],
    coverage: "not_applicable",
    formProposal,
    formSelection,
  };
}

/**
 * The proposal for this turn, or null when the turn is not about creating a
 * form (it is then answered normally).
 */
export async function proposeFormForTurn(input: ProposalTurn): Promise<AskResponse | null> {
  const intent = intentForTurn(input);
  if (intent.kind === "none") return null;

  const summaries = input.summaries;
  const available = summaries.filter(isCreatable).filter((summary) => permits(input.actor, summary));
  const offered = available.filter((summary) => offeredInChooser(summary.key));

  if (intent.kind === "ambiguous") {
    return turn(ambiguousContent(offered), undefined, formSelection(offered));
  }

  const match = summaries.find((summary) => summary.key === intent.templateKey);

  if (!match || !isCreatable(match)) {
    return turn(
      [
        `That form is not published in ${ACTIVE_BRAND.productName} yet, so I will not stand in for it with a different one.`,
        "",
        offered.length > 0
          ? `Here is what you can start today:\n\n${bulletList(offered.map((summary) => summary.name))}`
          : "There are no published forms available to you right now — an administrator publishes them under Form Templates.",
      ].join("\n"),
    );
  }

  if (!permits(input.actor, match)) {
    return turn(
      [
        `Your role cannot create a **${match.name}**, so I will not propose one.`,
        "",
        offered.length > 0
          ? `You can start these:\n\n${bulletList(offered.map((summary) => summary.name))}`
          : "Ask your manager which forms your role should cover.",
      ].join("\n"),
    );
  }

  return proposeTemplate(input, match);
}

async function proposeTemplate(input: ProposalTurn, match: TemplateSummary): Promise<AskResponse> {
  const context = managerContext(input.history, {
    id: input.questionMessageId,
    content: input.question,
  });

  const directory = await checkTypedEmployee(input, match, context);
  const variants = match.currentVersion?.variants ?? [];

  const proposal = buildProposal({
    ...(directory.resolution ? { employee: directory.resolution } : {}),
    employeeLocationIds: directory.locationIds ?? [],
    proposalId: randomUUID(),
    templateKey: match.key,
    templateName: match.name,
    context,
    scope: input.actor.scope,
    inlineDraftSupported: supportsInlineDraft(match.key, variants),
    variantKey: inlineDraftVariantKey(variants),
    today: input.today,
  });

  if (directory.question) return turn(directory.question, proposal);

  const content = proposalContent(proposal, context);
  return turn(directory.note ? `${content}\n\n${directory.note}` : content, proposal);
}

interface DirectoryCheck {
  resolution?: EmployeeResolution;
  locationIds?: readonly string[];
  question?: string;
  note?: string;
}

/**
 * THE TYPED NAME, AGAINST THE EMPLOYEE DIRECTORY — for forms the registry
 * marks `checkEmployeeName`. An exact match uses the directory's spelling; a
 * near match is ONE confirmation question; no match is a note, never a block:
 * the directory can lag a new hire, and the manager's spelling stands.
 */
async function checkTypedEmployee(
  input: ProposalTurn,
  match: TemplateSummary,
  context: ManagerContext,
): Promise<DirectoryCheck> {
  if (companyFormFor(match.key)?.checkEmployeeName !== true) return {};
  const typed = resolveEmployee(context);
  if (typed.kind !== "resolved") return {};

  const roster = await loadScopedRoster(input.actor.scope);
  const result = matchEmployeeName(typed.employeeName, roster);
  if (result.kind === "unchecked") return {};
  if (result.kind === "exact") {
    return {
      resolution: { kind: "resolved", employeeName: result.name },
      locationIds: result.employee.locationIds,
    };
  }

  const settled = settledNameQuestions([...input.history, { role: "user", content: input.question }]);
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  if (settled.kept.some((name) => same(name, typed.employeeName))) return {};

  if (result.kind === "none") {
    return {
      note: `I didn't find **${typed.employeeName}** in the employee list for your ${ACTIVE_BRAND.vocabulary.locationNounPlural}, so the form will use the name exactly as you typed it. Check the spelling before you file it.`,
    };
  }

  const accepted = result.candidates.find((candidate) =>
    settled.accepted.some((name) => same(name, candidate.name)),
  );
  if (accepted) {
    return {
      resolution: { kind: "resolved", employeeName: accepted.name },
      locationIds: accepted.employee.locationIds,
    };
  }

  const names = result.candidates.map((candidate) => candidate.name);
  return {
    resolution: { kind: "ambiguous", candidates: names },
    question: nameConfirmationQuestion(typed.employeeName, names),
  };
}

/* ------------------------------------------------------ suggested forms -- */

export interface SuggestedForms {
  readonly lead: string;
  readonly selection: ChatFormSelection;
}

/**
 * Proactive form suggestions after an ordinary answer.
 *
 * NONE UNTIL THE COMPANY DEFINES WHEN. Ask Sunny suggested specific forms when
 * a conversation described a performance concern; which Buff form answers
 * which situation is a business rule nobody has supplied, so this suggests
 * nothing rather than guessing. The hook stays so the rule can be added to the
 * registry without touching the chat pipeline.
 */
export function suggestFormsForTurn(input: ProposalTurn): SuggestedForms | null {
  void input;
  return null;
}

/* --------------------------------------------------------------- intent -- */

function intentForTurn(input: ProposalTurn): TemplateIntent {
  const spoken = detectTemplateIntent(input.question);
  const continued = input.continueTemplateKey?.trim();

  if (spoken.kind === "ambiguous") {
    if (continued) return { kind: "explicit", templateKey: continued };
    const named = namedInManagerTurns(input);
    if (named.kind === "explicit") return named;
    return spoken;
  }

  if (spoken.kind !== "none") return spoken;

  if (!continued) return { kind: "none" };

  const open = input.summaries.find((summary) => summary.key === continued);
  if (open && answersNameConfirmation(input.history, input.question)) {
    return { kind: "explicit", templateKey: continued };
  }

  if (!continuesIntake(input)) return { kind: "none" };

  return { kind: "explicit", templateKey: continued };
}

const ASKS_FOR_ADVICE =
  /^(?:so\s+|and\s+|ok\s+|okay\s+)?(?:what|what's|whats|how|why|when|where|which|who)\b|\b(?:how\s+(?:do|should|can|could|would)\s+(?:i|we)|what\s+should\s+(?:i|we)|tips?|advice|guidance)\b/i;

const TOPIC_STATEMENT =
  /\b(?:topic|subject|reason|issue|concern|details?|behaviou?r|observed|observation)\s*(?:is|was|are|were|:|-|=)/i;

const CARRIES_ON =
  /\b(?:same\s+form|this\s+form|continue|go\s+ahead|that'?s\s+(?:it|all|everything|right)|yes|yep|yeah|correct)\b/i;

const ABOUT_THE_EMPLOYEE = /^(?:and\s+|also\s+|then\s+)?(?:she|he|they)(?:['’](?:s|d|ve|re|ll))?\b/i;

/**
 * Whether a message with no form named is still ANSWERING the intake the
 * previous turn opened: a name, a date, a description, a "yes". A question
 * asking for advice ends the intake and is answered normally.
 */
function continuesIntake(input: ProposalTurn): boolean {
  const question = input.question.trim();
  if (endsIntake(question) || ASKS_FOR_ADVICE.test(question)) return false;
  if (extractEmployeeNames(question).length > 0) return true;
  if (/\?\s*$/.test(question)) return false;
  return (
    extractFormDate(question, input.today ?? businessToday()) !== null ||
    TOPIC_STATEMENT.test(question) ||
    CARRIES_ON.test(question) ||
    ABOUT_THE_EMPLOYEE.test(question)
  );
}

function namedInManagerTurns(input: ProposalTurn): TemplateIntent {
  const context = managerContext(input.history, {
    id: input.questionMessageId,
    content: input.question,
  });
  for (const message of [...context.messages].reverse()) {
    const intent = detectTemplateIntent(message.content);
    if (intent.kind === "explicit") return intent;
  }
  return { kind: "none" };
}

/* -------------------------------------------------------------- content -- */

function ambiguousContent(offered: TemplateSummary[]): string {
  if (offered.length === 0) {
    return "I can't tell which form you need, and there are no published forms available to you right now. An administrator publishes them under Form Templates.";
  }
  return "Which form do you need?";
}

function formSelection(offered: TemplateSummary[]): ChatFormSelection | undefined {
  if (offered.length === 0) return undefined;
  const primary =
    (PRIMARY_FORM_KEY ? offered.find((summary) => summary.key === PRIMARY_FORM_KEY) : undefined) ??
    offered[0]!;
  return {
    primary: choice(primary),
    additional: offered.filter((summary) => summary.key !== primary.key).map(choice),
  };
}

function choice(summary: TemplateSummary): ChatFormChoice {
  return {
    templateKey: summary.key,
    templateName: summary.name,
    description: summary.description,
  };
}

function todayInWords(): string {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function proposalContent(proposal: ChatFormProposal, context: ManagerContext): string {
  const lines: string[] = [`Here is what I would put on a **${proposal.templateName}**.`, ""];
  const noun = ACTIVE_BRAND.vocabulary.locationNoun;

  if (proposal.status === "needs_employee") {
    lines.push(openingQuestions(proposal, context));
  } else if (proposal.status === "needs_location") {
    lines.push(locationQuestion(proposal));
  } else {
    lines.push(
      `Everything I need is here, drawn from ${context.messages.length === 1 ? "your message" : "your messages"} above.`,
    );
  }

  if (proposal.status !== "needs_employee") {
    lines.push("");
    if (proposal.supportsInlineDraft) {
      lines.push(
        proposal.locationResolution === "not_applicable"
          ? `I have the employee. Your account covers every ${noun}, so this form won't name one. Create the draft here when you're ready and edit it below — nothing is saved to anyone's file until you do.`
          : `I have the employee and the ${noun}. Create the draft here when you're ready, and edit it below — nothing is saved to anyone's file until you do.`,
      );
    } else {
      lines.push(
        "**Nothing has been created.** This is a proposal, not a form — I can't create this one in chat yet.",
      );
    }
  }

  return lines.join("\n");
}

function openingQuestions(proposal: ChatFormProposal, context: ManagerContext): string {
  const employee = resolveEmployee(context);
  if (employee.kind === "ambiguous") {
    const names = employee.candidates.map((name) => `**${name}**`);
    return `Which of them is this **${proposal.templateName}** for — ${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}?`;
  }
  const asks = ["The employee's full name."];
  if (proposal.locationResolution === "needs_selection") {
    asks.push(`Which of your ${ACTIVE_BRAND.vocabulary.locationNounPlural} this is about.`);
  }
  if (!proposal.formDate) {
    asks.push(`The date for the form (if you say "today," I'll use ${todayInWords()}).`);
  }
  asks.push("What the form should cover, in your own words.");
  if (!proposal.employeeRole) {
    asks.push("The employee's job title (optional but helpful).");
  }
  if (asks.length === 1) return "Who is this form for? Tell me the employee's full name.";
  const numbered = asks.map((ask, index) => `${index + 1}. ${ask}`).join("\n");
  return `To draft a form, I'll need a few details first:\n\n${numbered}\n\nCould you please provide these?`;
}

function locationQuestion(proposal: ChatFormProposal): string {
  const noun = ACTIVE_BRAND.vocabulary.locationNoun;
  if (proposal.locationResolution === "needs_selection" && proposal.namedLocationOutOfScope) {
    return `**${proposal.namedLocationOutOfScope}** isn't a ${noun} on your assignment, so I can't file a form against it. Which of your ${ACTIVE_BRAND.vocabulary.locationNounPlural} is this about?`;
  }
  if (proposal.locationResolution === "needs_selection") {
    return `I won't choose which ${noun} this belongs to. Which ${noun} is this about?`;
  }
  return `I can't confirm which ${noun} this would be filed against, so the proposal has none. A form can only name a ${noun} ${ACTIVE_BRAND.productName} can verify you're assigned to.`;
}
