import "server-only";

import { randomUUID } from "node:crypto";

import {
  buildProposal,
  correctsTheEmployee,
  displayPersonName,
  employeeState,
  extractEmployeeNames,
  managerContext,
  resolveEmployee,
  type ManagerContext,
} from "@/lib/forms/proposal";
import {
  detectTemplateIntent,
  eppTemplateForRole,
  isFormVocabulary,
  type TemplateIntent,
} from "@/lib/forms/template-intent";
import {
  eppIntakePlan,
  eppIntakeRequest,
  readEppIntake,
  type EppIntakePlan,
  type EppIntakeReading,
} from "@/lib/forms/epp-intake";
import {
  answeredWhatHappened,
  asksToBeGuided,
  describesIncident,
  correctiveActionBasis,
  correctiveActionIntakeRequest,
  describesMoreThanTheRequest,
  NO_INCIDENT_NOTE,
  readCorrectiveActionIntake,
  type IntakeReading,
} from "@/lib/forms/corrective-action-intake";
import {
  CA_POLICY_QUESTION,
  caPolicyProposalLine,
  type NamedPolicyReading,
  namesCaPolicy,
  readCaPolicy,
  type CaPolicyReading,
} from "@/lib/forms/ca-policy";
import { offeredInChooser } from "@/lib/forms/chooser";
import { exitDetailsSupplied, readExitDetails } from "@/lib/forms/exit-details";
import {
  PAYROLL_DEDUCT_KEY,
  PAYROLL_DEDUCT_LABEL,
  payrollDeductFromConversation,
  payrollDeductUnclear,
  statedPayrollDeduct,
} from "@/lib/forms/payroll-deduct";
import { checkboxGroupsForVariant } from "@/lib/forms/document";
import {
  WARNING_LEVEL_KEYS,
  WARNING_LEVEL_QUESTION,
  WARNING_TYPE_KEY,
  mentionsEarlierWarning,
  warningLevelLabel,
  type WarningLevel,
} from "@/lib/forms/warning-level";
import { warningLevelFromConversation } from "@/lib/forms/warning-level-conversation";
import { exitFactsSupplied, readExitFacts } from "@/lib/forms/exit-facts";
import {
  exitEmployeeQuestion,
  exitIntakeRequest,
  exitNothingSupplied,
  exitReady,
} from "@/lib/forms/exit-intake";
import {
  describeKnownFacts,
  employmentChangeKind,
  formDateFor,
  hasStatedFacts,
  isQuestion,
  joinList,
  missingDetails,
  readEmploymentChange,
  type EmploymentChangeFacts,
  type EmploymentChangeKind,
} from "@/lib/forms/employment-change";
import { businessToday } from "@/lib/business-date";
import { locationById } from "@/lib/locations";
import { extractFormDate } from "@/lib/forms/form-date-answer";
import { endsIntake } from "@/lib/forms/proposal-continuation";
import { LEAD_IN, separateQuestions } from "@/lib/forms/message-parts";
import {
  answersNameConfirmation,
  displayName,
  matchEmployeeName,
  nameConfirmationQuestion,
  rosterNameNamedIn,
  settledNameQuestions,
  type RosterEmployee,
} from "@/lib/forms/employee-match";
import { loadScopedRosterResult } from "@/lib/forms/employee-roster";
import { unverifiedWithoutRecord, verifyEmployee } from "@/lib/forms/employee-verification";
import { namedStoreIds as namedStoreIdsFrom } from "@/lib/forms/location-scope";
import { continuesStore, readStoreConfirmation, storeAnswerTurns, storeQuestionOpen } from "@/lib/forms/store-confirmation";
import { describeStore, type StoreIndex } from "@/lib/stores/resolver";
import { loadKnownTitles, loadStoreIndex } from "@/lib/stores/woven-aliases";
import { neutralizeTitles } from "@/lib/forms/known-titles";
import { allowsTeamSubject } from "@/lib/forms/team-subject";
import { extractJobTitle, locationFor, type EmployeeResolution, type ProposalInput } from "@/lib/forms/proposal";
import type { EmployeeVerification } from "@/types";
import { STORE_QUESTION_TAG, answersToOpenQuestions } from "@/lib/forms/question-answers";
import {
  answersPositionQuestion,
  positionAlreadyAsked,
  positionAnsweredIn,
  positionQuestion,
  samePosition,
} from "@/lib/forms/employee-position";
import { readLocationMentions } from "@/lib/forms/location-mention";
import {
  answersDateQuestion,
  decideFormDate,
  incidentDates,
} from "@/lib/forms/incident-dates";
import {
  CLARIFIED_TEMPLATE_KEY,
  FORM_OR_GUIDANCE_QUESTION,
  answersFormClarification,
} from "@/lib/forms/form-clarification";
import { inlineDraftVariantKey, supportsInlineDraft } from "@/lib/forms/inline-draft";
import { buildFormInventory } from "@/lib/forms/inventory";
import {
  detectFormOpportunity,
  formOpportunityLead,
  suggestedTemplateKeys,
} from "@/lib/forms/form-opportunity";
import { type TemplateSummary } from "@/lib/forms/repository";
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

import { correctiveActionIssue } from "@/lib/forms/incident-issue";
import { signedDate, statedPriorActions } from "@/lib/forms/prior-actions";
import type { PriorFormOnFile, PriorFormsReading } from "@/lib/forms/prior-forms-lines";
import { describedManualSection, namedManualSection, namedPolicies } from "@/lib/forms/named-policy-section";
import type { ManualChunk } from "@/lib/forms/official-policy-manual";
import { readFormRequests, type FormRequest } from "@/lib/forms/form-requests";
import { answerCorrectiveAction } from "./form-answers";
import type { AskResponse } from "./types";

/*
 * WHICH TEMPLATES CAN BE CREATED WITHOUT LEAVING CHAT now lives in
 * `lib/forms/inline-draft.ts`, because the inventory that TELLS a manager
 * whether Bubbles can build a form has to give the same answer as the card that
 * offers to. Two copies of that set is how a card comes to offer a form the
 * sentence beside it says is unavailable.
 */

/**
 * The form offered first when the manager has not named one.
 *
 * A PRESENTATION ORDER, NOT A DEFAULT, and the distinction is the whole rule
 * this module enforces. Nothing resolves to this key: an unnamed request still
 * produces a question, and this only decides which card the manager sees
 * without expanding the rest. It is honoured only if the published library and
 * this actor's permissions both allow it.
 */
const PRIMARY_TEMPLATE_KEY = "coaching";

/** The two coaching documents, whose questions never assume a problem. */
const COACHING_TEMPLATES: ReadonlySet<string> = new Set(["coaching", "follow-up-coaching"]);

/**
 * ============================================================================
 * THE PERMISSION IS WHAT IDENTIFIES THE CORRECTIVE ACTION FORM
 * ============================================================================
 *
 * Not the key, and deliberately not the key. `create_corrective_action` is
 * carried by exactly one template in the library — the Policy Review has
 * `create_policy_review`, the coaching forms `create_coaching_form`, the six
 * performance plans `create_epp` — and it is the property that says what the
 * document IS rather than what it was historically called.
 *
 * That matters here more than anywhere: the stored key is `dpoa`, kept for
 * every filed record that addresses it, and a module that recognised the form
 * by that key would spread the legacy name into the one place the rename is
 * supposed to be complete. A deployment that republishes this form under a new
 * key keeps working; one that publishes a second form under this permission is
 * a library problem, and `find` taking the first is the same rule the rest of
 * this file follows.
 */
function isCorrectiveActionForm(summary: TemplateSummary): boolean {
  return summary.requiredPermission === "create_corrective_action";
}

/**
 * THE RESIGNATION/EXIT FORM, by the same token: `create_exit_form` is carried
 * by that one template, and says what the document is.
 */
function isExitForm(summary: TemplateSummary): boolean {
  return summary.requiredPermission === "create_exit_form";
}

/**
 * Whether the PUBLISHED version asks "Is payroll deduct applicable?".
 *
 * Read off the version a created form would pin, not off the seed: a database
 * that has not published the revision carrying the question yet (an open
 * draft holds it back — see `publishSeedRevision`) must not be asked for an
 * answer its form has nowhere to put.
 */
function asksPayrollDeduct(summary: TemplateSummary): boolean {
  const version = summary.currentVersion;
  if (!version?.document) return false;
  return checkboxGroupsForVariant(version.document, inlineDraftVariantKey(version.variants ?? [])).some(
    (group) => group.key === PAYROLL_DEDUCT_KEY,
  );
}

/**
 * The warning levels the PUBLISHED version's Type of Warning offers — read off
 * the version a created form would pin, like `asksPayrollDeduct`. Empty on a
 * version without the box, which is then never asked about.
 */
function offeredWarningLevels(summary: TemplateSummary): string[] {
  const version = summary.currentVersion;
  if (!version?.document) return [];
  const group = checkboxGroupsForVariant(version.document, inlineDraftVariantKey(version.variants ?? [])).find(
    (entry) => entry.key === WARNING_TYPE_KEY,
  );
  return (group?.options ?? []).map((option) => option.key).filter((key) => WARNING_LEVEL_KEYS.has(key));
}

/**
 * ============================================================================
 * A PERFORMANCE PLAN ASK BUBBLES CAN ACTUALLY BUILD IN THIS CONVERSATION
 * ============================================================================
 *
 * TWO CONDITIONS, AND BOTH ARE LOAD-BEARING.
 *
 * `create_epp` says the document IS a performance plan. It is carried by six
 * templates, which is why it cannot be the whole test — the intake below ends
 * by promising to draft the form, and promising that for a document the chat
 * flow refuses to create would be a lie told in the first sentence.
 *
 * `supportsInlineDraft` says the workflow EXISTS for this one, read off the
 * published version. Today that intersection is the SDIT EPP; the day another
 * plan's workflow ships it is that one too, with no edit here.
 *
 * NOT KEYED ON A TEMPLATE KEY, deliberately, and for the reason
 * `isCorrectiveActionForm` gives above: a permission and a published version
 * say what a document IS and what this build can do with it. A key says what it
 * was historically called.
 */
function isPerformancePlan(summary: TemplateSummary): boolean {
  return (
    summary.requiredPermission === "create_epp" &&
    supportsInlineDraft(summary.key, summary.currentVersion?.variants ?? [])
  );
}

/**
 * ============================================================================
 * A FORM PROPOSAL, ASSEMBLED SERVER-SIDE
 * ============================================================================
 *
 * `proposal.ts` reads a conversation; this file decides whether the thing it
 * read corresponds to a form this person may actually create. Three checks, in
 * this order, and a failure at any of them produces a QUESTION rather than a
 * proposal:
 *
 *   1. IS IT A REAL TEMPLATE?      resolved against `form_templates`, not
 *                                  against a keyword map. A key the sentence
 *                                  suggested is an intent; a published, active
 *                                  template with a published current version is
 *                                  a fact.
 *
 *   2. MAY THIS PERSON CREATE IT?  the TEMPLATE's own `required_permission`,
 *                                  applied through the server's matrix. No role
 *                                  list is written here, and nothing is
 *                                  broadened: a Salon Director who cannot
 *                                  create a Corrective Action Form in Forms
 *                                  cannot obtain one by
 *                                  asking Bubbles for it.
 *
 *   3. WHAT IS ACTUALLY KNOWN?     employee from the manager's own turns, salon
 *                                  from the authenticated scope. Whatever is
 *                                  missing is named as missing.
 *
 * ============================================================================
 * THE PROPOSAL IS NOT THE HR RECORD
 * ============================================================================
 *
 * Nothing in this file writes. There is no `form_instances` insert, no template
 * version pinned, no field value, no follow-up date, no PDF. A proposal is a
 * statement of what Bubbles WOULD create and what it still needs — and it stays
 * that way until a manager confirms it, which is not built yet and is not
 * pretended to be.
 */

/**
 * The authenticated caller, as chat needs it.
 *
 * A SEPARATE ARGUMENT FROM `AskRequest`, DELIBERATELY. `AskRequest` is parsed
 * from the request body; anything on it is something the browser could send. A
 * role and a scope are exactly the two values a caller must never be able to
 * assert about itself, so they travel on their own parameter, filled by the
 * route from the authorized context.
 */
export interface ChatActor {
  role: Role | null;
  /** `null` when no identity provider vouched for a scope. Never enforced against. */
  scope: AccessScope | null;
  /**
   * The account id and whether a provider verified it. Optional because only
   * the Forms Register lookup needs them — forms visibility is decided per
   * account (designated all-store access, the stores Woven assigns them, the
   * creator of a form) — and it reads nothing without both.
   */
  subject?: string;
  verified?: boolean;
}

export interface ProposalTurn {
  /** The store index, loaded by `proposeFormForTurn` when a form is open. */
  storeIndex?: StoreIndex;
  history: Pick<ChatMessage, "id" | "role" | "content" | "error">[];
  question: string;
  /**
   * Browser-local id of the manager's turn being answered. Provenance only —
   * see `ManagerContext`. Absent when the client did not send one.
   */
  questionMessageId?: string;
  actor: ChatActor;
  /**
   * The template of the proposal on the previous assistant turn, when one is
   * still open. Browser-supplied and revalidated like everything else — see
   * `lib/forms/proposal-continuation.ts`.
   */
  continueTemplateKey?: string;
  /**
   * The published library, read ONCE per turn by the caller.
   *
   * Passed in rather than fetched here so that the proposal, the inventory the
   * prompt is given, and any inventory answer all describe the SAME snapshot. A
   * second read could land either side of a publish, and then a card would
   * offer a form the block beside it did not list.
   */
  summaries: readonly TemplateSummary[];
  /**
   * Whether the Performance Management Framework is available for this turn.
   *
   * A THUNK, so the retrieval happens only on the one branch that needs it.
   * "Create a corrective action for Sarah" is the sole request whose answer
   * asserts the approved progression, and every other request through this
   * module would otherwise pay for a knowledge query it never reads.
   *
   * Absent means "not established", which is treated as unavailable: a caller
   * that cannot say the framework is healthy has not said it is.
   */
  progressionAvailable?: () => Promise<boolean>;
  /**
   * The pinned official policy manual's chunks, or null when it cannot be read.
   *
   * A THUNK, read only when a Corrective Action request names a policy that
   * `ca-policy.ts` does not know by name ("violating visitors at work
   * policy"), so the reply can say which section of the manual it is — or
   * that the manual has none by that name. Absent, the reply names the policy
   * in the manager's own words and the draft looks it up.
   */
  policyManual?: () => Promise<readonly ManualChunk[] | null>;
  /**
   * The employee's signed Coaching and Corrective Action forms in the Forms
   * Register, under this manager's visibility — read only for a Corrective
   * Action, so the history already on file is read back before the form is
   * created. Never rejects: an unreadable record is an empty list. See
   * `lib/forms/prior-forms.ts`.
   */
  priorFormsOnFile?: (employeeName: string, locationId: string | null) => Promise<PriorFormsReading>;
  /**
   * The server's business day (`YYYY-MM-DD`), which supplies the year for a
   * form date typed as month and day. See `lib/forms/form-date-answer.ts`.
   */
  today?: string;
  /**
   * Set when this turn is ONE of several forms asked for in one message. The
   * draft's sources are then only the manager's turns about this person alone
   * — a turn naming anybody else is left out — and this request's own clause.
   * See `lib/forms/form-requests.ts`.
   */
  oneOfSeveral?: { clause: string };
}

/** A template a real person may actually start today. */
function isCreatable(summary: TemplateSummary): boolean {
  return summary.active && summary.currentVersion?.status === "published";
}

function permits(actor: ChatActor, summary: TemplateSummary): boolean {
  if (!actor.role) return false;
  return hasPermission(
    DEFAULT_PERMISSION_MATRIX,
    actor.role,
    summary.requiredPermission as Permission,
  );
}

function bulletList(names: string[]): string {
  return names.map((name) => `- ${name}`).join("\n");
}

/** Every response from this module is a proposal turn, not a knowledge answer. */
function turn(
  content: string,
  formProposal?: ChatFormProposal,
  formSelection?: ChatFormSelection,
): AskResponse {
  return {
    content,
    // A proposal is not an answer drawn from the knowledge base, so it carries
    // no citations and coverage is not a meaningful question about it.
    // "The knowledge base does not cover this" would be a misleading thing to
    // show under a question Bubbles answered correctly.
    citations: [],
    coverage: "not_applicable",

    formProposal,
    formSelection,
  };
}

/**
 * Reads a form request and returns either a proposal or the question that has
 * to be answered before one exists.
 *
 * @returns `null` when the turn is not a form request, so the caller falls
 *          through to the ordinary grounded-answer path.
 */
/*
 * ============================================================================
 * ONE FORM PER TURN — AND THE REST OF THE MESSAGE IS NEVER DROPPED
 * ============================================================================
 *
 * Release QA, both platforms. The form path answers one request per turn, so:
 *
 *   "coaching form for avery testperson and a CA for jordan testperson"
 *        → a Coaching card asking "Avery or Jordan?"; the CA vanished
 *   "actually its jordan testperson. also whats the attendance policy?"
 *        → a card for Jordan; the question vanished
 *
 * Two DIFFERENT forms in one message are not guessed between, and not merged
 * into one card whose person is ambiguous: the manager is told both were
 * heard and asked to send them one at a time, each named with its own person
 * where the clause names exactly one. A question beside a form request gets
 * the card AND a line naming the question, so it can be asked on its own.
 */
export async function proposeFormForTurn(turnInput: ProposalTurn): Promise<AskResponse | null> {
  // An open form can be answered by a store ("Omaha") or changed ("use the Omaha store"),
  // which needs the same index the proposal reads — Woven names included.
  const withIndex: ProposalTurn = turnInput.continueTemplateKey
    ? { ...turnInput, storeIndex: turnInput.storeIndex ?? (await loadStoreIndex()) }
    : turnInput;
  // A Woven job title ("Assistant General Manager") must not be read as a second person's name.
  const titles = await loadKnownTitles();
  const input: ProposalTurn =
    titles.length === 0
      ? withIndex
      : {
          ...withIndex,
          question: neutralizeTitles(withIndex.question, titles),
          history: withIndex.history.map((message) =>
            message.role === "user" && typeof message.content === "string"
              ? { ...message, content: neutralizeTitles(message.content, titles) }
              : message,
          ),
        };
  const several = await severalFormsRequested(input);
  if (several) return several;
  const answer = await proposeOneForm(input);
  if (!answer?.formProposal) return answer;
  const questions = separateQuestions(input.question).questions.filter(
    (sentence) => detectTemplateIntent(sentence).kind === "none" && !extractEmployeeNames(sentence).length,
  );
  if (questions.length === 0) return answer;
  const quoted = questions.map((question) => `"${question.replace(LEAD_IN, "")}"`).join(" and ");
  return {
    ...answer,
    content: `${answer.content}\n\nYou also asked ${quoted} — ask that again on its own and I'll answer it.`,
  };
}

/*
 * ============================================================================
 * SEVERAL FORMS IN ONE MESSAGE — ONE PROPOSAL EACH
 * ============================================================================
 *
 * Signed-in QA, 8 Oct 2026: "coaching form for Avery Testperson and a CA for
 * Jordan Testperson" came back as ONE Coaching card asking which of the two it
 * was for, and the Corrective Action was dropped. Each request is now its own
 * proposal, read from ITS OWN CLAUSE only — its person, its date, its issue —
 * with its own id, its own card and its own draft (`sourceExcerpts`). Nothing
 * said about one employee is read into the other's form.
 *
 * Declined and conditional requests are named back, never proposed: "but no
 * CA for Jordan" and "if Jordan is late again, a CA" create nothing. A
 * request whose person the message does not settle is not guessed: the
 * manager is asked who each form is for, and no card is offered until then.
 */
async function severalFormsRequested(input: ProposalTurn): Promise<AskResponse | null> {
  const reading = readFormRequests(input.question);
  if (!reading) return null;
  const known = (key: string) => input.summaries.some((summary) => summary.key === key);
  const nameOf = (key: string) =>
    input.summaries.find((summary) => summary.key === key)?.name ?? "form";
  const requests = reading.requests.filter((request) => known(request.templateKey));
  const named = (request: FormRequest) =>
    `**${nameOf(request.templateKey)}**${request.employeeName ? ` for **${request.employeeName}**` : ""}`;

  const notes: string[] = [];
  for (const request of reading.declined.filter((entry) => known(entry.templateKey))) {
    notes.push(`I haven't started a ${named(request)}, as you said.`);
  }
  for (const request of reading.conditional.filter((entry) => known(entry.templateKey))) {
    notes.push(
      `I haven't started a ${named(request)} — that depends on something that hasn't happened yet. If it does, tell me and I'll set it up.`,
    );
  }

  if (requests.length === 0) {
    if (reading.conditional.length === 0 || notes.length === 0) return null;
    return { content: notes.join("\n\n"), citations: [], coverage: "not_applicable" };
  }

  if (requests.length === 1) {
    const only = await proposeOneForm({
      ...input,
      question: requests[0]!.clause,
      continueTemplateKey: undefined,
      oneOfSeveral: { clause: requests[0]!.clause },
    });
    if (!only) return null;
    return notes.length > 0 ? { ...only, content: `${only.content}\n\n${notes.join("\n\n")}` } : only;
  }

  /* Two forms, and the message does not say who one of them is for: ask, propose nothing. */
  if (requests.some((request) => request.employeeName === null)) {
    const list = requests.map(named);
    return {
      content: `You asked for ${requests.length === 2 ? "two" : String(requests.length)} forms: ${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}. Who is each one for? For example: "${nameOf(requests[0]!.templateKey)} for Avery Testperson and ${nameOf(requests[1]!.templateKey)} for Jordan Testperson".${notes.length > 0 ? `\n\n${notes.join("\n\n")}` : ""}`,
      citations: [],
      coverage: "not_applicable",
    };
  }

  const answers: { request: FormRequest; answer: AskResponse | null }[] = [];
  for (const request of requests) {
    /*
     * "A coaching form and a CA for Jordan": the bare clause is for the one
     * person the message names, so it is read with them — and drafted from
     * those words, which say nothing about anybody else.
     */
    const own =
      request.employeeName && !extractEmployeeNames(request.clause).length
        ? `${request.clause} for ${request.employeeName}`
        : request.clause;
    answers.push({
      request,
      answer: await proposeOneForm({
        ...input,
        question: own,
        continueTemplateKey: undefined,
        oneOfSeveral: { clause: own },
      }),
    });
  }

  const proposals = answers
    .map(({ answer }) => answer?.formProposal)
    .filter((proposal): proposal is ChatFormProposal => Boolean(proposal));
  const sections = answers.map(
    ({ request, answer }, index) =>
      `**${index + 1}. ${nameOf(request.templateKey)} — ${request.employeeName}**\n\n${
        answer?.content ?? "I couldn't set this one up from that message — ask for it on its own."
      }`,
  );
  return {
    content: [
      `You asked for ${requests.length === 2 ? "two" : String(requests.length)} forms, so here ${proposals.length === 1 ? "is" : "are"} ${proposals.length === 1 ? "one card" : `${proposals.length === 2 ? "two" : proposals.length} separate cards`} — each is created and drafted on its own, only from what you said about that person.`,
      ...sections,
      ...notes,
    ].join("\n\n"),
    citations: [],
    coverage: "not_applicable",
    ...(proposals.length > 0 ? { formProposal: proposals[0], formProposals: proposals } : {}),
  };
}

async function proposeOneForm(input: ProposalTurn): Promise<AskResponse | null> {
  const intent = intentForTurn(input);
  if (intent.kind === "none") return null;

  const summaries = input.summaries;
  const available = summaries.filter(isCreatable).filter((summary) => permits(input.actor, summary));

  /*
   * ==========================================================================
   * WHAT MAY BE PUT IN FRONT OF SOMEBODY WHO HAS NOT NAMED A FORM
   * ==========================================================================
   *
   * `available` is the authorization answer — published, active, and permitted
   * for this actor — and it stays exactly that, because every check in this
   * module still runs against it. `offered` is the narrower SUGGESTION answer:
   * the forms Bubbles volunteers when the manager has not chosen one. See
   * `lib/forms/chooser.ts` for which are withheld and why.
   *
   * THE ORDER MATTERS. Withholding is applied AFTER permission, never instead
   * of it, so a form nobody may create is still absent from both lists.
   *
   * NOTHING BELOW RESOLVES A NAMED FORM THROUGH THIS. A manager who names one
   * of the withheld templates is matched against `summaries` and checked
   * against `permits` as before — a suggestion list is not an allow-list.
   */
  const offered = available.filter((summary) => offeredInChooser(summary.key));

  /*
   * ==========================================================================
   * "CORRECTIVE ACTION" NAMES THE PROGRESSION, NOT A DOCUMENT
   * ==========================================================================
   *
   * The phrase used to be a matcher for the form itself, so a manager
   * who typed "I need to do a corrective action for Sarah" was handed a formal
   * warning selected for them by a keyword. §2 of the approved Performance
   * Management Framework is explicit that corrective action is the whole ladder
   * and the Corrective Action Form records its seventh rung.
   *
   * TWO DIFFERENT SENTENCES, TWO DIFFERENT ANSWERS. Asking for one to be
   * STARTED needs the document settled first, and that is a question — answered
   * with the ladder and the forms that record its rungs, all named from the
   * library. Asking what corrective action IS is a knowledge question, so it
   * returns null and goes to the grounded path, which pins the framework and
   * cites it. Neither branch proposes anything.
   */
  if (intent.kind === "corrective_action") {
    /*
     * ========================================================================
     * "WHAT IS CORRECTIVE ACTION?" IS STILL A KNOWLEDGE QUESTION
     * ========================================================================
     *
     * No creation verb, no document. It returns null and goes to the grounded
     * path, which pins the Performance Management Framework and cites it.
     */
    if (!intent.requestedCreation) return null;

    /*
     * ========================================================================
     * "CREATE A CORRECTIVE ACTION" IS A REQUEST FOR THE FORM — WITH ONE
     * EXCEPTION, AND THE EXCEPTION IS THE FRAMEWORK'S OWN
     * ========================================================================
     *
     * This branch used to answer every creation request with the ladder and a
     * question about which document. That was right while the seventh rung was
     * called something else: "corrective action" named the progression and
     * nothing else, so a manager typing it had not yet named a document.
     *
     * The rename settled it. The document a manager means when they ask to
     * create a corrective action is the Corrective Action Form, and answering
     * with a paragraph about the ladder — to somebody who has just named the
     * form — is the friction this work exists to remove. The intake is the
     * answer: ask for what the form needs, then build it.
     *
     * WHAT SURVIVES IS §7, WHICH IS A DIFFERENT RULE. Underperformance enters
     * the ladder at coaching. "Their Club Close is low, create a corrective
     * action" is a metric being used as grounds for formal accountability, and
     * the framework's answer to it is the progression rather than the form. So
     * the manager's stated BASIS is read — see `correctiveActionBasis`, which
     * diverts only when a metric is named, judged, and unaccompanied by
     * anything about anybody's behaviour — and everything else goes to the
     * form.
     */
    const correctiveActionForm = available.find(isCorrectiveActionForm);
    const basis = correctiveActionBasis(
      managerContext(input.history, {
        id: input.questionMessageId,
        content: input.question,
      }).text,
    );

    if (correctiveActionForm && basis !== "metric_only") {
      return proposeTemplate(input, correctiveActionForm);
    }

    return answerCorrectiveAction({
      inventory: buildFormInventory(summaries, input.actor),
      role: input.actor.role,
      /*
       * THE LADDER IS SHOWN ONLY IF THE DOCUMENT THAT DEFINES IT ANSWERED.
       * `CORRECTIVE_ACTION_LADDER` maps §2's rungs onto template keys, and a
       * map in a source file cannot know §2 was re-issued. See the note on
       * `answerCorrectiveAction`.
       */
      progressionAvailable: (await input.progressionAvailable?.()) ?? false,
      /*
       * WHY THE LADDER IS BEING SHOWN, when the manager asked for a document.
       * A metric-only request gets the progression instead of the form, and an
       * answer that does not say so reads as Ask Bubbles failing to understand a
       * plain sentence rather than as the rule it is.
       */
      metricOnly: basis === "metric_only",
    });
  }

  if (intent.kind === "ambiguous") {
    return turn(ambiguousContent(offered), undefined, formSelection(offered));
  }

  if (intent.kind === "clarify") {
    // Only a form this manager can actually start is offered as the other half.
    const clarified = available.find((summary) => summary.key === intent.templateKey);
    return clarified ? clarifyFormOrGuidance(input, clarified) : null;
  }

  const match = summaries.find((summary) => summary.key === intent.templateKey);

  /*
   * NAMED SOMETHING THE LIBRARY DOES NOT PUBLISH.
   *
   * Not an error and not a silent substitution. The prototype's answer to this
   * situation was the Coaching Form; the answer here is to say so and list what
   * this deployment actually has.
   */
  if (!match || !isCreatable(match)) {
    return turn(
      [
        "That form is not published in Ask Bubbles yet, so I will not stand in for it with a different one.",
        "",
        offered.length > 0
          ? `Here is what you can start today:\n\n${bulletList(offered.map((summary) => summary.name))}`
          : "There are no published forms available to you right now — an administrator publishes them under Form Templates.",
      ].join("\n"),
    );
  }

  /*
   * THE TEMPLATE'S OWN PERMISSION, NOT A ROLE LIST WRITTEN IN CHAT.
   *
   * `required_permission` is data on the template row, which is why a Salon
   * Director may be offered a Coaching Form and refused a Corrective Action
   * Form without either rule appearing here.
   */
  if (!permits(input.actor, match)) {
    return turn(
      [
        `Your role cannot create a **${match.name}**, so I will not propose one.`,
        "",
        offered.length > 0
          ? `You can start these:\n\n${bulletList(offered.map((summary) => summary.name))}`
          : "Ask your district manager which forms your role should cover.",
      ].join("\n"),
    );
  }

  /*
   * ==========================================================================
   * §7 APPLIES TO THE NAMED FORM TOO
   * ==========================================================================
   *
   * A manager who names the Corrective Action Form and gives a low metric as
   * the reason is making the same request as one who says "create a corrective
   * action" — the framework's answer is the ladder either way, and a rule that
   * could be stepped over by naming the document is not a rule.
   *
   * It costs nothing in the ordinary case: `correctiveActionBasis` diverts only
   * when a metric is named, judged, and unaccompanied by anything about
   * anybody's behaviour. Say what happened and the form is proposed.
   */
  if (isCorrectiveActionForm(match)) {
    const basis = correctiveActionBasis(
      managerContext(input.history, {
        id: input.questionMessageId,
        content: input.question,
      }).text,
    );
    if (basis === "metric_only") {
      return answerCorrectiveAction({
        inventory: buildFormInventory(summaries, input.actor),
        role: input.actor.role,
        progressionAvailable: (await input.progressionAvailable?.()) ?? false,
        metricOnly: true,
      });
    }
  }

  return proposeTemplate(input, match);
}

/**
 * Builds the proposal for a template that has already passed both checks.
 *
 * SEPARATE SO THE CORRECTIVE-ACTION BRANCH CAN REACH IT. That branch resolves
 * its template from the library rather than from a matcher, and a second copy
 * of this assembly is how the two paths would come to pin different things.
 */
async function proposeTemplate(input: ProposalTurn, match: TemplateSummary): Promise<AskResponse> {
  const context = managerContext(input.history, {
    id: input.questionMessageId,
    content: input.question,
  });

  /*
   * THE TYPED NAME, CHECKED AGAINST THE PEOPLE THIS MANAGER MAY FILE ABOUT.
   * See `checkTypedEmployee`: an exact match takes the directory's spelling and
   * salon, a close one is asked about, and nothing is ever autocorrected.
   */
  const storeIndex = input.storeIndex ?? (await loadStoreIndex());
  const confirmedStore = readStoreConfirmation(input.history, input.question);
  const employeeContext = withoutAnswersToQuestions(context, input.history, input.question);
  const carried = NAME_CHECKED_TEMPLATES.has(match.key) ? employeeFromEarlierTurns(input, employeeContext) : null;
  const directory = await checkTypedEmployee(input, match, employeeContext, storeIndex, carried);

  const proposalInput: ProposalInput = {
    ...(directory.resolution
      ? { employee: directory.resolution }
      : carried
        ? { employee: carried }
        : employeeContext !== context
          ? { employee: resolveEmployee(employeeContext) }
          : {}),
    employeeLocationIds: directory.locationIds ?? [],
    storeIndex,
    reportUnmatchedStore: !employmentChangeKind(match.key),
    storeReply: {
      bareReply: storeQuestionOpen(input.history),
      // "66" answered an earlier store question: still the answer on this turn (QA F-12).
      answeredTurns: storeAnswerTurns(input.history, storeIndex),
      ...(confirmedStore ? { confirmedCode: confirmedStore.code } : {}),
    },
    ...(directory.verification ? { employeeVerification: directory.verification } : {}),
    /*
     * SERVER-GENERATED, never taken from the request. A proposal id is how a
     * later confirmation step will name the thing being confirmed; a
     * caller-chosen one would let a caller name somebody else's.
     */
    proposalId: randomUUID(),
    templateKey: match.key,
    templateName: match.name,
    context,
    scope: input.actor.scope,
    /*
     * READ OFF THE PUBLISHED VERSION, not off the key alone. `supportsInlineDraft`
     * also refuses a template that declares variants: the chat flow sends no
     * variant, so an EPP created here would pin `null` and print "In what areas
     * is the the employee currently succeeding?" on a performance plan.
     */
    inlineDraftSupported: supportsInlineDraft(
      match.key,
      match.currentVersion?.variants ?? [],
    ),
    /*
     * THE READING TO PIN, taken off the published version rather than the seed
     * — the same source `supportsInlineDraft` reads, so the two can never
     * disagree about a template. Null where the document prints one way, which
     * is what the column has always held for those.
     */
    variantKey: inlineDraftVariantKey(match.currentVersion?.variants ?? []),
    today: input.today,
    /*
     * The exit form is dated the day it is completed. Its conversation is
     * made of other dates — the last day worked, the notice — and the first of
     * them is not the form's.
     */
    formDateFromConversation: !isExitForm(match),
  };
  const proposal = buildProposal(proposalInput);

  /*
   * ==========================================================================
   * A DEMOTION'S JOB TITLE IS THE ONE THEY ARE MOVING FROM
   * ==========================================================================
   *
   * `extractJobTitle` reads the most specific title anywhere in the
   * conversation, which on "from general manager to team member" is the
   * NEW one — so the form's Job Title line would have printed the title the
   * employee is leaving for. On these forms Job Title is the current title,
   * and it is read with the direction the manager gave it; where they gave
   * only the new one, the line is left for them.
   *
   * The same holds for the date: "effective october 5" is when the change
   * takes effect, not the date the form is written.
   */
  const changeKind = employmentChangeKind(match.key);
  /*
   * ONLY THE TURNS ABOUT THIS FORM AND THIS PERSON. Found in hands-on QA: a
   * transfer for one employee, asked for right after a demotion for another in
   * the same conversation, picked up the other employee's new pay rate —
   * because the facts, and the notes the draft is written from, were read from
   * every recent manager turn. See `turnsAboutThisForm`.
   */
  /*
   * EVERY FORM, NOT ONLY THE EMPLOYMENT CHANGES. Found in signed-in QA: a
   * Corrective Action asked for after three policy questions and a Coaching
   * Form for somebody else was drafted from all six of those turns — the other
   * employee's request and the shirt policy question included. The draft is
   * written from `sourceMessageIds`, so that list is now the turns about this
   * form and this person, and nothing else.
   */
  const scoped = turnsAboutThisForm(context, match.key, proposal.employeeName, {
    correctiveActionForm: isCorrectiveActionForm(match),
  });
  proposal.sourceMessageIds = scoped.ids;
  /*
   * THE PAYROLL-DEDUCT ANSWER, FROM THIS FORM'S CONVERSATION. Read over both
   * sides because a bare "no" answers only the question Ask Bubbles asked just
   * before it — the assistant turns say WHICH question, never the answer. It
   * starts at this form's first turn, so an answer given for an earlier
   * request in the same chat does not carry onto a new one.
   */
  const firstScoped = scoped.messages[0]?.id;
  const firstAt = firstScoped ? input.history.findIndex((message) => message.id === firstScoped) : -1;
  const formHistory =
    firstAt >= 0
      ? input.history.slice(firstAt)
      : scoped.messages.length === 1
        ? input.history.slice(-1).filter((message) => message.role === "assistant")
        : input.history;
  if (isCorrectiveActionForm(match) && asksPayrollDeduct(match)) {
    proposal.payrollDeduct = payrollDeductFromConversation(
      [...formHistory, { role: "user", content: input.question }],
      // `formHistory` is already this form's turns: a repeated request keeps the answer.
      { fromThisForm: true },
    );
  }
  /* The form's date from this form's turns, too. */
  if (!changeKind && !isExitForm(match)) {
    proposal.formDate = extractFormDate(scoped.text, input.today ?? businessToday());
  }
  const excerpts = {
    ...scoped.excerpts,
    ...(input.oneOfSeveral && input.questionMessageId ? { [input.questionMessageId]: input.oneOfSeveral.clause } : {}),
  };
  if (Object.keys(excerpts).length > 0) proposal.sourceExcerpts = excerpts;

  /*
   * THE WARNING LEVEL FOR THIS FORM, FROM THE MANAGER'S OWN WORDS — and only a
   * level they stated for it. "Given verbal warning on 9/21" is history and
   * goes on the prior-actions line; it never sets this box, and neither does
   * "again". Unstated stays null, and the reply asks. See `warning-level.ts`.
   *
   * Read turn by turn from THIS FORM'S turns about THIS person — the same
   * scope the draft is written from, each turn's own clause where one message
   * asked for several forms — so a level said for somebody else cannot land.
   */
  if (isCorrectiveActionForm(match)) {
    const offered = offeredWarningLevels(match);
    const stated = warningLevelFromConversation(
      scoped.messages.map((message) => ({
        role: "user",
        content: (message.id ? excerpts[message.id] : undefined) ?? message.content,
      })),
      input.today ?? businessToday(),
      // `scoped` is already this form's turns about this person.
      { fromThisForm: true },
    );
    proposal.warningLevel = stated && offered.includes(stated) ? stated : null;
  }
  const facts = changeKind
    ? readEmploymentChange(
        scoped.messages.map((message) => message.content),
        input.today ?? businessToday(),
      )
    : null;
  if (changeKind && facts) {
    proposal.employeeRole = facts.current.title ?? null;
    proposal.formDate = formDateFor(scoped.text, input.today ?? businessToday());
  }
  /*
   * A TRANSFER IS FILED AT THE STORE THE EMPLOYEE IS LEAVING. "From store 236 to
   * store 67" names two stores, and reading both as the form's store is a
   * question with one answer: the CURRENT one is where the form is filed, the
   * new one is a fact printed on it. Read through the same resolver, scope
   * check and confirmation rules as any other store.
   */
  if (changeKind && facts?.current.location) {
    const relocated = buildProposal({ ...proposalInput, locationText: facts.current.location });
    proposal.locationId = relocated.locationId;
    proposal.locationName = relocated.locationName;
    proposal.locationResolution = relocated.locationResolution;
    proposal.authorizedLocationIds = relocated.authorizedLocationIds;
    proposal.status = relocated.status;
    proposal.supportsInlineDraft = relocated.supportsInlineDraft;
    if (relocated.locationSelection) proposal.locationSelection = relocated.locationSelection;
    else delete proposal.locationSelection;
    if (relocated.namedLocationOutOfScope) proposal.namedLocationOutOfScope = relocated.namedLocationOutOfScope;
    else delete proposal.namedLocationOutOfScope;
  }
  // WOVEN'S TITLE WINS where Woven verified the employee — over the manager's wording
  // and over a title read out of the conversation.
  if (directory.verification?.status === "verified" && directory.verification.title) {
    proposal.employeeRole = directory.verification.title;
  }

  /*
   * NAMED, BUT NOT DESCRIBED. A Corrective Action Form is drafted from the
   * account, and the policy citation is resolved from the offense that account
   * supports — so a form created from "create ca for Pat Rivera" alone comes
   * back without one (reference platform, production, 20 Oct 2026). It can
   * still be created; the card says so, and says that telling Ask Bubbles what
   * happened redrafts it with the citation (see `chat-redraft.ts`). The
   * employee's name, their position and every name this company's stores
   * answer to are not an account — read here, after Woven's position has been
   * set.
   */
  if (
    isCorrectiveActionForm(match) &&
    proposal.status !== "needs_employee" &&
    // This form's turns only: another person's account earlier in the chat is not this one's.
    !describesIncident(scoped.text) &&
    !describesMoreThanTheRequest(scoped.text, {
      ignore: [
        proposal.employeeName ?? "",
        proposal.employeeRole ?? "",
        ...storeIndex.stores.map((store) => store.name),
        ...storeIndex.aliases.map((alias) => alias.phrase),
      ],
    }) &&
    !answeredWhatHappened([...input.history, { role: "user", content: input.question }])
  ) {
    proposal.awaitingIncident = true;
  }

  if (directory.question) return turn(directory.question, proposal);

  if (proposal.locationResolution === "resolved" && proposal.subject !== "team") {
    const detailed = locationFor(changeKind && facts?.current.location ? { ...proposalInput, locationText: facts.current.location } : proposalInput, false);
    if (detailed.resolution === "resolved" && detailed.source) proposal.locationSource = detailed.source;
  }

  const notes: string[] = directory.note ? [directory.note] : [];
  notes.push(...directoryNotes(proposal, directory, match, input, scoped));
  if (carried && proposal.employeeName && !directory.question) {
    notes.push(
      `I took **${proposal.employeeName}** from earlier in this conversation — if this form is for somebody else, tell me who.`,
    );
  }

  const content =
    changeKind && facts
      ? employmentChangeContent(changeKind, facts, proposal, context)
      : proposalContent(proposal, scoped, match, input.today ?? businessToday(), {
          namedPolicy: isCorrectiveActionForm(match) ? await namedPolicyFor(scoped.text, input) : null,
          priorOnFile:
            isCorrectiveActionForm(match) && proposal.employeeName && proposal.status !== "needs_employee"
              ? ((await input.priorFormsOnFile?.(proposal.employeeName, proposal.locationId)) ?? NO_PRIOR_FORMS)
              : NO_PRIOR_FORMS,
        });
  return turn(withNotes(content, notes), proposal);
}

/**
 * ============================================================================
 * THE PERSON THIS CONVERSATION HAS BEEN ABOUT
 * ============================================================================
 *
 * Ported from the reference platform (production feedback, 20 Oct 2026): a
 * conversation that opened with a Corrective Action Form for one employee ran
 * on about a policy, and "Create a Coaching Form from this conversation" then
 * asked who the form was for. Their name was in the conversation — just
 * further back than the window of manager turns the facts are read from.
 *
 * So when the window names nobody, the whole conversation's manager turns are
 * read for the person — the person only, every other fact still comes from the
 * window. It is used only when the conversation settles on ONE person
 * (`employeeState`, with its corrections and "not her" rules), and the reply
 * says where the name came from, so the manager can change it before Create.
 * The name is still checked against the directory like any typed name.
 */
function employeeFromEarlierTurns(input: ProposalTurn, context: ManagerContext): EmployeeResolution | null {
  if (resolveEmployee(context).kind !== "missing") return null;
  const turns = [
    ...input.history
      .filter((message) => message.role === "user" && !message.error)
      .filter((message) => typeof message.content === "string" && message.content.trim() !== "")
      .map((message) => ({ id: message.id, content: message.content.trim() })),
    { id: input.questionMessageId, content: input.question.trim() },
  ];
  if (turns.length <= context.messages.length) return null;
  const resolution = employeeState({
    messages: turns,
    ids: [],
    text: turns.map((turn) => turn.content).join("\n\n"),
    truncated: false,
  }).resolution;
  return resolution.kind === "resolved" ? resolution : null;
}

/**
 * The directory's sentences go BEFORE the closing line that invites the manager
 * to create the draft, so the questions and read-backs are read first and the
 * card's call to action stays last. Anything else is appended.
 */
const CLOSING_LINE = /^(?:Create the draft here|Your account covers every|\*\*Nothing has been created|I have the employee|This one is for the whole team)/;

function withNotes(content: string, notes: readonly string[]): string {
  if (notes.length === 0) return content;
  const blocks = content.split("\n\n");
  const last = blocks[blocks.length - 1] ?? "";
  if (CLOSING_LINE.test(last)) blocks.splice(blocks.length - 1, 0, ...notes);
  else blocks.push(...notes);
  return blocks.join("\n\n");
}

/**
 * A MANAGER'S ANSWER TO "WHAT IS THEIR POSITION / WHICH DATE / WHICH STORE" IS
 * NEVER THE EMPLOYEE'S NAME. A bare "barista", "most recent" or "Kearney" is the
 * whole message, and the typed-name reader takes a whole short message for a
 * name — so the answer would replace the employee. The turns that directly
 * answer one of those questions are left out of the EMPLOYEE reading only; the
 * location, title and date readers still see them.
 */
function withoutAnswersToQuestions(context: ManagerContext, history: ProposalTurn["history"], question: string): ManagerContext {
  const answered = answersToOpenQuestions([...history, { role: "user", content: question }]);
  if (answered.size === 0) return context;
  const messages = context.messages.filter((message) => !answered.has(message.content.trim()));
  if (messages.length === 0) return context;
  return {
    ...context,
    messages,
    ids: messages.map((message) => message.id).filter((id): id is string => typeof id === "string" && id.length > 0),
    text: messages.map((message) => message.content).join("\n\n"),
  };
}

/** The templates whose Job Title is a record fact — not the plans, whose role decides the plan. */
const POSITION_TEMPLATES: ReadonlySet<string> = new Set(["coaching", "follow-up-coaching", "dpoa", "policy-review"]);

/**
 * ============================================================================
 * WHAT THE DIRECTORY SAYS ABOUT THE EMPLOYEE, SAID OUT LOUD
 * ============================================================================
 *
 * Admin feedback, 16 Oct 2026: wrong stores, and "ask the position of the
 * employee". Two things the Woven directory knows were never reaching the
 * form, and one it knows was never checked against what the manager said:
 *
 *   POSITION   the manager's own title (typed, or the answer to the question)
 *              wins; otherwise the matched employee's Woven position goes on
 *              the form's Job Title and is READ BACK so a stale one is caught;
 *              with neither, it is asked once. Never inferred.
 *   STORE      where the manager named a store the directory does not show the
 *              employee at, the manager's word stands and the disagreement is
 *              said — never a silent assignment either way.
 *
 * Mutates only the proposal's `employeeRole` / `employeeRoleSource`, which are
 * the manager's statement or the directory's record, and returns the sentences.
 */
function directoryNotes(
  proposal: ChatFormProposal,
  directory: DirectoryCheck,
  match: TemplateSummary,
  input: ProposalTurn,
  context: ManagerContext,
): string[] {
  const notes: string[] = [];
  if (proposal.employeeName === null || proposal.subject === "team") return notes;
  const first = proposal.employeeName.split(/\s+/)[0]!;
  const conversation = [...input.history, { role: "user", content: input.question }];
  const today = input.today ?? businessToday();

  /*
   * THE FORM'S DATE, BY WHAT EACH DATE MEANS: a date given to the form, the
   * coaching a Coaching Form documents, or — with several incident dates — the
   * manager's answer to "which date?", asked once; until then the form carries
   * the day it is created, never whichever incident was typed first. See
   * `decideFormDate` in `incident-dates.ts`.
   */
  const decided = decideFormDate({ text: context.text, templateKey: match.key, history: input.history, conversation, today });
  if (decided.formDate !== undefined) proposal.formDate = decided.formDate;
  if (decided.candidates) proposal.formDateCandidates = decided.candidates;
  if (decided.question) notes.push(decided.question);

  if (POSITION_TEMPLATES.has(match.key)) {
    /*
     * WOVEN'S POSITION IS THE SOURCE OF TRUTH WHEN IT VERIFIED THE EMPLOYEE
     * (matched, active, a title on record, a recent sync — see
     * `employee-verification.ts`). The manager's own word is used only where
     * Woven could not verify, and is then said to be theirs. A difference is
     * said either way (`directory.note`), never silently resolved.
     */
    const wovenTitle =
      directory.verification?.status === "verified" ? (directory.verification.title?.trim() || null) : null;
    const stated = extractJobTitle(context.text) ?? positionAnsweredIn(conversation);
    if (wovenTitle) {
      proposal.employeeRole = wovenTitle;
      proposal.employeeRoleSource = "woven";
      if (!(stated && !samePosition(stated, wovenTitle))) {
        notes.push(`**Position:** ${wovenTitle}, from Woven — tell me if that has changed and I'll flag it for review.`);
      }
    } else if (stated) {
      proposal.employeeRole = stated;
      proposal.employeeRoleSource = "manager";
    } else if (!positionAlreadyAsked(input.history)) {
      proposal.employeeRole = null;
      notes.push(positionQuestion(proposal.employeeName));
    }
  }

  const named = proposal.locationResolution === "resolved" ? proposal.locationId : null;
  // A store the manager named that Woven does not show the employee at is said by `verifyEmployee`.
  if (named && directory.matched && directory.locationIds && directory.locationIds.length > 0) {
    // nothing further: settled above
  } else if (
    POSITION_TEMPLATES.has(match.key) &&
    (directory.locationIds?.length ?? 0) === 0 &&
    proposal.locationResolution !== "resolved" &&
    proposal.locationResolution !== "needs_selection" &&
    readLocationMentions(context.text).length === 0 &&
    !input.history.some((turn) => turn.role === "assistant" && turn.content.includes(STORE_QUESTION_TAG))
  ) {
    /*
     * NO VERIFIED STORE ANYWHERE — not the manager's words, not a mapped Woven
     * store (or the directory could not be read). Asked once; the form is
     * otherwise created without a location rather than with a guessed one.
     */
    notes.push(
      directory.matched
        ? `Woven doesn't show a store I can match for **${first}**, so I haven't put one on the form. Tell me ${STORE_QUESTION_TAG}, or leave Store blank on the form.`
        : `I couldn't verify a store for **${first}** from Woven, so I haven't put one on the form. Tell me ${STORE_QUESTION_TAG}, or leave Store blank on the form.`,
    );
  }
  return notes;
}

/**
 * ============================================================================
 * THE TYPED NAME AGAINST THE EMPLOYEE DIRECTORY
 * ============================================================================
 *
 * ONLY THE FORMS ABOUT SOMEBODY'S PERFORMANCE — the coaching documents, the
 * corrective forms and the two plans that can be created in chat. The exit
 * and employment-change forms keep their own name handling, which has rules
 * of its own about renaming and leaving employees.
 *
 * THE ROSTER IS ALREADY SCOPED (`loadScopedRoster`): only people at this
 * actor's own salons can be suggested, and an empty roster — no directory, a
 * read error, a district scope, preview mode — changes nothing at all.
 */
const NAME_CHECKED_TEMPLATES: ReadonlySet<string> = new Set([
  "coaching",
  "follow-up-coaching",
  "dpoa",
  "policy-review",
  "sdit-epp",
  "tsd-epp",
]);

interface DirectoryCheck {
  /** Replaces the conversation's own reading of the employee. */
  resolution?: EmployeeResolution;
  /** The employee's salons, in scope — for `proposeLocation`. */
  locationIds?: readonly string[];
  /** The employee's current Woven position, when the directory matched them and has one. */
  positionName?: string | null;
  /** Whether the directory identified the employee (exactly, or by the manager's confirmation). */
  matched?: boolean;
  /** Asked INSTEAD of the proposal text: the form is not offered yet. */
  question?: string;
  /** Said AFTER the proposal text. */
  note?: string;
  /** What Woven confirmed — or why it could not. Absent only where nothing was checked. */
  verification?: EmployeeVerification;
}

const storeLabel = (id: string) => {
  const store = locationById(id);
  return store ? describeStore(store) : id;
};

async function checkTypedEmployee(
  input: ProposalTurn,
  match: TemplateSummary,
  context: ManagerContext,
  storeIndex: StoreIndex,
  /** A name read from earlier in the conversation, when the window had none. */
  carried: EmployeeResolution | null = null,
): Promise<DirectoryCheck> {
  let typed = carried ?? resolveEmployee(context);
  /*
   * NOBODY SETTLED BY THE WORDS ALONE — nobody read, or two candidates where
   * one is not a person ("Tess Varga needs a written CA for missing …"). The
   * roster may name exactly one person in full; see `rosterNameNamedIn`.
   */
  const early = typed.kind === "resolved" ? null : await loadScopedRosterResult(input.actor.scope);
  if (typed.kind !== "resolved") {
    const roster = early?.status === "ok" ? early.roster : [];
    const turns = context.messages.map((message) => message.content);
    const named =
      rosterNameNamedIn(turns[turns.length - 1] ?? "", roster) ?? rosterNameNamedIn(turns.join("\n"), roster);
    const candidates = typed.kind === "ambiguous" ? typed.candidates : null;
    const fits =
      named !== null &&
      (candidates === null || candidates.some((candidate) => candidate.trim().toLowerCase() === named.toLowerCase()));
    if (!fits) return {};
    typed = { kind: "resolved", employeeName: named };
  }

  /*
   * THE EXIT AND EMPLOYMENT-CHANGE FORMS keep their own name handling (an
   * employee leaving is not an employee to rename), so for them Woven is
   * consulted only to VERIFY: an exact match fills the title and store, and
   * anything else changes nothing.
   */
  const asks = NAME_CHECKED_TEMPLATES.has(match.key);

  const loaded = early ?? (await loadScopedRosterResult(input.actor.scope));
  if (loaded.status !== "ok") {
    // Preview mode has no Woven scope to speak of; everywhere else, say what was not checked.
    if (!asks || (loaded.status === "not_checked" && loaded.reason === "no_scope")) return {};
    const out = unverifiedWithoutRecord(loaded.status === "unavailable" ? "unavailable" : "not_checked", typed.employeeName);
    return { verification: out.verification, note: out.note ?? undefined };
  }
  const roster = loaded.roster;
  if (roster.length === 0) {
    if (!asks) return {};
    const out = unverifiedWithoutRecord("unavailable", typed.employeeName);
    return { verification: out.verification, note: out.note ?? undefined };
  }

  // The store the manager named, firm readings only: it narrows between two people of one name.
  const namedStoreIds = namedStoreIdsFrom(
    context.text,
    context.messages.map((message) => message.content),
    storeIndex,
    storeQuestionOpen(input.history),
  );
  // On a demotion or transfer the title the manager stated is the one being left.
  const managerTitle = isChangeFormKey(match.key)
    ? (readEmploymentChange(
        turnsAboutThisForm(context, match.key, typed.employeeName).messages.map((message) => message.content),
        input.today ?? businessToday(),
      ).current.title ?? null)
    : extractJobTitle(context.text);

  const verified = (employee: RosterEmployee): DirectoryCheck => {
    const outcome = verifyEmployee({ employee, namedStoreIds, storeLabel, managerTitle });
    return {
      resolution: { kind: "resolved", employeeName: displayName(employee) },
      locationIds: employee.locationIds,
      positionName: employee.positionName ?? null,
      matched: true,
      verification: outcome.verification,
      ...(outcome.note ? { note: outcome.note } : {}),
    };
  };

  let result = matchEmployeeName(typed.employeeName, roster);

  if (result.kind === "confirm" && namedStoreIds.length > 0) {
    const atNamed = result.candidates.filter((candidate) =>
      candidate.employee.locationIds.some((id) => namedStoreIds.includes(id)),
    );
    if (atNamed.length > 0 && atNamed.length < result.candidates.length) {
      const only = atNamed.length === 1 ? atNamed[0]! : null;
      const sameName = only && only.name.trim().toLowerCase() === typed.employeeName.trim().toLowerCase();
      result = sameName ? { kind: "exact", employee: only.employee, name: only.name } : { kind: "confirm", candidates: atNamed };
    }
  }

  if (result.kind === "unchecked") return {};
  if (result.kind === "exact") return verified(result.employee);

  if (!asks) return {};

  const settled = settledNameQuestions([...input.history, { role: "user", content: input.question }]);
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  if (settled.kept.some((name) => same(name, typed.employeeName))) return {};

  if (result.kind === "none") {
    const out = unverifiedWithoutRecord("not_found", typed.employeeName);
    return {
      verification: out.verification,
      note: `I didn't find **${displayPersonName(typed.employeeName)}** in the employee list for your stores, so the form will use the name exactly as you typed it, with no job title from Woven. Check the spelling before you file it.`,
    };
  }

  /*
   * THE MANAGER ALREADY SAID WHICH. A name they accepted earlier in this
   * conversation is used only while it is still one of the candidates for
   * what they typed — re-checked here, because the history is the browser's.
   */
  const accepted = result.candidates.find((candidate) =>
    settled.accepted.some((name) => same(name, candidate.name)),
  );
  if (accepted && result.candidates.filter((candidate) => same(candidate.name, accepted.name)).length === 1) {
    return verified(accepted.employee);
  }

  const names = result.candidates.map((candidate) => candidate.name);
  const out = unverifiedWithoutRecord("ambiguous", typed.employeeName);

  // TWO PEOPLE, ONE NAME: asking "Sarah Smith or Sarah Smith?" is no question. Ask for the store.
  const duplicated = names.find((name, index) => names.findIndex((other) => same(other, name)) !== index);
  if (duplicated) {
    const stores = [...new Set(result.candidates.flatMap((candidate) => candidate.employee.locationIds))].map(storeLabel);
    const where = stores.length > 0 ? ` — ${stores.join(" or ")}` : "";
    return {
      resolution: { kind: "ambiguous", candidates: names },
      verification: out.verification,
      question: `More than one **${duplicated}** works at your stores${where}. Which store is the one you mean? Tell me like "${duplicated} at ${stores[0] ?? "Store 000"}".`,
    };
  }

  return {
    resolution: { kind: "ambiguous", candidates: names },
    verification: out.verification,
    question: nameConfirmationQuestion(typed.employeeName, names),
  };
}

function isChangeFormKey(key: string): boolean {
  return employmentChangeKind(key) !== null;
}

/* ----------------------------------------------------------- proactive -- */

export interface SuggestedForms {
  /** The sentence above the cards. */
  readonly lead: string;
  readonly selection: ChatFormSelection;
}

/**
 * ============================================================================
 * OFFERING THE FORM THE CONVERSATION IS ALREADY ABOUT
 * ============================================================================
 *
 * A manager who writes "Jessica is an SDIT at Lincoln South, great with
 * customers but late several times" has written a performance-plan brief.
 * Before this, they got a coaching answer and then had to find "Create a form
 * from this conversation", press it, and choose from a picker for a decision
 * their own sentence had already made.
 *
 * ============================================================================
 * IT OFFERS. IT DOES NOT DECIDE, AND IT DOES NOT CREATE.
 * ============================================================================
 *
 * What comes back is a `ChatFormSelection` — the SAME cards an ambiguous
 * request already produces. A card sends `formRequestPhrase(name)` through the
 * composer, so a suggested form and a typed form arrive at
 * `proposeFormForTurn` as one request, resolved against the published library
 * with the template's own permission applied. There is no second engine and no
 * card that skips a check.
 *
 * EVERY FILTER THE PICKER ALREADY HAS STILL APPLIES: published, active, and
 * permitted to this actor. A form this manager may not create is never named.
 *
 * RETURNS NULL FOR ANYTHING THIS TURN ALREADY ANSWERED. A turn that produced a
 * proposal or a picker of its own does not get a second set of cards under it;
 * `answerQuestion` only calls this on the plain grounded path.
 */
export function suggestFormsForTurn(input: ProposalTurn): SuggestedForms | null {
  const context = managerContext(input.history, {
    id: input.questionMessageId,
    content: input.question,
  });

  const employee = resolveEmployee(context);
  const opportunity = detectFormOpportunity({
    context,
    /*
     * AMBIGUOUS COUNTS AS KNOWN. Two names is two candidates for the PROPOSAL
     * to sort out; for deciding whether a form is worth offering, the manager
     * has plainly been talking about people.
     */
    employeeKnown: employee.kind !== "missing",
  });
  if (!opportunity) return null;

  const available = input.summaries
    .filter(isCreatable)
    .filter((summary) => permits(input.actor, summary))
    /*
     * THE SAME WITHHOLDING THE PICKER APPLIES, because this is the picker —
     * the cards are a `ChatFormSelection` like any other, and a rule about
     * what Bubbles may put in front of somebody cannot hold at one producer of
     * them and not the other.
     *
     * IT CHANGES NOTHING TODAY, and that is the point of putting it here
     * rather than leaving it to `suggestedTemplateKeys`: that function asks
     * for `coaching`, `dpoa` and the role's plan, none of which is withheld,
     * so every form this feature suggests it still suggests. What the filter
     * buys is that the day a withheld key is added there, it is dropped here
     * instead of reappearing in a card.
     */
    .filter((summary) => offeredInChooser(summary.key));
  if (available.length === 0) return null;

  const wanted = suggestedTemplateKeys({
    opportunity,
    /*
     * The plan the manager's own words name, through the same reader the
     * explicit path uses — so "make an EPP" and a suggested card resolve the
     * same role to the same template.
     */
    rolePlanKey: eppTemplateForRole(context.text),
    /*
     * Read turn by turn through the same detector the explicit path uses, so
     * "not a CA, coaching" and "what is corrective action?" do not count.
     */
    correctiveActionRequested: context.messages.some((message) => {
      const intent = detectTemplateIntent(message.content);
      return (
        (intent.kind === "explicit" && intent.templateKey === "dpoa") ||
        (intent.kind === "corrective_action" && intent.requestedCreation)
      );
    }),
  });

  /*
   * ORDERED BY THE SUGGESTION, NOT BY `display_order`. The whole point is that
   * the role-specific plan leads; falling back to the library's order would
   * put the Coaching Form in front of it again.
   */
  const offered = wanted
    .map((key) => available.find((summary) => summary.key === key))
    .filter((summary): summary is TemplateSummary => summary !== undefined);
  if (offered.length === 0) return null;

  return {
    lead: formOpportunityLead(),
    selection: {
      primary: choice(offered[0]!),
      additional: offered.slice(1).map(choice),
    },
  };
}

/* --------------------------------------------------------- continuation -- */

/**
 * ============================================================================
 * WHAT THIS TURN IS ASKING FOR, INCLUDING "IT ANSWERS THE LAST QUESTION"
 * ============================================================================
 *
 * A turn naming a form is read as it always was. A turn naming none is a form
 * request only when BOTH hold:
 *
 *   1. the previous assistant turn left a proposal open, and
 *   2. this turn reads as an ANSWER to what that proposal was missing —
 *      concretely, it yields an employee name.
 *
 * THE SECOND CONDITION IS WHY THIS DOES NOT SWALLOW THE CONVERSATION. Without
 * it, every turn after a proposal would be routed into the form flow, so
 * "what is the tardiness policy?" asked while a proposal was open would come
 * back as a form card instead of an answer. `extractEmployeeNames` is
 * deliberately conservative — it refuses a capitalised leading word — so an
 * instruction or a question yields nothing and falls through to retrieval.
 *
 * The hint itself confers nothing: `proposeFormForTurn` revalidates the key
 * against the published library and applies the template's own permission,
 * exactly as it does for a typed request.
 */
function intentForTurn(input: ProposalTurn): TemplateIntent {
  const spoken = detectTemplateIntent(input.question);
  const continued = input.continueTemplateKey?.trim();

  /*
   * AN OPEN PROPOSAL ANSWERS "WHICH FORM?" ALREADY.
   *
   * A manager who is mid-proposal and asks for "a form" — by typing it, or by
   * pressing "Create a form from this conversation" in the rail — means the one
   * on screen. Asking them to choose again would be the assistant forgetting
   * what it just offered, one turn later.
   *
   * This is NOT the forbidden default. Nothing is guessed: the template comes
   * from a proposal this conversation already produced, and the key is
   * revalidated against the published library and the actor's permission like
   * any other. With no open proposal, an ambiguous request stays ambiguous and
   * the manager is asked.
   */
  if (spoken.kind === "ambiguous") {
    if (continued) return { kind: "explicit", templateKey: continued };

    /*
     * ======================================================================
     * "EMPLOYEE PERFORMANCE PLAN" PLUS A ROLE THEY ALREADY GAVE US
     * ======================================================================
     *
     * "Jessica is an SDIT at Lincoln South. She's great with clients but she's
     * been late several times." — then "make an EPP from this conversation".
     * The family is named in this turn and the role was named in an earlier
     * one, and between them they name a document as precisely as typing "SDIT
     * EPP" would.
     *
     * STILL NOT A DEFAULT, and the test is the same one this whole module
     * applies: is anything being GUESSED? No — the role is the manager's own
     * word, it maps to exactly one published plan, and a conversation naming
     * no role or two roles resolves to nothing and falls through to the
     * picker. The key is revalidated against the published library and this
     * actor's permission like every other.
     *
     * READ THROUGH `managerContext`, so an assistant turn can never be what
     * names the role and the look-back is the same bounded window the proposal
     * itself uses.
     */
    if (spoken.family === "epp") {
      const context = managerContext(input.history, {
        id: input.questionMessageId,
        content: input.question,
      });
      const byRole = eppTemplateForRole(context.text);
      if (byRole) return { kind: "explicit", templateKey: byRole };
    }

    /*
     * AND SO DOES HAVING ALREADY SAID IT.
     *
     * A manager who typed "Coaching Form for Sarah Test, she was late today"
     * and then pressed the rail button has named the form once already.
     * Answering with the full library is the assistant forgetting a sentence
     * the manager can still see on screen, and it is the redundancy that made
     * the rail button feel broken.
     *
     * STILL NOT A DEFAULT. Nothing is guessed and nothing is inferred from the
     * assistant's own words: this reads THE MANAGER'S OWN TURNS, through the
     * same bounded window everything else uses, and takes the most recent form
     * they named. Where they never named one, the request stays ambiguous and
     * they are asked. The key is revalidated against the published library and
     * their permission like any other.
     */
    const named = namedInManagerTurns(input);
    if (named.kind === "explicit") return named;
    return spoken;
  }

  /*
   * "COACH AVERY" WHILE A COACHING INTAKE IS OPEN names the person for the
   * form already on screen; with none open it is the question advice-or-form.
   */
  if (spoken.kind === "clarify") {
    return continued === spoken.templateKey ? { kind: "explicit", templateKey: continued } : spoken;
  }

  /*
   * ==========================================================================
   * AN OPEN CORRECTIVE ACTION FORM IS ANSWERED BY ANY OF ITS OWN FACTS
   * ==========================================================================
   *
   * QA, 22 Oct 2026: with the card open, "prior coaching JBA Policy Manual
   * 1-1-26, verbal ca 9-1-26" mentions a corrective action, so it was read as a
   * question about the progression and answered from the knowledge base — and
   * the card never got the history; the manager had to ask for the form again.
   * Whatever the turn otherwise reads as, a statement of one of this form's
   * own facts — an earlier step and its date, "first time", the payroll
   * answer, the level, a policy, a date — continues the card, which re-reads
   * every fact from the manager's turns itself. A question, a request for
   * advice, a new request ("create a CA for …") and a request for another
   * form still go where they went.
   */
  if (
    continued &&
    (spoken.kind === "none" || (spoken.kind === "corrective_action" && !spoken.requestedCreation)) &&
    statesOpenCorrectiveActionFact(input, continued)
  ) {
    return { kind: "explicit", templateKey: continued };
  }

  if (spoken.kind !== "none") return spoken;

  /* "The form", in reply to "coaching guidance, or a Coaching Form?". */
  if (answersFormClarification(input.history, input.question)) {
    return { kind: "explicit", templateKey: CLARIFIED_TEMPLATE_KEY };
  }

  if (!continued) return { kind: "none" };

  /*
   * AN OPEN EXIT FORM IS ALSO ANSWERED BY ITS FACTS. Bubbles asks "what was
   * their last day worked?" and "how did they leave?" — and "her last day was
   * 9/15" or "she quit on the spot" names nobody, so the name test below would
   * send the answer to retrieval. The same deliberately narrow reader the
   * proposal uses decides: a turn that establishes a departure fact continues
   * the proposal; a question about the tardiness policy establishes none and
   * still goes to retrieval. The key is revalidated like any other.
   */
  const open = input.summaries.find((summary) => summary.key === continued);
  if (
    open &&
    isExitForm(open) &&
    // An answer, not a question: "how many no call no shows do we allow?"
    // mentions a departure fact and is still a question for retrieval.
    !/\?\s*$/.test(input.question) &&
    exitAnswers(input.question, input.today ?? businessToday())
  ) {
    return { kind: "explicit", templateKey: continued };
  }

  /*
   * AN OPEN CORRECTIVE ACTION FORM IS ALSO ANSWERED BY ITS PAYROLL QUESTION.
   * Bubbles asks "Is payroll deduct applicable?" and "no" names nobody, so the
   * name test below would send it to retrieval. Read against the question it
   * replies to — the last assistant turn — and never when it is a question.
   */
  if (open && isCorrectiveActionForm(open) && asksPayrollDeduct(open) && !/\?\s*$/.test(input.question)) {
    const lastAssistant = [...input.history].reverse().find((message) => message.role === "assistant");
    const replied = payrollDeductFromConversation([
      ...(lastAssistant ? [lastAssistant] : []),
      { role: "user", content: input.question },
    ]);
    if (replied) return { kind: "explicit", templateKey: continued };
    /*
     * A STATEMENT ABOUT THE DEDUCTION THAT IS NOT A CLEAR YES OR NO —
     * "actually we're not doing the $25 payroll deduction" — still belongs to
     * this form: it withdraws the answer the card shows, and the card must ask
     * again. Sent to retrieval, it left the card's earlier Yes standing (QA,
     * 22 Oct 2026).
     */
    if (payrollDeductUnclear(input.question)) return { kind: "explicit", templateKey: continued };
  }

  /*
   * AND BY ITS WARNING-LEVEL QUESTION. Bubbles asks "Is this new corrective
   * action a Verbal Warning or a Written Warning?" and "verbal" names nobody.
   * A reply that states this form's level continues the open proposal, which
   * re-reads the level itself; a question ("what's the difference?") does not.
   *
   * WHETHER OR NOT IT WAS JUST ASKED. "Make it a written warning", typed after
   * Ask Bubbles had moved on to the store or the policy, used to leave the open
   * form and go to retrieval, so the change never reached the card (ported
   * from the reference platform). A level said as history ("she had a verbal
   * warning on 9/1") is not this form's and does not count; advice still does
   * not continue it.
   */
  if (open && isCorrectiveActionForm(open) && !/\?\s*$/.test(input.question) && !ASKS_FOR_ADVICE.test(input.question)) {
    if (warningLevelFromConversation([{ role: "user", content: input.question }], input.today ?? businessToday())) {
      return { kind: "explicit", templateKey: continued };
    }
  }

  /*
   * AND BY ITS POLICY QUESTION. "Which policy applies?" is answered "standards
   * of conduct" or "attendance", which names nobody either — and "use
   * attendance instead" corrects the suggested one. Read only after an open
   * Corrective Action proposal said something about the policy, and never
   * when the reply is itself a question ("what does the attendance policy
   * say?" is retrieval).
   */
  if (open && isCorrectiveActionForm(open) && !/\?\s*$/.test(input.question)) {
    const lastAssistant = [...input.history].reverse().find((message) => message.role === "assistant");
    const raisedPolicy =
      typeof lastAssistant?.content === "string" &&
      (lastAssistant.content.includes(CA_POLICY_QUESTION) || lastAssistant.content.includes("**Policy:**"));
    if (raisedPolicy && namesCaPolicy(input.question)) return { kind: "explicit", templateKey: continued };

    /*
     * AND BY ITS ACCOUNT OF WHAT HAPPENED, in whatever words: "Pat got to the
     * store at 11:23 for a 9:30 shift" names nobody and no topic, and sending
     * it to retrieval would end the intake that just asked for it.
     */
    if (lastAssistant && answeredWhatHappened([lastAssistant, { role: "user", content: input.question }])) {
      return { kind: "explicit", templateKey: continued };
    }
  }

  /*
   * "YES" TO "DID YOU MEAN KAITLYN SMITH?" names nobody either. A bare yes or
   * no that answers that question continues the open proposal, which re-checks
   * the name against the directory itself. See `employee-match.ts`.
   */
  if (open && answersNameConfirmation(input.history, input.question)) {
    return { kind: "explicit", templateKey: continued };
  }

  // Does this turn read as part of the intake, or as a new subject?
  if (!continuesIntake(continued, input)) return { kind: "none" };

  return { kind: "explicit", templateKey: continued };
}

/** "first time", "no prior coaching", "nothing on file" — a stated absence of history. */
const NO_HISTORY =
  /\b(?:first\s+(?:time|offen[cs]e|occurrence|one)|no\s+(?:prior|previous|past|earlier)\b|no\s+(?:coaching|warnings?|write[- ]?ups?|corrective\s+actions?)\b|nothing\s+(?:on\s+file|prior|before))/i;

/** One of an open Corrective Action Form's own facts, stated (never asked). See `intentForTurn`. */
function statesOpenCorrectiveActionFact(input: ProposalTurn, continued: string): boolean {
  const open = input.summaries.find((summary) => summary.key === continued);
  if (!open || !isCorrectiveActionForm(open)) return false;
  const question = input.question.trim();
  if (/\?\s*$/.test(question) || ASKS_FOR_ADVICE.test(question) || endsIntake(question)) return false;
  const today = input.today ?? businessToday();
  return (
    statedPriorActions(question, today).length > 0 ||
    NO_HISTORY.test(question) ||
    statedPayrollDeduct(question) !== null ||
    warningLevelFromConversation([{ role: "user", content: question }], today) !== null ||
    namesCaPolicy(question) ||
    extractFormDate(question, today) !== null
  );
}

/**
 * ============================================================================
 * WHAT COUNTS AS THE NEXT TURN OF AN INTAKE
 * ============================================================================
 *
 * This used to be "the turn yields an employee name", and nothing else. VERIFIED
 * IN PRODUCTION QA, 30 September 2026: with a Coaching intake open,
 *
 *     "she missed the opening checklist today"
 *
 * names nobody, so it went to retrieval, came back as coaching advice, and the
 * intake was over — the manager had to start again and restate the form and
 * the employee. Each of employee, topic, date and facts is part of the same
 * intake and arrives in its own turn, so each continues it:
 *
 *   a name              "employee: avery testperson", "I already said Avery"
 *   what happened       "she missed the opening checklist" (`describesIncident`,
 *                       or a sentence about her, him or them)
 *   when                "today", "9/28"
 *   what it is about    "topic is store tours", "the reason is attendance"
 *   carrying on         "keep this as coaching", "same form", "go ahead"
 *   a change's details  the employment change forms' own reader
 *
 * WHAT STILL LEAVES IT, so the conversation is not swallowed: a question, a
 * request for advice ("how should I…", "coach me…", "tips"), and the manager
 * ending the intake ("never mind", "no form"). Those go to retrieval exactly
 * as before, and a later intake turn can still pick the form back up — see
 * `continuationFor`.
 */
const ASKS_FOR_ADVICE =
  /^(?:so\s+|and\s+|ok\s+|okay\s+)?(?:what|what's|whats|how|why|when|where|which|who)\b|\b(?:coach\s+(?:me|us)|how\s+(?:do|should|can|could|would)\s+(?:i|we)|what\s+should\s+(?:i|we)|tips?|advice|guidance)\b/i;

const TOPIC_STATEMENT =
  /\b(?:topic|subject|reason|issue|concern|details?|behaviou?r|observed|observation)\s*(?:is|was|are|were|:|-|=)/i;

const CARRIES_ON =
  /\b(?:keep\s+(?:this|it)\s+as|still\s+(?:a\s+)?coaching|same\s+form|this\s+form|continue|go\s+ahead|that'?s\s+(?:it|all|everything|right)|yes|yep|yeah|correct)\b/i;

const ALREADY_SAID = /\b(?:i|we)\s+(?:already|just)\s+(?:told|said|gave|mentioned|provided|wrote|typed|sent)\b|\balready\s+(?:told|gave)\s+(?:you|bubbles)\b/i;

const ABOUT_THE_EMPLOYEE = /^(?:and\s+|also\s+|then\s+)?(?:she|he|they)(?:['’](?:s|d|ve|re|ll))?\b/i;

/*
 * A DAY ON ITS OWN. QA, 22 Oct 2026: with a ready Coaching card open, "i
 * already told you" and then "today" ended the intake — `extractFormDate`
 * reads calendar dates ("10/20") and not the day words managers type, so the
 * turn went to retrieval and the card had to be asked for again. Only a reply
 * that is nothing but the day counts; a sentence that mentions today still
 * has to read as part of the intake on its own.
 */
const ONLY_A_DAY =
  /^(?:(?:it\s+)?(?:was|happened)\s+)?(?:on\s+)?(?:today|yesterday|this\s+morning|last\s+night|tonight|(?:last\s+)?(?:mon|tues|wednes|thurs|fri|satur|sun)day)[\s.!]*$/i;

function continuesIntake(continued: string, input: ProposalTurn): boolean {
  const question = input.question.trim();
  if (endsIntake(question) || ASKS_FOR_ADVICE.test(question)) return false;
  if (extractEmployeeNames(question).length > 0) return true;
  if (continuesStore(question, input.history, input.storeIndex)) return true;
  if (answersEmploymentChange(continued, input)) return true;
  /*
   * A STORE, A POSITION, OR "I ALREADY TOLD YOU" ARE ANSWERS TO THE INTAKE TOO.
   * Admin feedback, 16 Oct 2026: with a Corrective Action intake open, "I
   * already told you the employee name. She is at Dodge" named nobody, so the
   * turn left the intake for free-form chat, which told the manager to retype
   * their request — and the form was never built. Naming where she works,
   * answering the position question, or objecting to being asked again each
   * carry the open form forward; a question still does not.
   */
  if (!isQuestion(question) && readLocationMentions(question).length > 0) return true;
  if (answersPositionQuestion(input.history, question)) return true;
  if (answersDateQuestion(input.history, question, incidentDates(managerContext(input.history, { content: question }).text, input.today ?? businessToday()), input.today ?? businessToday())) return true;
  if (ALREADY_SAID.test(question)) return true;
  if (isQuestion(question)) return false;
  return (
    describesIncident(question) ||
    extractFormDate(question, input.today ?? businessToday()) !== null ||
    ONLY_A_DAY.test(question) ||
    TOPIC_STATEMENT.test(question) ||
    CARRIES_ON.test(question) ||
    ABOUT_THE_EMPLOYEE.test(question)
  );
}

/* ------------------------------------------------------ clarification -- */

/**
 * ============================================================================
 * "COACH AVERY": ADVICE, OR THE FORM? ASKED, NOT GUESSED
 * ============================================================================
 *
 * Production QA, 30 September 2026: "coach Avery Testperson", "I need to
 * coach Avery" and "Avery Testperson needs coaching" all came back as advice
 * ending "ask me to create a coaching form for Avery Testperson" — an exact
 * command the manager was expected to retype. The verb means the conversation
 * as often as the record, so neither is chosen for them: one short question,
 * and two chips that are each an ordinary turn through the ordinary path.
 */
function clarifyFormOrGuidance(input: ProposalTurn, match: TemplateSummary): AskResponse {
  const employee = resolveEmployee(
    managerContext(input.history, { id: input.questionMessageId, content: input.question }),
  );
  const who = employee.kind === "resolved" ? employee.employeeName : null;
  return {
    ...turn(`${FORM_OR_GUIDANCE_QUESTION} ${match.name}${who ? ` for **${who}**` : ""}?`),
    followUpSuggestions: who
      ? [`Start a ${match.name} for ${who}`, `Give me coaching guidance for ${who}`]
      : [`Start a ${match.name}`, "Give me coaching guidance"],
  };
}

/**
 * Whether a turn answers something on the open exit form: a date or how they
 * left (`exit-facts.ts`), or one of HR's Details lines (`exit-details.ts`) —
 * "she texted me", "returned her key", "not eligible for rehire".
 */
function exitAnswers(question: string, today: string): boolean {
  const facts = readExitFacts(question, today);
  return exitFactsSupplied(facts) || exitDetailsSupplied(readExitDetails(question, today, facts));
}

/**
 * The most recent form the MANAGER named, in their own turns.
 *
 * Read through `managerContext` rather than over raw history, so the look-back
 * is the same bounded window the proposal itself reads — and so an assistant
 * turn can never be the thing that names a form.
 */
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

/**
 * The manager's turns that belong to THIS form: everything after the last turn
 * that asked for a different form or named somebody other than this employee.
 * Earlier turns about the same person stay in ("Jane is a PT Team Member." then "she's
 * transferring to salon 18"); a demotion for somebody else earlier in the
 * conversation does not.
 */
function turnsAboutThisForm(
  context: ManagerContext,
  templateKey: string,
  employeeName: string | null,
  options: { readonly correctiveActionForm?: boolean } = {},
): ManagerContext & { excerpts: Record<string, string> } {
  const same = (name: string) => {
    if (!employeeName) return true;
    const a = name.toLowerCase().split(/\s+/);
    const b = employeeName.toLowerCase().split(/\s+/);
    /*
     * "Beta Test" is Transfer Beta Test: a bare "Transfer Beta Test." reads
     * "Transfer" as the verb, and `resolveEmployee` completes it to the full
     * name. Found in QA: this check did not, so the turn that named her in
     * full was dropped and the draft lost every fact in it.
     */
    const trimmedLead =
      a.length < b.length &&
      b.slice(b.length - a.length).join(" ") === a.join(" ") &&
      b.slice(0, b.length - a.length).every((word) => isFormVocabulary(word));
    return a.join(" ") === b.join(" ") || a[0] === b[0] || trimmedLead;
  };
  let start = 0;
  const last = context.messages.length - 1;
  /*
   * A CORRECTION OF THE PERSON KEEPS THE ACCOUNT. Owner's retest variants,
   * 9 Oct 2026: "jordan testperson needs a written warning for cash handling",
   * then "actually it's for avery testperson", gave Avery a card with no
   * warning level and no issue — the first turn named somebody else, so it
   * was cut. The manager corrected who the form is for, not what happened.
   * When the current turn corrects the person and the turns before it name
   * exactly one other person, those turns stay, read with the corrected name
   * (`excerpts`), so the draft never puts the wrong name on the record.
   */
  let formStart = 0;
  /* The latest request for this form, for this employee, inside the turns kept so far. */
  let requestAt = -1;
  /* Whether the turns kept so far start just after a turn about somebody else. */
  let afterAnotherPerson = false;
  const readings = context.messages.map((message, index) => {
    const intent = detectTemplateIntent(message.content);
    /*
     * "CREATE VERBAL CA FOR …" IS A REQUEST FOR THIS FORM. Production, 21 Oct
     * 2026: a request in the progression's shorthand reads as a corrective
     * action to be started, which the proposal answers with the Corrective
     * Action Form — and this test counted it as ANOTHER form, so the next turn
     * ("no payroll deduct") dropped it. The Issue line went, and the form was
     * drafted from "no payroll deduct" alone.
     */
    const thisForm =
      (intent.kind === "explicit" && intent.templateKey === templateKey) ||
      (options.correctiveActionForm === true && intent.kind === "corrective_action" && intent.requestedCreation);
    /*
     * A CORRECTIVE ACTION MENTIONED IN THE HISTORY IS NOT ANOTHER FORM. QA, 22
     * Oct 2026: "create a CA for <employee> for not attending the monthly
     * meeting …", "written", then "prior coaching JBA Policy Manual 1-1-26,
     * verbal ca 9-1-26" — the history answer reads as "corrective action",
     * which cut every turn before it, and the card that followed was built from
     * "no payroll deduct" alone: no issue, no date, no level. On a Corrective
     * Action Form, the progression's name is about this form's subject, never
     * a different form.
     */
    const otherForm =
      (intent.kind === "explicit" && intent.templateKey !== templateKey) ||
      (intent.kind === "corrective_action" && !thisForm && options.correctiveActionForm !== true);
    const names = extractEmployeeNames(message.content);
    // A turn that also names somebody else is about them too, and stays off this form.
    const otherPerson = names.length > 0 && !names.every(same);
    const forThisEmployee = thisForm && employeeName !== null && names.length > 0 && !otherPerson;
    if (index < last && (otherForm || otherPerson)) {
      start = index + 1;
      afterAnotherPerson = otherPerson;
    }
    if (index < last && otherForm) formStart = index + 1;
    if (requestAt < start) requestAt = -1;
    /*
     * THE ANSWERS GIVEN FOR SOMEBODY ELSE STAY THEIRS. Production, 21 Oct
     * 2026: a Corrective Action for one employee, then "no payroll deduct",
     * then "create a verbal corrective action form for <another employee> …"
     * — the new form was read back with "Is payroll deduct applicable? No",
     * the first employee's answer, because the short reply names nobody and
     * so was kept. The first request for this employee after turns about
     * another person starts this form's turns. A correction of the person
     * ("actually it's for …") is not a new request, and keeps the account.
     */
    if (
      forThisEmployee &&
      requestAt < 0 &&
      afterAnotherPerson &&
      start < index &&
      !correctsTheEmployee(message.content)
    ) {
      start = index;
      formStart = index;
    }
    /*
     * A NEW REQUEST IS A NEW FORM. Production, 21 Oct 2026: "create ca form for
     * <employee> for a register shortage …", asked in the chat that had just
     * proposed one for her attendance, was read back with "Policy: Attendance,
     * as you said" and "Verbal Warning, as you said" — the earlier request's
     * answers. A second Corrective Action request for the same employee that
     * says what happened starts over from itself; one that only repeats the
     * request ("create ca for <employee>") keeps the account already given.
     */
    if (
      options.correctiveActionForm === true &&
      forThisEmployee &&
      requestAt >= 0 &&
      (describesIncident(message.content) ||
        describesMoreThanTheRequest(message.content, { ignore: [employeeName ?? ""] }))
    ) {
      start = index;
      formStart = index;
    }
    if (forThisEmployee) requestAt = index;
    return { names, otherForm, otherPerson, thisForm };
  });
  /* The latest turn of this form that corrected the person TO this employee. */
  let correctionAt = -1;
  if (employeeName !== null) {
    for (let index = last; index >= formStart; index -= 1) {
      const message = context.messages[index]!;
      if (correctsTheEmployee(message.content) && readings[index]!.names.some(same)) {
        correctionAt = index;
        break;
      }
    }
  }
  const others = new Set<string>();
  for (let index = formStart; index < correctionAt; index += 1) {
    for (const name of readings[index]!.names.filter((name) => !same(name))) others.add(name.toLowerCase());
  }
  const anotherAfter = readings
    .slice(Math.max(correctionAt, 0) + 1, last)
    .some((reading) => reading.otherPerson || reading.otherForm);
  const excerpts: Record<string, string> = {};
  let source = context.messages;
  if (correctionAt > formStart && others.size === 1 && !anotherAfter && formStart < start) {
    const replaced = [...others][0]!;
    const pattern = new RegExp(`\\b${replaced.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`, "gi");
    source = context.messages.map((message, index) => {
      if (index < formStart || index >= correctionAt || !pattern.test(message.content)) return message;
      pattern.lastIndex = 0;
      const content = message.content.replace(pattern, employeeName!);
      if (message.id) excerpts[message.id] = content;
      return { ...message, content };
    });
    start = formStart;
  }
  /*
   * A QUESTION THAT NAMES NOBODY IS NOT PART OF THE ACCOUNT. "What does the
   * manual say about shirts?" asked before "jordan needs a written warning"
   * says nothing about Jordan, and a draft written from it puts the shirt
   * policy on a disciplinary record. The current turn always stays.
   *
   * A QUESTION THAT ASKS FOR THIS FORM STAYS. QA, 22 Oct 2026, round 3: "tess
   * varga blew off her woven training due 10/15/26", then "can you start a
   * verbal ca for that" — the request is phrased as a question and names
   * nobody, so the next turn ("first offense") dropped it and the card lost
   * the level it stated.
   */
  // The current turn is always the last one, so there is always at least it.
  const first = Math.min(start, last);
  const messages = source
    .slice(first)
    .filter(
      (message, index, kept) =>
        index === kept.length - 1 ||
        readings[first + index]!.thisForm ||
        !isQuestion(message.content) ||
        extractEmployeeNames(message.content).some(same),
    );
  return {
    ...context,
    messages,
    ids: messages.map((message) => message.id).filter((id): id is string => Boolean(id)),
    text: messages.map((message) => message.content).join("\n\n"),
    excerpts: Object.fromEntries(
      Object.entries(excerpts).filter(([id]) => messages.some((message) => message.id === id)),
    ),
  };
}

/**
 * ============================================================================
 * "CURRENT TITLE SD, NEW PAY $12, EFFECTIVE 10/5" ANSWERS THE OPEN FORM
 * ============================================================================
 *
 * The employment change forms ask for their details in one grouped question,
 * and the reply names no employee — it is the details. Read by the employee
 * rule alone it would be a new subject and go to retrieval, dropping the form
 * the manager is halfway through. So for these forms a turn that STATES a
 * detail of the change is an answer too.
 *
 * The same guard as the name rule: a question is never an answer, and a turn
 * the reader finds nothing in is a new subject.
 */
function answersEmploymentChange(templateKey: string, input: ProposalTurn): boolean {
  if (!employmentChangeKind(templateKey)) return false;
  if (isQuestion(input.question)) return false;
  return hasStatedFacts(readEmploymentChange([input.question], input.today ?? businessToday()));
}

const CHANGE_NOUN: Record<EmploymentChangeKind, string> = {
  demotion: "demotion",
  transfer: "transfer",
};

const CHANGE_INTAKE: Record<EmploymentChangeKind, { items: string[]; example: string }> = {
  demotion: {
    items: [
      "The employee's name",
      "Their current title, status (FT/PT) and pay rate",
      "The new title, status and pay rate — and the new store, if it changes",
      "The effective date, and whether it's voluntary or involuntary",
      "A short reason",
    ],
    example:
      "Jane Doe, Assistant General Manager FT at $18/hr → Team Member PT at $12/hr, effective 10/5, voluntary — she asked to step down.",
  },
  transfer: {
    items: [
      "The employee's name",
      "Their current title, status (FT/PT) and pay rate",
      "The new store — and the new title, status and pay if they change",
      "Whether it's voluntary or involuntary",
      "A short reason",
    ],
    example:
      "Jane Doe is a PT Team Member at $12/hr, transferring from store 12 to store 18, same title and pay, voluntary — she moved closer to home.",
  },
};

function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

/**
 * ============================================================================
 * THE PROSE BESIDE A DEMOTION OR TRANSFER PROPOSAL
 * ============================================================================
 *
 * Three situations, and each gets ONE message:
 *
 *   NOTHING SAID YET — the card was clicked or the form named bare. The
 *   details go in one numbered list with an example, because asking them one
 *   at a time is the questionnaire nobody wants.
 *
 *   NO EMPLOYEE — the one fact that blocks the form. Asked once, naming the
 *   candidates when there were two, and saying what was already understood so
 *   the manager can see nothing is being asked twice.
 *
 *   READY — says back what was read ("FT Salon Director → PT Tanning
 *   Consultant, effective October 5, 2026") and names what is still open in
 *   one sentence. The form is offered anyway: nothing here is blocking, every
 *   open item is a control on the form, and the answers can come in chat too.
 */
function employmentChangeContent(
  kind: EmploymentChangeKind,
  facts: EmploymentChangeFacts,
  proposal: ChatFormProposal,
  context: ManagerContext,
): string {
  const known = describeKnownFacts(facts);

  if ((proposal.employeeName === null && !hasStatedFacts(facts)) || asksToBeGuided(context.text)) {
    const intake = CHANGE_INTAKE[kind];
    return [
      `Let's fill out the **${proposal.templateName}**. Send me what you have in one message and I'll put each detail in the right place:`,
      "",
      ...intake.items.map((item, index) => `${index + 1}. ${item}`),
      "",
      `For example: *${intake.example}*`,
    ].join("\n");
  }

  if (proposal.status === "needs_employee") {
    const employee = resolveEmployee(context);
    const lead = known ? `I have the ${CHANGE_NOUN[kind]} details so far (${known}). ` : "";
    if (employee.kind === "ambiguous") {
      const names = employee.candidates.map((name) => `**${name}**`);
      return `${lead}Which of them is this **${proposal.templateName}** for — ${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}?`;
    }
    return `${lead}Who is this **${proposal.templateName}** for?`;
  }

  const lines = [
    `I have **${possessive(proposal.employeeName ?? "the employee")}** ${CHANGE_NOUN[kind]} started${known ? ` — ${known}` : ""}.`,
  ];

  if (proposal.status === "needs_location") {
    lines.push("", locationQuestion(proposal));
    return lines.join("\n");
  }

  const missing = missingDetails(kind, facts, {
    currentTitleKnown: proposal.employeeRole !== null,
  });
  lines.push(
    "",
    missing.length > 0
      ? `To finish it I still need ${joinList(missing.map((item) => item.phrase))}. Send them here in one message, or fill them in on the form — I won't guess at any of them.`
      : "That covers every detail the form asks for.",
  );

  lines.push("");
  lines.push(
    proposal.supportsInlineDraft
      ? proposal.locationResolution === "not_applicable"
        ? "Your account covers every store, so the form won't name one unless you did. Create the draft here when you're ready and edit it below — nothing is saved to anyone's file until you do."
        : "Create the draft here when you're ready, and edit it below — nothing is saved to anyone's file until you do."
      : "**Nothing has been created.** This is a proposal, not a form. To file one today, use Create a Form.",
  );
  return lines.join("\n");
}

/* -------------------------------------------------------------- wording -- */

function ambiguousContent(offered: TemplateSummary[]): string {
  if (offered.length === 0) {
    return "I can't tell which form you need, and there are no published forms available to you right now. An administrator publishes them under Form Templates.";
  }
  /*
   * THE FORMS ARE NO LONGER IN THE PROSE.
   *
   * This wrote every permitted template and its description into the message as
   * a bullet list — thirteen of them in a full library, which is a wall of text
   * where a question should be. They travel as `formSelection` now and render as
   * cards, one visible and the rest behind a disclosure.
   *
   * The first sentence is unchanged, and it is the one that matters: the reason
   * Bubbles is asking rather than choosing.
   */
  return "Which form do you need?";
}

/**
 * ============================================================================
 * THE CHOICES, FROM THE ONLY LIST THERE IS
 * ============================================================================
 *
 * `offered` has already been through all three filters — published-and-active,
 * this actor's permission for the TEMPLATE'S OWN `required_permission`, and the
 * chooser withholding in `lib/forms/chooser.ts` — so this function narrows
 * nothing further and widens nothing at all. It orders and splits, and the
 * order is the library's `display_order`.
 *
 * WHY THE COACHING FORM IS FIRST. It is the form most conversations end in, and
 * putting it in front of a manager saves the click that nine requests in ten
 * would make. It is FIRST, not CHOSEN: `primary` renders as a card that has to
 * be clicked, and until it is, no template is decided. Where it is not
 * available — a role without `create_coaching_form`, or a deployment that has
 * not published it — the first form this person CAN create leads instead. A
 * form they cannot create is never named, not even collapsed.
 */
function formSelection(offered: TemplateSummary[]): ChatFormSelection | undefined {
  if (offered.length === 0) return undefined;

  const primary =
    offered.find((summary) => summary.key === PRIMARY_TEMPLATE_KEY) ?? offered[0]!;

  return {
    primary: choice(primary),
    additional: offered
      .filter((summary) => summary.key !== primary.key)
      .map(choice),
  };
}

function choice(summary: TemplateSummary): ChatFormChoice {
  return {
    templateKey: summary.key,
    templateName: summary.name,
    description: summary.description,
  };
}

/**
 * The prose beside the proposal card.
 *
 * NO DRAFTED CONTENT, and no invitation to a control that does not exist. It
 * states which form, what is established, what is missing, and that nothing has
 * been created — because at this phase nothing has.
 */
/**
 * The policy a Corrective Action request named by a name `ca-policy.ts` does
 * not know, looked up among the pinned manual's own headings — or null when it
 * named none. Never throws: a manual that cannot be read leaves the lookup to
 * the draft, as before.
 */
async function namedPolicyFor(text: string, input: ProposalTurn): Promise<NamedPolicyReading | null> {
  if (readCaPolicy(text).stated !== null) return null;
  const named = namedPolicies(text);
  const chunksOf = async (): Promise<readonly ManualChunk[] | null> => {
    try {
      return (await input.policyManual?.()) ?? null;
    } catch {
      return null;
    }
  };
  /*
   * NO POLICY NAMED: the section the account describes, if exactly one
   * heading of the manual answers it — "talking on her cell phone" is the
   * Cell Phone/Smart Watch Policy (District Manager feedback, 21 Oct 2026).
   * Said only where found; otherwise nothing, as before.
   */
  if (named.length === 0) {
    const described = describedManualSection({ text, chunks: await chunksOf() });
    return described
      ? {
          phrase: described.phrase,
          lookup: "described",
          heading: described.section.heading,
          page: described.section.page,
          offenseKey: described.offenseKey,
        }
      : null;
  }
  const phrase = named[named.length - 1]!.phrase;
  const chunks = await chunksOf();
  if (!chunks || chunks.length === 0) return { phrase, lookup: "unknown" };
  const found = namedManualSection({ text, chunks });
  return found
    ? { phrase: found.phrase, lookup: "found", heading: found.section.heading, page: found.section.page, offenseKey: found.offenseKey }
    : { phrase, lookup: "missing" };
}

function proposalContent(
  proposal: ChatFormProposal,
  context: ManagerContext,
  match: TemplateSummary,
  today: string,
  extra: { namedPolicy?: NamedPolicyReading | null; priorOnFile?: PriorFormsReading } = {},
): string {
  /*
   * ==========================================================================
   * THE RESIGNATION/EXIT FORM — WHAT WAS FILLED, WHAT WAS LEFT, WHAT IS ASKED
   * ==========================================================================
   *
   * The same three openings the other intakes have, read with the exit form's
   * own reader. The facts are the ones the drafting route will derive from the
   * same manager turns, so the list a manager reads here is the list the form
   * comes back with. See `lib/forms/exit-intake.ts`.
   */
  if (isExitForm(match)) {
    const facts = readExitFacts(context.text, today);
    const details = readExitDetails(context.text, today, facts);
    if (proposal.status === "needs_employee") {
      if (
        asksToBeGuided(context.text) ||
        exitNothingSupplied({
          facts,
          details,
          employeeKnown: false,
          jobTitleKnown: proposal.employeeRole !== null,
        })
      ) {
        return exitIntakeRequest(proposal.templateName);
      }
      const employee = resolveEmployee(context);
      return exitEmployeeQuestion(
        proposal.templateName,
        employee.kind === "ambiguous" ? employee.candidates : [],
      );
    }
    const ready = exitReady({ proposal, facts, details });
    return proposal.status === "needs_location"
      ? `${locationQuestion(proposal)}\n\n${ready}`
      : ready;
  }

  /*
   * ==========================================================================
   * WHICH OPENING A MANAGER GETS DEPENDS ON WHETHER THEY HAVE SAID ANYTHING
   * ==========================================================================
   *
   * There are two ways to arrive here and they want opposite answers.
   *
   * THEY DESCRIBED SOMETHING. "Create a corrective action for Sarah. She wore
   * a mini skirt today." has already given who, what and when, and answering
   * that with a numbered list of seven is slower than the paperwork this
   * feature replaced. It also asks for things the FORM collects better than a
   * chat does: the warning level is a pair of tick boxes, the prior action is a
   * field, the job title is not on the document at all. So: draft it, name what
   * is still open, ask for none of it.
   *
   * THEY CLICKED THE CARD. The picker sends `formRequestPhrase(name)` — "Create
   * a Corrective Action Form from this conversation." — and that is a manager
   * who has said nothing at all. Drafting from nothing is not possible and
   * asking one question at a time is the interrogation nobody wants, so this is
   * where the intake belongs: the seven details, in the order the business
   * already asks them, and then the form.
   *
   * `nothingSupplied` IS THE TEST, and it is deliberately about what the
   * MANAGER SAID rather than about what is known: the salon comes from the
   * authenticated account, so counting it would mean the intake never appeared
   * for the people who actually use this product.
   */
  /*
   * ==========================================================================
   * THE EPP INTAKE — THE SAME TWO OPENINGS, FOR A DIFFERENT DOCUMENT
   * ==========================================================================
   *
   * Identical shape to the corrective-action branch below, because the two
   * situations are identical: a manager who has DESCRIBED something wants it
   * drafted, and a manager who has clicked the card has said nothing and needs
   * the questions. What differs is which questions, and that lives in
   * `epp-intake.ts`.
   *
   * WHAT IS NOT ASKED FOR IS THE POINT. The reading runs over the manager's own
   * turns, so "Jessica is an SDIT at Lincoln South, great with clients, late
   * several times this month" arrives having answered five of the eleven — and
   * only the rest are chased.
   */
  if (isPerformancePlan(match)) {
    /*
     * WHICH PLAN'S QUESTIONS, off the key the library already resolved. The
     * TSD Management Performance Plan asks eight and names five metrics; the
     * SDIT plan asks eleven and names three. Neither list is chosen here —
     * this passes the template's own key and `epp-intake.ts` answers.
     */
    const plan = eppIntakePlan(match.key);
    const intake = readEppIntake({
      text: context.text,
      employeeKnown: proposal.employeeName !== null,
      salonSettled:
        proposal.locationResolution === "resolved" ||
        proposal.locationResolution === "not_applicable",
      plan,
    });

    if (intake.nothingSupplied || asksToBeGuided(context.text)) {
      return eppIntakeRequest({
        formName: proposal.templateName,
        /*
         * ONLY WHAT IS STILL OPEN. The salon the account settles, and anything
         * the manager's words already answer, are not asked again.
         */
        items: intake.missing,
        opening: true,
        today: todayInWords(),
        plan,
      });
    }

    if (proposal.status === "needs_employee") {
      return eppEmployeeQuestion(proposal.templateName, context);
    }

    if (proposal.status !== "needs_location") {
      return eppReady(proposal, intake, plan);
    }
  }

  if (isCorrectiveActionForm(match)) {
    proposal.issue = correctiveActionIssue(context.text, proposal.employeeName);
    const intake = readCorrectiveActionIntake({
      text: context.text,
      employeeKnown: proposal.employeeName !== null,
      salonSettled:
        proposal.locationResolution === "resolved" ||
        proposal.locationResolution === "not_applicable",
      payrollDeduct: proposal.payrollDeduct ?? null,
      asksPayrollDeduct: asksPayrollDeduct(match),
      warningLevel: proposal.warningLevel ?? null,
      today,
    });

    /*
     * THE SEVEN. A manager who has told us nothing beyond naming the form, and
     * a manager who explicitly asked to be walked through it, get the same
     * opening — there is nothing to draft from in the first case and nothing
     * they want drafted in the second.
     */
    if (intake.nothingSupplied || asksToBeGuided(context.text)) {
      return correctiveActionIntakeRequest({
        formName: proposal.templateName,
        /*
         * ONLY WHAT IS STILL OPEN, in the business's order and wording. The
         * salon is not asked for when the account or a salon the manager named
         * inside their assignment already settles it — see `proposeLocation`.
         */
        items: intake.missing,
        opening: true,
        today: todayInWords(),
      });
    }

    /*
     * THE ONE GENUINELY BLOCKING FACT. Everything else on this form can be
     * left unresolved for the manager to set; the employee cannot, because
     * the wrong name on somebody's file is the failure nothing downstream can
     * undo. `resolveEmployee` is re-read rather than carried on the proposal
     * so the CANDIDATES survive: where the manager named two people, naming
     * them back is one short question, and "tell me their name" to somebody
     * who just gave two names is the assistant not listening.
     */
    if (proposal.status === "needs_employee") {
      return correctiveActionEmployeeQuestion(proposal.templateName, context);
    }

    /*
     * OTHERWISE, DRAFT IT. What is still unknown is NAMED, never asked for:
     * the manager should see that the warning level is theirs to tick without
     * being stopped for it.
     */
    if (proposal.status !== "needs_location") {
      return correctiveActionReady(proposal, intake, asksPayrollDeduct(match), readCaPolicy(context.text), {
        offersLevel: offeredWarningLevels(match).length > 0,
        earlierWarning: mentionsEarlierWarning(context.text, today),
        priorActions: statedPriorActions(context.text, today),
        namedPolicy: extra.namedPolicy ?? null,
        priorOnFile: extra.priorOnFile ?? NO_PRIOR_FORMS,
      });
    }
  }

  /*
   * SHORT AND OPERATIONAL. The card below is the artifact; a long prose preamble
   * above it competes with the thing the manager is meant to read, and the
   * version that wrote out a whole pseudo-form is what this phase removed.
   */
  const lines: string[] = [`Here is what I would put on a **${proposal.templateName}**.`, ""];

  if (proposal.status === "needs_employee") {
    lines.push(openingQuestions(proposal, context));
  } else if (proposal.status === "needs_location") {
    lines.push(locationQuestion(proposal));
    if (proposal.awaitingIncident) lines.push("", NO_INCIDENT_NOTE);
    // No store yet, so nothing on file is verified: say what is there and the rule (QA F-11).
    const possibleNote = isCorrectiveActionForm(match)
      ? possibleOnFileNote(proposal, extra.priorOnFile ?? NO_PRIOR_FORMS, statedPriorActions(context.text, today))
      : null;
    if (possibleNote) lines.push("", possibleNote);
  } else {
    lines.push(
      `Everything I need is here, drawn from ${context.messages.length === 1 ? "your message" : "your messages"} above.`,
    );
  }

  /*
   * ==========================================================================
   * THE ESCAPE COPY IS GONE FOR THE PATH THAT NO LONGER NEEDS IT
   * ==========================================================================
   *
   * Phase 2 ended every proposal with "To file a form today, use Create a
   * Form." That was honest then, because nothing in chat could create one.
   *
   * It is the opposite of the requirement now. Marissa's whole ask is that the
   * manager never leaves the conversation: sending them to the standalone
   * builder from the one card that can create the form inline would be the
   * feature arguing against itself.
   *
   * IT STAYS EVERYWHERE ELSE, because everywhere else it is still true. A
   * proposal that is missing the employee, cannot verify a salon, or names a
   * template the inline editor does not support yet has no create action — and
   * a manager who needs that form today still needs somewhere to go.
   */
  if (proposal.status !== "needs_employee") {
    lines.push("");
    if (proposal.supportsInlineDraft) {
      /*
       * ACCURATE ABOUT THE SALON, because for a global actor there is not one and
       * saying "I have the salon" would be a small lie on the one card a manager
       * checks before filing an HR record.
       */
      /*
       * A TEAM-WIDE FORM HAS NO EMPLOYEE, and saying "I have the employee"
       * on it would be the card misdescribing itself.
       */
      const who = proposal.subject === "team" ? "This one is for the whole team" : "I have the employee";
      lines.push(
        proposal.locationResolution === "not_applicable"
          ? `${who}. Your account covers every store, so this form won't name one. Create the draft here when you're ready and edit it below — nothing is saved to anyone's file until you do.`
          : `${who}${proposal.subject === "team" ? ", and I have the store" : " and the store"}${resolvedStoreName(proposal) ? ` (**${resolvedStoreName(proposal)}**)` : ""}. Create the draft here when you're ready, and edit it below — nothing is saved to anyone's file until you do.`,
      );
    } else if (
      proposal.status === "needs_location" &&
      proposal.locationResolution === "needs_selection" &&
      supportsInlineDraft(match.key, match.currentVersion?.variants ?? [])
    ) {
      /*
       * ONLY THE STORE IS MISSING, AND THE FORM CAN BE CREATED HERE ONCE IT IS
       * SET. "I can't create this one in chat yet" used to be printed here too,
       * beside the store picker that does exactly that — and a manager covering
       * several stores reads it as Ask Bubbles no longer knowing the form.
       */
      lines.push(
        proposal.authorizedLocationIds.length > 0
          ? "**Nothing has been created yet.** Choose the store below, or tell me which one, and you can create the draft here."
          : "**Nothing has been created yet.** Tell me which store, and you can create the draft here.",
      );
    } else {
      /*
       * THE SENTENCE THAT SAYS NO HR RECORD EXISTS YET.
       *
       * This branch briefly carried a second copy of the needs_employee
       * question. The effect on a Disciplinary Plan of Action — a template
       * refused inline because it has variants — was that the card said
       * "Everything I need is here", then immediately asked for the five
       * details it had just established, and never once said that nothing had
       * been filed. Both halves were wrong, and the missing half was the one
       * that matters: a manager reading a confident DPOA summary with no
       * disclaimer can reasonably conclude the form now exists on somebody's
       * record. It does not, and this is the only sentence that says so.
       */
      lines.push(
        "**Nothing has been created.** This is a proposal, not a form — I can't create this one in chat yet.",
      );
    }
  }

  return lines.join("\n");
}

/**
 * Today, as a manager reads a date.
 *
 * ONE FORMATTER FOR BOTH INTAKES, because the two numbered lists sit one
 * template apart and a manager who sees them on consecutive turns should not be
 * shown the same day written two ways.
 */
function todayInWords(): string {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * The one question worth stopping for, and it is one question.
 *
 * NAMES THE CANDIDATES WHERE THERE ARE SOME. A manager who wrote two names has
 * given the assistant everything except which of them; answering "tell me
 * their name" is the assistant not having read the sentence. Where they named
 * nobody, it asks once and says nothing else.
 *
 * There is no employee directory in this product — `resolveEmployee` reads the
 * manager's OWN turns — so "three employees called Sarah" cannot arise here.
 * What can, and does, is two people named in one message.
 */
function correctiveActionEmployeeQuestion(
  templateName: string,
  context: ManagerContext,
): string {
  const employee = resolveEmployee(context);

  if (employee.kind === "ambiguous") {
    const names = employee.candidates.map((name) => `**${name}**`);
    return `Which of them is this **${templateName}** for — ${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}? Tell me and I'll draft it from what you've already described.`;
  }

  return `Who is this **${templateName}** for? Give me their name and I'll draft it from what you've told me — you can set the warning level and anything else on the form itself.`;
}

const NO_PRIOR_FORMS: PriorFormsReading = { attach: [], possible: [], identity: "none" };

/** Why a same-name form on file is only a possible match (`classifyPriorForms`). */
const POSSIBLE_REASON: Partial<Record<PriorFormsReading["identity"], string>> = {
  other_locations: "The same name is on file at more than one store, so I can't confirm these are this employee's",
  no_form_location: "This form has no store yet, and they're added only when they're at the form's own store",
  single_word_name: "Only a first name was given, so I can't confirm these are this employee's",
  incomplete: "The record is too long to read in full, so I can't confirm these are this employee's",
};

/**
 * Same-name forms on file whose identity is not established (QA F-11): shown,
 * each with its store from this app's own roster, and never added. The draft
 * route classifies with the same store, so nothing listed here is written.
 */
function possibleOnFileNote(
  proposal: ChatFormProposal,
  reading: PriorFormsReading,
  priorActions: readonly string[],
): string | null {
  const possible = reading.possible.filter(
    (form) => !priorActions.some((line) => line.includes(signedDate(form.formDate))),
  );
  if (possible.length === 0) return null;
  const where = (form: PriorFormOnFile) => form.locationName ?? locationById(form.locationId)?.name ?? "no store";
  const one = possible.length === 1;
  return `**Possibly on file — not added:** ${possible.map((form) => `${form.line} (${where(form)})`).join("; ")}. ${POSSIBLE_REASON[reading.identity] ?? "I can't confirm these are this employee's"}, so I won't put ${one ? "it" : "them"} on the form. If ${one ? "it is" : "any are"} ${proposal.employeeName}'s, add ${one ? "it" : "them"} under prior coaching and corrective action yourself.`;
}

/**
 * The prose beside a Corrective Action Form that is ready to be created.
 *
 * NOTHING HOLDS THE CARD UP. What is still unknown is either named for the
 * manager to set on the form (the prior history) or asked as a question they
 * can answer here or on the form (the warning level, payroll deduct) — and
 * none of it is answered for them.
 *
 * THE WARNING LEVEL IS ASKED, NOT NAMED. Production, 9 Oct 2026: a manager who
 * mentioned an earlier verbal warning got a form ticked Written. The fix that
 * holds is in code — the level is never the model's, see `warning-level.ts`
 * — and this is the half the manager sees: when they have not said which this
 * is, they are asked, in so many words, and an earlier warning they mentioned
 * is acknowledged as history rather than silently weighed.
 *
 * The job title is never mentioned, because the document has no field for it.
 */
function correctiveActionReady(
  proposal: ChatFormProposal,
  intake: IntakeReading,
  asksPayroll: boolean,
  policy: CaPolicyReading,
  warning: {
    offersLevel: boolean;
    earlierWarning: boolean;
    priorActions?: readonly string[];
    namedPolicy?: NamedPolicyReading | null;
    priorOnFile?: PriorFormsReading;
  } = {
    offersLevel: true,
    earlierWarning: false,
  },
): string {
  const levelOpen = warning.offersLevel && intake.missingRequired.some((item) => item.key === "warning_level");
  const priorActions = warning.priorActions ?? [];
  // A step the manager already dated is theirs; the record adds only the rest.
  const onFile = (warning.priorOnFile ?? NO_PRIOR_FORMS).attach.filter(
    (form) => !priorActions.some((line) => line.includes(signedDate(form.formDate))),
  );
  const outstanding = intake.missingRequired
    .filter((item) => item.key === "previous_action" && priorActions.length === 0 && onFile.length === 0)
    .map(() => "any prior coaching or corrective action");

  const lines = proposal.awaitingIncident
    ? [`I can create a **${proposal.templateName}** for **${proposal.employeeName}**.`, "", NO_INCIDENT_NOTE]
    : [
        `I'll draft a **${proposal.templateName}** for **${proposal.employeeName}** from what you've described, and check the applicable company policy before anything policy-related goes on it.`,
      ];

  /*
   * WHAT THE MANAGER SAID, READ BACK before anything is created: the issue and
   * the warning level. Signed-in QA, 8 Oct 2026, found both lost — the issue
   * became the employee's name and the stated level was left unticked.
   */
  const stated: string[] = [];
  if (proposal.issue) stated.push(`**Issue:** ${proposal.issue}`);
  if (warning.offersLevel && proposal.warningLevel) {
    stated.push(`**Type of warning:** ${warningLevelLabel(proposal.warningLevel as WarningLevel)}, as you said — tell me if that should change`);
  }
  const store = resolvedStoreName(proposal);
  if (store) {
    stated.push(
      proposal.locationSource === "woven"
        ? `**Store:** ${store}, from Woven (where ${proposal.employeeName} is assigned) — tell me if that should change`
        : proposal.locationSource === "assignment"
          ? `**Store:** ${store}, your assigned store — tell me if that should change`
          : `**Store:** ${store}, as you said — tell me if that should change`,
    );
  }
  if (stated.length > 0) lines.push("", stated.join(" · "));
  /*
   * THE HISTORY THE MANAGER GAVE, READ BACK as it will be listed on the form —
   * "previous coaching was jba policy manual 1-1-26" is the prior-actions
   * line, not something to set later (District Manager feedback, 21 Oct 2026).
   */
  if (priorActions.length > 0) {
    lines.push("", `**Prior actions:** ${priorActions.join("; ")}, as you said. I'll list ${priorActions.length === 1 ? "it" : "them"} on the form — tell me if that should change.`);
  }
  /*
   * THE HISTORY ALREADY ON FILE, READ BACK BEFORE IT GOES ON THE FORM. Ported
   * from the reference platform (District Manager feedback, 21 Oct 2026): the employee's
   * earlier Coaching Form and Verbal CA were on file, and the manager had to
   * type them again. They are listed by the draft (`prior-forms.ts`); naming
   * them here is the manager's chance to say one should not count.
   */
  if (onFile.length > 0) {
    lines.push(
      "",
      `**On file in the Forms Register for ${proposal.employeeName}:** ${onFile.map((form) => form.line).join("; ")}. I'll list ${onFile.length === 1 ? "it" : "them"} under prior coaching and corrective action on the form — remove any that shouldn't count.`,
    );
  }
  const possibleNote = possibleOnFileNote(proposal, warning.priorOnFile ?? NO_PRIOR_FORMS, priorActions);
  if (possibleNote) lines.push("", possibleNote);

  /*
   * THE POLICY, SUGGESTED OR ASKED — never left silently to the drafting
   * model's offense box. A missed deadline, unfinished assigned work, Woven
   * items not completed or a direction not followed reads as the Standards of
   * Conduct, and is named here for the manager to change; the draft applies
   * it only where the current manual's section supports it. An account that
   * also reads as attendance or a target is a question. See `ca-policy.ts`.
   */
  const policyLine = caPolicyProposalLine(policy, warning.namedPolicy ?? null);
  if (policyLine) lines.push("", policyLine);

  /*
   * THE LEVEL, ASKED WHEN IT WAS NOT STATED (a stated one is read back above).
   * An earlier warning the manager mentioned is said to be history, so nobody
   * reads its presence as the reason for whichever box ends up ticked.
   */
  if (!proposal.warningLevel && levelOpen) {
    lines.push(
      "",
      warning.earlierWarning
        ? `I've treated the earlier warning you mentioned as previous corrective action history — it doesn't decide this one. ${WARNING_LEVEL_QUESTION} Tell me here, or tick it on the form — I won't choose it for you.`
        : `${WARNING_LEVEL_QUESTION} Tell me here, or tick it on the form — I won't choose it for you.`,
    );
  }

  if (outstanding.length > 0) {
    lines.push(
      "",
      `You'll set ${outstanding.join(" and ")} on the form — I won't guess at ${outstanding.length === 1 ? "it" : "them"}.`,
    );
  }

  /*
   * ==========================================================================
   * "IS PAYROLL DEDUCT APPLICABLE?" IS ASKED, NOT NAMED
   * ==========================================================================
   *
   * Unlike the warning level, this one is put to the manager as a question,
   * because Operations asked for it to be collected with the form's details.
   * It still holds nothing up — the card can be created and the boxes ticked
   * on the form — and it is never answered for them. Once answered it is
   * read back, so a wrong answer is caught here rather than on the PDF.
   */
  // A published version that predates the question has nothing to ask or read back.
  if (asksPayroll && (proposal.payrollDeduct === "yes" || proposal.payrollDeduct === "no")) {
    lines.push(
      "",
      `${PAYROLL_DEDUCT_LABEL} **${proposal.payrollDeduct === "yes" ? "Yes" : "No"}** — tell me if that should change.`,
    );
  } else if (asksPayroll) {
    lines.push(
      "",
      `One more question: **${PAYROLL_DEDUCT_LABEL}** Yes or No? Tell me here, or tick it on the form — I won't answer it for you.`,
    );
  }

  lines.push("");
  lines.push(
    proposal.supportsInlineDraft
      ? proposal.locationResolution === "not_applicable"
        ? "Your account covers every store, so this form won't name one. Create the draft here when you're ready and edit it below — nothing is saved to anyone's file until you do."
        : "Create the draft here when you're ready, and edit it below — nothing is saved to anyone's file until you do."
      : "**Nothing has been created.** This is a proposal, not a form — I can't create this one in chat yet.",
  );

  return lines.join("\n");
}

/**
 * Who the plan is for — one question, and it names the candidates if there are
 * some. Same rule as the corrective-action question above: a manager who wrote
 * two names has told us everything except which of them.
 */
function eppEmployeeQuestion(templateName: string, context: ManagerContext): string {
  const employee = resolveEmployee(context);

  if (employee.kind === "ambiguous") {
    const names = employee.candidates.map((name) => `**${name}**`);
    return `Which of them is this **${templateName}** for — ${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}? Tell me and I'll draft it from what you've already described.`;
  }

  return `Who is this **${templateName}** for? Give me their name and I'll draft it from what you've told me.`;
}

/**
 * The prose beside a performance plan that is ready to be created.
 *
 * IT NAMES WHAT IS STILL OPEN AND ASKS FOR NONE OF IT — the same rule the
 * corrective-action card follows, and it matters more here. The productivity
 * figures and the seven expectation marks are things a manager may not have to
 * hand, and stopping the EPP for them is exactly the friction this workflow
 * exists to remove: they are controls ON THE FORM, blank until somebody fills
 * them, and the review conversation is when that happens.
 */
function eppReady(
  proposal: ChatFormProposal,
  intake: EppIntakeReading,
  plan: EppIntakePlan,
): string {
  const outstanding = intake.missing
    .filter((item) =>
      ["employee_productivity", "salon_productivity", "expectations_success", "expectations_improvement"].includes(
        item.key,
      ),
    )
    .map((item) =>
      item.key === "employee_productivity"
        ? /*
           * WHOSE NUMBERS. "The employee's" on the SDIT plan and "the
           * manager's" on the TSD one, because the TSD plan's own pages call
           * its subject the manager and a card that called them the employee
           * would be the role drift this work was told to keep out.
           */
          `the ${plan.subject}'s productivity numbers`
        : item.key === "salon_productivity"
          ? "the store's productivity numbers"
          : "the seven expectation marks",
    );
  const named = [...new Set(outstanding)];

  const lines = [
    `I'll draft a **${proposal.templateName}** for **${proposal.employeeName}** from what you've described, and check the applicable JB & Associates policy before anything policy-related goes on it.`,
  ];

  if (named.length > 0) {
    lines.push(
      "",
      `You'll set ${named.join(" and ")} on the form — I won't guess at ${named.length === 1 ? "it" : "them"}, and they don't hold the plan up.`,
    );
  }

  lines.push("");
  lines.push(
    proposal.supportsInlineDraft
      ? proposal.locationResolution === "not_applicable"
        ? "Your account covers every store, so this form won't name one. Create the draft here when you're ready and edit it below — nothing is saved to anyone's file until you do."
        : "Create the draft here when you're ready, and edit it below — nothing is saved to anyone's file until you do."
      : "**Nothing has been created.** This is a proposal, not a form — I can't create this one in chat yet.",
  );

  return lines.join("\n");
}

/**
 * The opening ask for the forms without an intake of their own, listing only
 * what is actually missing.
 *
 * The employee is always on it — this is reached only when nobody has been
 * named. The salon is on it only while the manager has a real choice to make;
 * a salon the account settles, or one they cannot file against at all, is not
 * a question they can usefully answer. The date, the account of what happened
 * and the job title drop off as soon as their words supply them.
 */
function openingQuestions(proposal: ChatFormProposal, context: ManagerContext): string {
  /*
   * TWO PEOPLE NAMED IS ONE SHORT QUESTION. Found in production QA:
   * "coaching form for Avery Testperson and Jordan Testperson" got the generic
   * "the employee's full name" list, to a manager who had just given two.
   */
  const employee = resolveEmployee(context);
  if (employee.kind === "ambiguous") {
    const names = employee.candidates.map((name) => `**${name}**`);
    return `Which of them is this **${proposal.templateName}** for — ${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}?`;
  }
  const coaching = COACHING_TEMPLATES.has(proposal.templateKey);
  /*
   * A COACHING FORM MAY BE FOR THE WHOLE TEAM, and the question says so, so a
   * manager setting a salon-wide expectation is not made to pick one person.
   */
  const asks = [
    allowsTeamSubject(proposal.templateKey)
      ? "The employee's full name — or tell me it's for the whole team."
      : "The employee's full name.",
  ];
  if (proposal.locationResolution === "needs_selection") {
    asks.push("Which of your stores this is about.");
  }
  if (!proposal.formDate) {
    asks.push(`The date for the form (if you say "today," I'll use ${todayInWords()}).`);
  }
  if (!describesIncident(context.text)) {
    /*
     * COACHING IS NOT ALWAYS A CONCERN. Training, expectation-setting and
     * recognition are coaching too, and asking for "the performance concern"
     * tells the manager every coaching form is a problem being written up.
     */
    asks.push(
      coaching
        ? "What the coaching covers — what you observed, or the training, expectation or feedback you're giving."
        : "A description of the performance concern or observed behavior.",
    );
  }
  if (!proposal.employeeRole) {
    asks.push("The employee's job title (optional but helpful).");
  }

  if (asks.length === 1) return "Who is this form for? Tell me the employee's full name.";
  const numbered = asks.map((ask, index) => `${index + 1}. ${ask}`).join("\n");
  return `To draft a form, I'll need a few details first:\n\n${numbered}\n\nCould you please provide these?`;
}

/**
 * One number, two numbering systems: Buff City Soap's store numbers are the
 * primary system and are named first; Woven's numbers are said to be Woven's.
 */
export function numberingQuestion(
  numbering: { number: string; buff: readonly string[]; woven: readonly string[] } | undefined,
  typed: string,
): string {
  if (!numbering) return `That number is used for more than one store. Which store is this about?`;
  const list = (ids: readonly string[]) => ids.map((id) => `**${storeLabel(id)}**`).join(" or ");
  const number = `**${numbering.number}**`;
  const wovenOnly = numbering.woven.filter((id) => !numbering.buff.includes(id));
  return `${typed === "that" ? "That" : typed} is ambiguous because Buff City Soap and Woven number stores differently. In Buff City Soap's numbering, store ${number} is ${list(numbering.buff)}; in Woven, ${number} is ${list(wovenOnly)}. Which store do you mean?`;
}

/**
 * The roster's name for the store a proposal resolved to, so the manager READS
 * BACK which store the form will carry before it is created. Null when none was
 * resolved or the roster does not know the id — never a guess.
 */
function resolvedStoreName(proposal: ChatFormProposal): string | null {
  if (proposal.locationResolution !== "resolved" || !proposal.locationId) return null;
  return locationById(proposal.locationId)?.name ?? null;
}

function locationQuestion(proposal: ChatFormProposal): string {
  if (
    proposal.locationResolution === "needs_selection" &&
    proposal.locationCandidates?.length &&
    proposal.locationSelection?.reason !== "number_collision" &&
    proposal.locationSelection?.reason !== "confirm"
  ) {
    /*
     * THE MANAGER NAMED A PLACE THAT IS SEVERAL STORES ("Sioux Falls"). Asking
     * "which location?" blind makes them guess at the list; naming only the
     * stores their own words could mean settles it in one word.
     */
    const names = proposal.locationCandidates.map((name) => `**${name}**`);
    return `More than one store matches what you said — ${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}? Tell me which one and I won't guess.`;
  }
  const selection = proposal.locationSelection;
  if (proposal.locationResolution === "needs_selection" && selection) {
    const typed = selection.typed ? `**${selection.typed}**` : "that";
    const candidates = proposal.authorizedLocationIds.map((id) => storeLabel(id));
    const list =
      candidates.length <= 1
        ? candidates.map((name) => `**${name}**`).join("")
        : `${candidates.slice(0, -1).map((name) => `**${name}**`).join(", ")} or **${candidates[candidates.length - 1]}**`;
    switch (selection.reason) {
      case "not_found":
        return `I couldn't find a store matching ${typed} in the registered stores, so I haven't picked one. Which store is this about?`;
      case "confirm":
        return `I read ${typed} as ${list} — is that the store? Choose it below to confirm, or tell me which store you meant.`;
      case "number_collision":
        return numberingQuestion(selection.numbering, typed);
      case "ambiguous":
        return `${typed === "that" ? "That" : typed} could be ${list}. Which store is this about?`;
    }
  }
  if (proposal.locationResolution === "needs_selection" && proposal.namedLocationOutOfScope) {
    /*
     * THEY NAMED A STORE THAT IS NOT THEIRS. Neither it nor their own store is
     * filled in: one would file outside their assignment, the other would
     * quietly overrule what they said.
     */
    return `**${proposal.namedLocationOutOfScope}** isn't a store on your assignment, so I can't file a form against it. Which of your stores is this about?`;
  }
  if (proposal.locationResolution === "needs_selection" && proposal.namedLocationOutOfScope) {
    /*
     * THEY NAMED A STORE THAT IS NOT THEIRS. Neither it nor their own store is
     * filled in: one would file outside their assignment, the other would
     * quietly overrule what they said.
     */
    return `**${proposal.namedLocationOutOfScope}** isn't a store on your assignment, so I can't file a form against it. Which of your stores is this about?`;
  }
  if (proposal.locationResolution === "needs_selection") {
    // Deliberately says nothing about HOW MANY stores the actor covers: this
    // branch is reached both by a manager assigned to several and by a global
    // actor whose stores cannot be enumerated at all.
    return "I won't choose which store this belongs to. Which store is this about?";
  }
  return "I can't confirm which store this would be filed against, so the proposal has none. A form can only name a store Ask Bubbles can verify you're assigned to.";
}
