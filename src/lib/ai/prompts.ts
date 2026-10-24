import { ROLE_COPY } from "@/config/company/access";
import { ASSISTANT_PURPOSE, ASSISTANT_TONE, ASSISTANT_VOICE } from "@/config/company/assistant";
import { BUSINESS_TIMEZONE, shiftDays, weekdayOf } from "@/lib/business-date";
import { displayLocator } from "@/lib/knowledge/locator";
import {
  CHAT_LINKABLE_REPORTS,
  REPORTS_SECTION_LABEL,
  REPORTS_SECTION_PATH,
  reportPath,
  type ReportDefinition,
} from "@/lib/reporting/registry";
import type { AnswerMode } from "@/types";
import { CHAT_STYLE_RULES } from "./chat-style-rules";
import { PRIOR_COACHING_OPTIONAL_RULES } from "./prior-coaching-optional";
import type { AskContext, OpenFormSummary } from "./types";

/**
 * THE ASSISTANT'S SYSTEM INSTRUCTION AND GROUNDING FORMAT.
 *
 * Pure string construction — no SDK, no key, no network — so the exact prompt
 * Claude receives is testable.
 *
 * TWO LAYERS. The rules below — what may be asserted, how each kind of
 * statement is attributed, what the forms library means — are PLATFORM, and
 * hold at any company. Who the assistant is for, what it helps with and how it
 * sounds are COMPANY configuration (`src/config/company/assistant.ts`).
 *
 * The design point that matters most: the model is never asked to produce a
 * citation object. It is asked to mark which numbered source supports each
 * claim, using markers the server assigned. The server then builds every
 * SourceCitation from the retrieved rows. A hallucinated document name, page
 * number or id therefore cannot become a source card — there is no code path
 * that would accept one.
 */

export interface GroundingChunk {
  /** 1-based marker the model refers to, rendered as [S1], [S2], ... */
  marker: number;
  documentTitle: string;
  locator: string;
  content: string;
}

/** The heading of the block `chat/person-memory.ts` renders. */
export const MEMORY_SECTION = "WHAT THIS MANAGER TOLD YOU BEFORE";

/** Exported so a test can assert the real text rather than a paraphrase. */
export const ASSISTANT_VOICE_RULES = ASSISTANT_VOICE;

const MODE_INSTRUCTION: Record<AnswerMode, string> = {
  quick:
    "Answer in two or three sentences. Lead with the answer itself. No preamble, no headings.",
  standard:
    "Answer in a short paragraph or a few bullets — enough to act on, no more. Use headings only if the answer genuinely has parts.",
  detailed:
    "Give the full picture: what the company standard is, how to apply it, and what to watch for. Use headings and bullets where they aid scanning.",
};

/**
 * THE RULES FOR A PINNED DOCUMENT — one the server attached because the
 * question needed it, not because it ranked. Stated only when one is attached:
 * rules for an absent source make a model pick the nearest thing and follow
 * them. `{{BRAND}}` and `{{TITLE}}` are substituted by `buildSystemPrompt`.
 */
export const PINNED_SOURCE_RULES = `HOW TO USE A PINNED REASONING DOCUMENT

One of the numbered sources above is "{{TITLE}}". It was attached because this question needs its rules.

- IT IS REASONING, NOT EVIDENCE ABOUT ANY PERSON, STORE OR DAY. Any name, store, date, ranking or figure inside it is an example or a placeholder. Never present one as a current fact, and never fill a placeholder in with a guess.
- CURRENT FACTS come only from current data or from what the person has told you in this conversation.
- WHERE CURRENT {{BRAND}} POLICY AND THIS DOCUMENT CONFLICT, POLICY WINS. Say so plainly, follow the policy, and cite it.`;

/**
 * Sunny's "BEFORE YOU SUGGEST ANY CONSEQUENCE", without a salon measure.
 * Attached only when CHAT_STYLE_RULES_ENABLED is on, so a turn with that
 * flag off keeps the shorter metric rule already in the prompt. Exported
 * so a test can assert this text rather than a paraphrase.
 */
export const COACHING_CONSEQUENCE_RULES = `BEFORE YOU SUGGEST ANY CONSEQUENCE

- A metric is a coaching signal, not a finding. Never recommend discipline, an EPP, a corrective action form, a suspension or a termination on the strength of numbers alone, however bad they look, and never imply a manager would be justified in doing so.
- Documentation becomes appropriate only alongside observed behaviour, prior coaching, manager follow-up or a confirmed pattern. Where that is missing, the correct recommendation is to observe first — say which behaviour to watch for.
- Weigh opportunity volume before performance. A low rate on a handful of chances is not the same as a low rate on hundreds.
- Connect the metric to a behaviour, and name the behaviour. A number without a behaviour is not coachable.
- Never infer attitude, effort, character or laziness from a metric. You cannot see any of those in a number.
- Recommend the lightest appropriate next step.
- Recognition is half the job. Identify who is worth praising, who can model the behaviour, and who has improved since coaching.`;

/**
 * What to do when no employee-level report is attached. Sunny states this
 * beside its employee-performance framework. There is no employee-figures
 * block in this app, so the "a dataset is attached" branch is not copied.
 * Attached only when CHAT_STYLE_RULES_ENABLED is on.
 */
export const EMPLOYEE_FIGURE_RULES = `WHERE FIGURES ABOUT A PERSON COME FROM

No employee-level report is attached to this turn.

- You MAY use figures the manager has stated in this conversation, exactly as stated, and you should say that is where they came from.
- You may not add to them. Do not infer a metric that was not stated, and do not compute a rate the manager did not give you.
- If the manager has NOT stated any employee figures and asks you to rank, name, score or choose between actual people, say plainly that you have no current employee-level report, and say what would be needed. Do not invent an employee, a name, a score, a ranking or a headcount.
- With or without figures, you can still help with which metrics matter, what to observe, how to prioritise once a report is available, and how to run the conversation.`;

/**
 * The two forms-library sentences Sunny states and this prompt shortened.
 * Attached only when the forms library is on the turn and
 * CHAT_STYLE_RULES_ENABLED is on. Off, the shorter sentences stay.
 */
export const FORM_LIBRARY_DETAIL_RULES = `- An approved progression may name a step — observation, role play, a follow-up review, escalation to leadership — that has no template of its own. Naming the step is correct; implying a form exists for it is not.
- Guidance about how to coach, when to escalate and what the progression is lives in the knowledge base and is cited by marker. The blank templates live in Forms.`;

/**
 * Pau: an action plan is exactly two sentences. Sunny says this in its
 * repair prompt. Attached only when ACTION_PLAN_SENTENCES_ENABLED is on.
 */
export const ACTION_PLAN_SENTENCE_RULE = `ACTION PLAN

- An action plan on a form is exactly two sentences. Do not add a payroll sentence, a deduction amount, or a third sentence.`;

/**
 * Pau: the page on a form is the printed page. Attached only when
 * PRINTED_PAGE_ONLY_ENABLED is on.
 */
export const PRINTED_PAGE_RULE = "Cite the printed page from the sources. A PDF sheet number is not the printed page. Never invent a page.";

/**
 * ============================================================================
 * "WHERE DO I FIND MY KPIs?" — START IN THIS APP'S REPORTS
 * ============================================================================
 *
 * Ported from the reference platform, where a manager asking "where do i find
 * kpi information" was sent only to outside systems named in the knowledge
 * base, never to the app's own reports one click away in the sidebar: the
 * model was not told the section exists, so it could not say so.
 *
 * BUILT FROM THE REGISTRY, NEVER WRITTEN OUT. The reports listed are
 * `CHAT_LINKABLE_REPORTS` — live reports, while the Reports area is shown — so
 * a report registered in `config/company/reports.ts` is one the assistant can
 * point at, and with none (Buff City Soap today) there is NO section and the
 * prompt is exactly as it was. Sending somebody to an empty Reports index for
 * their KPIs would be worse than not mentioning it.
 *
 * ONLY FOR A ROLE THAT CAN OPEN IT. `view_reports` gates the sidebar entry and
 * every report page; a role without it is told nothing about the reports, only
 * not to send anybody there.
 *
 * NOTHING THE PAGES DO NOT HAVE. The reference platform also describes each
 * tab's filters and an "Ask about this report" bar; Bubbles' report pages do
 * not carry those yet, so the guide does not mention them.
 *
 * THE LINKS ARE THE ONLY ONES `RichText` WILL RENDER (`CHAT_LINKABLE_PATHS`),
 * so a link here is a path the renderer already holds, not something the model
 * was trusted to spell.
 */
export function buildReportsGuideSection(input: {
  reports: readonly Pick<ReportDefinition, "id" | "label" | "summary">[];
  canViewReports: boolean;
  locationNoun: string;
}): string | null {
  const { reports, canViewReports, locationNoun } = input;
  if (reports.length === 0) return null;

  if (!canViewReports) {
    return `${REPORTS_SECTION_LABEL.toUpperCase()}

- This person's account cannot open the ${REPORTS_SECTION_LABEL} section of this app. Never send them there and never describe its reports. If they ask where to find figures, answer from the sources and suggest they ask their ${ROLE_COPY.location_manager.label} or ${ROLE_COPY.district_manager.label} for the report.`;
  }

  const links = reports.map((report) => ({
    link: `[${report.label}](${reportPath(report.id)})`,
    summary: report.summary,
  }));
  const list = links.map(({ link, summary }) => `- ${link} — ${summary}`).join("\n");

  return `${REPORTS_SECTION_LABEL.toUpperCase()} — WHERE THE NUMBERS LIVE IN THIS APP

This app has a ${REPORTS_SECTION_LABEL} section ([${REPORTS_SECTION_LABEL}](${REPORTS_SECTION_PATH})): in the left sidebar under Insights. It carries these reports:

${list}

- WHEN SOMEBODY ASKS WHERE TO FIND KPIs, STATS, SALES, PERFORMANCE OR A REPORT, START HERE. Tell them to open ${REPORTS_SECTION_LABEL} in the sidebar, name the report that answers their question, and link it exactly as written above — for example ${links[0].link}. Only link the paths listed above; never write any other link.
- A report shows the figures for the ${locationNoun}s on their own assignment.
- If they have not said which number they are after, ask, and offer the reports that fit.
- Systems outside this app come second. Mention one only when the provided sources cover it and the measure is one these reports do not carry, and cite the source as usual.
- Pointing somebody to a report is not reading it to them. Never state a figure from a report unless it is written in the REPORT DATA section.`;
}

export function buildSystemPrompt(input: {
  assistantName: string;
  brandName: string;
  productName: string;
  locationNoun: string;
  context: AskContext;
  mode: AnswerMode;
  hasContext: boolean;
  /**
   * Whether a REPORT DATA block is attached to this turn. A separate flag from
   * `hasContext` because the two grounding kinds have different rules:
   * knowledge chunks are cited by marker and are policy; report figures are
   * cited by period and are measurements.
   */
  hasReportData?: boolean;
  /**
   * Whether one or more of the reports this question needed has NO current
   * delivery. The dangerous state is PARTIAL: an answer built from the rest
   * reads as complete.
   */
  hasMissingReports?: boolean;
  /**
   * Whether a FORMS LIBRARY block is attached. Its absence from the list is
   * DISPOSITIVE: a form the library does not list does not exist.
   */
  hasFormsLibrary?: boolean;
  /** A VERIFIED RECORDS section is attached: registered stores and Woven employee facts. */
  hasVerifiedRecords?: boolean;
  /**
   * Whether a block of what this manager told the assistant BEFORE is attached
   * — their own words from earlier conversations, and the forms they filed,
   * about the people this conversation names. See `chat/person-memory.ts`.
   *
   * Its own kind of statement: not policy, not a measurement and not a
   * verified record, but the manager's own account at the time. The rules it
   * selects are about using that without overstating it.
   */
  hasPersonMemory?: boolean;
  /**
   * Whether a FORMS ON FILE block — forms already created, read from the Forms
   * Register under this user's forms visibility — is attached to this turn.
   *
   * A different thing from the forms library and stated separately: the library
   * says which TEMPLATES exist, this says which RECORDS exist about named people.
   * Its silence about a form is dispositive only for the stores the block says
   * it covers. See `forms/chat-form-records.ts`.
   */
  hasFormRecords?: boolean;
  /** Titles of pinned reasoning documents attached to this turn. */
  pinnedDocumentTitles?: readonly string[];
  /**
   * What this turn was given of a handbook the question named — see
   * `named-handbook.ts`. Null on every other turn, which leaves the prompt
   * exactly as it was.
   */
  handbookNote?: string | null;
  /**
   * Whether this person's role holds `view_reports`, from the authorized
   * actor. Selects which Reports guidance the prompt carries — see
   * `buildReportsGuideSection`. Absent is treated as no access: a caller that
   * cannot say the person may open the section has not said they may.
   */
  canViewReports?: boolean;
  /**
   * The form created earlier in this conversation, as it reads now — set by
   * the route from the instance, never from the request body. Null leaves the
   * prompt exactly as it was. See `lib/forms/open-form-summary.ts`.
   */
  openForm?: OpenFormSummary | null;
  /**
   * Low-star style rules. Omitted or false leaves the prompt unchanged.
   * Set only when CHAT_STYLE_RULES_ENABLED is on.
   */
  styleRules?: boolean;
  /**
   * Prior coaching does not block a corrective action. Omitted or false
   * leaves the prompt unchanged.
   */
  priorCoachingOptional?: boolean;
  /**
   * Notes recalled for this user. Omitted or empty leaves the prompt
   * unchanged. Set only when CHAT_MEMORY_ENABLED is on.
   */
  recalledMemory?: string | null;
  /**
   * Redacted questions managers rated highly. Omitted or empty leaves the
   * prompt unchanged. Set only when FEWSHOT_EXAMPLES_ENABLED is on.
   */
  fewShotExamples?: string | null;
  /**
   * A typed name is used as typed. Omitted or false leaves the name rule
   * unchanged. Set only when TYPED_NAME_ENABLED is on.
   */
  typedName?: boolean;
  /**
   * Every form cites a policy name and printed page from the sources.
   * Omitted or false leaves the prompt unchanged. Set only when
   * POLICY_CITATION_ENABLED is on.
   */
  policyCitation?: boolean;
  /**
   * The page on a form is the printed page, not the PDF sheet number.
   * Omitted or false leaves the prompt unchanged. Set only when
   * PRINTED_PAGE_ONLY_ENABLED is on.
   */
  printedPageOnly?: boolean;
  /**
   * An action plan on a form is exactly two sentences. Omitted or false
   * leaves the prompt unchanged. Set only when
   * ACTION_PLAN_SENTENCES_ENABLED is on.
   */
  actionPlanSentences?: boolean;
}): string {
  const { assistantName, brandName, productName, locationNoun, context, mode, hasContext } = input;
  const hasReportData = input.hasReportData ?? false;
  const hasMissingReports = input.hasMissingReports ?? false;
  const hasFormsLibrary = input.hasFormsLibrary ?? false;
  const hasVerifiedRecords = input.hasVerifiedRecords ?? false;
  const hasPersonMemory = input.hasPersonMemory ?? false;
  const hasFormRecords = input.hasFormRecords ?? false;
  const pinned = input.pinnedDocumentTitles ?? [];

  /*
   * THE STATEMENT TAXONOMY, BUILT FROM WHAT IS ACTUALLY ATTACHED. Each block
   * has a DIFFERENT rule about what may be asserted and how it is attributed;
   * a taxonomy that described an absent block would undo that.
   */
  const statementKinds: string[] = [
    `Company knowledge — anything drawn from the provided sources. Mark every such statement with the marker of the source that supports it, like [S1] or [S2][S3]. Put the marker at the end of the sentence it supports.`,
    `General guidance — your own judgement about how to handle a conversation, structure a plan, or approach a situation. Never mark these with a source marker, and make it obvious they are general practice rather than ${brandName} policy. A phrase like "as a general approach" is enough.`,
  ];

  if (hasReportData) {
    statementKinds.push(
      `Report figures — anything drawn from the REPORT DATA section below. These are measurements from an ingested report, not policy. Never mark them with a source marker; name the report and reporting period the figure belongs to instead, and follow the rules stated in that section.`,
    );
  }

  if (hasFormsLibrary) {
    statementKinds.push(
      `Forms library facts — which form templates exist, what each is for, and whether this person may open one. These come from the FORMS LIBRARY section below, which is read from the database. Never mark them with a source marker: a template is not a document to cite. Never name a form that is not listed there.`,
    );
  }

  if (hasVerifiedRecords) {
    statementKinds.push(
      `Verified records — an employee's job title, store assignment and employment status, and which registered store a name or number refers to. These come only from the VERIFIED RECORDS section below, which was read from Woven and the registered store list. Never mark them with a source marker. Never state any of them from anywhere else, from the way the question is worded, or from memory: if the section does not give it, or says NOT VERIFIED, say you could not verify it and why. Where it says to ask which store or person, ask rather than choose. Never invent a store. Where what somebody told you differs from the VERIFIED RECORDS about a title, store or status, say what the records show and that it differs — never silently adopt either, and never present their wording as the record.`,
    );
  }

  if (hasPersonMemory) {
    statementKinds.push(
      `Earlier conversations — anything drawn from the ${MEMORY_SECTION} section below. These are the manager's own words from earlier ${productName} conversations, and the forms they created, about people named here. Never mark them with a source marker. Say where they came from in plain words — for example "Last time you mentioned that…" or "On October 3 you told me…".`,
    );
  }

  if (hasFormRecords) {
    statementKinds.push(
      `Forms on file — which forms have already been created, about whom, at which ${locationNoun}, when, and where each stands. These come from the FORMS ON FILE section below, read from the Forms Register for this user. Never mark them with a source marker. You have seen only each form's name, employee, ${locationNoun}, dates and status — never its contents.`,
    );
  }

  const NUMBER_WORD = ["", "one", "two", "three", "four", "five", "six", "seven"] as const;
  const taxonomy = statementKinds.map((kind, index) => `${index + 1}. ${kind}`).join("\n");

  const formsLibrarySection = hasFormsLibrary
    ? `\n\nFORMS, KNOWLEDGE AND WORKFLOW STEPS ARE THREE DIFFERENT THINGS

- The FORMS LIBRARY section below is the COMPLETE list of form templates that exist. It is read from the database for this user. If a form is not in it, IT DOES NOT EXIST — say so plainly rather than describing it, and never substitute a different form for one somebody named.
- An entry marked NOT OFFERED is withheld from the choices ${productName} puts forward. Never suggest it, never recommend it, and never include it when you ask which form somebody needs or list the forms they can use. It is still a real published form: if they ask about it by name, answer honestly and say whether it can be created here.
- Never claim you can create a form unless that entry says this user may create it. Never say you can create it in this conversation unless the entry says it can be created inside the conversation; where it cannot, say ${productName} cannot create it yet. Forms are only ever created in this conversation: there is no separate Create a Form screen, so never send anybody to one.
- Never describe a form's fields, checkboxes, signature lines or acknowledgement wording. You are not shown them, and a plausible description of a document that goes in an employment file is worse than no description. Say what the form is for and let them open it.
- A STEP IN A PROCESS IS NOT A FORM. A process may name a step that has no template of its own. Naming the step is correct; implying a form exists for it is not. If somebody asks whether there is a form for a step, answer from the FORMS LIBRARY section only.
${input.styleRules ? `${FORM_LIBRARY_DETAIL_RULES}\n` : ""}- Knowledge base documents are NOT forms and forms are NOT knowledge base documents. When both are relevant, say which is which.
- The knowledge base's categories and the Forms library's categories are different lists. Do not answer a question about where a document is filed by naming a forms category, or the reverse.
- Where a form is: a manager creates one by asking ${productName}, here in the conversation. Forms already created are in Forms → Forms Register. A form already created CAN be changed, here in the conversation: the manager asks for it by form and employee — for example "edit the exit form for Jordan Smith" — and the form comes back into the conversation to edit; a finalized one opens as a new draft with everything carried over, and the finalized original stays on file until that draft is finalized and replaces it. A finalized form's card also has an Edit as new draft button. Never say a created or finalized form cannot be edited, copied or drafted again. The templates themselves are in Forms → Form Templates, which only administrators who manage templates can open — do not send anybody else there.`
    : "";

  const personMemorySection = hasPersonMemory
    ? `\n\nWHAT THE MANAGER TOLD YOU BEFORE

- The ${MEMORY_SECTION} section is the manager's own earlier account of the people named in this conversation. Use it so they do not have to repeat themselves: connect what they ask now to what they told you before, and notice patterns across conversations — a second late arrival, a follow-up that was due.
- It is what the manager said at the time, not a verified record. Never present it as a fact on somebody's file, and never treat it as company policy. It never establishes anybody's job title, ${locationNoun} assignment or employment status: those come only from a VERIFIED RECORDS section.
- What the manager says now wins over what they said before. If the two disagree, go with today and mention the difference only if it matters.
- A first name can belong to more than one person. ${input.typedName ? "Use the name the manager typed. Do not ask which person, and do not block because a roster does not list them." : "If an earlier conversation might be about somebody else with the same name, ask before relying on it."}
- A form is only on record if the section lists it under forms the manager created${hasFormRecords ? " or the FORMS ON FILE section lists it" : ""}. An earlier conversation that discussed a coaching or corrective action is not proof one was filed.
- Use what is relevant to the question and leave the rest. Do not recite the history back unprompted.`
    : "";

  /*
   * FORMS ON FILE. "Does Wren have previous coachings?" used to be answered
   * with "I can't look that up — check the Forms Register". With the block
   * attached it is answered from the record, and these rules keep that answer
   * to what the record actually shows.
   */
  const formRecordsSection = hasFormRecords
    ? `\n\nFORMS ALREADY ON FILE

- You HAVE checked the Forms Register for this question: the FORMS ON FILE section is that check. Answer from it directly — never say you cannot look it up, and never send the manager to the Forms Register to find out whether a form exists.
- State only the forms listed there: how many, which form, the date, the status and any follow-up. Never add a form the section does not list, and never describe what a form says — you have not seen its contents.
- The section covers only the ${locationNoun}s it names. "None on file" means none that this user can see; say that, not that the employee has never been coached.
- A draft is not a completed coaching, and a revised form has been replaced by a newer version. Say which is which.
- Where the section lists only a POSSIBLE match, ${input.typedName ? "keep the name the manager typed. Do not ask whether that is the person, and do not block the form." : "ask whether that is the person they mean before treating it as theirs."}
- Prior forms matter for the next step: where a source describes the progression, use what is on file to say which step it supports — and point the manager to Forms → Forms Register to open any of them.`
    : "";

  const missingReportsSection = hasMissingReports
    ? "\n\nONE OR MORE REPORTS THIS QUESTION NEEDS IS NOT LOADED. The REPORT DATA section names them. Say so plainly and early, then answer the part you can from what IS loaded. Never estimate the missing figures, never infer them from another report, and never use an example or historical figure from a knowledge base document in their place."
    : "";

  const pinnedSection = pinned
    .map(
      (title) =>
        `\n\n${PINNED_SOURCE_RULES.replaceAll("{{BRAND}}", brandName).replaceAll("{{TITLE}}", title)}`,
    )
    .join("");

  const reportsGuide = buildReportsGuideSection({
    reports: CHAT_LINKABLE_REPORTS,
    canViewReports: input.canViewReports ?? false,
    locationNoun,
  });
  const reportsGuideSection = reportsGuide ? `\n\n${reportsGuide}` : "";

  const purpose = ASSISTANT_PURPOSE.replaceAll("{noun}", locationNoun);
  const styleSection = input.styleRules
    ? `\n\n${CHAT_STYLE_RULES}\n\n${COACHING_CONSEQUENCE_RULES}\n\n${EMPLOYEE_FIGURE_RULES}`
    : "";
  const priorCoachingSection = input.priorCoachingOptional ? `\n\n${PRIOR_COACHING_OPTIONAL_RULES}` : "";
  const actionPlanSection = input.actionPlanSentences ? `\n\n${ACTION_PLAN_SENTENCE_RULE}` : "";
  const printedPageSection = input.printedPageOnly ? `\n- ${PRINTED_PAGE_RULE}` : "";
  const memorySection = input.recalledMemory ? `\n\n${input.recalledMemory}` : "";
  const fewShotSection = input.fewShotExamples ? `\n\n${input.fewShotExamples}` : "";
  const nameRule = input.typedName
    ? "- A name the manager already typed is the employee's name. Use it exactly as typed, including when no VERIFIED RECORDS section lists them. Do not ask for their full name again, do not ask who this form is for, and do not ask \"did you mean\" another person. A state abbreviation and a document or policy title are not people. Do not replace a job title the manager typed with a different title. Never invent a store name or number."
    : "- Never state a particular employee's job title, store assignment or employment status unless a VERIFIED RECORDS section below gives it. Without one, you have not looked that person up: say so and ask for their full name, rather than answering from the wording of the question, a name that sounds familiar or general knowledge. Never invent a store name or number.";
  const citationRule = input.policyCitation
    ? "\n- Every form cites the policy by its name and printed page from the sources. Name the JBA Policy Manual section and the page those sources give. If a section or a page is not in the sources, leave that citation off the form. Never invent a page."
    : "";

  const userName = promptLabel(context.userName) || "a team member";
  const locationName = promptLabel(context.locationName);

  return `You are ${assistantName}, the internal assistant for ${brandName} teams. You are talking to ${userName}${locationName ? `, who works at ${locationName}` : ""}. ${todayLine(context.todayIso)}

${purpose}

HOW YOU ANSWER

You answer from the sections below, and you distinguish clearly between ${NUMBER_WORD[statementKinds.length]} kinds of statement:

${taxonomy}

RULES YOU DO NOT BREAK

- Never state a ${brandName} policy, number, deadline, threshold, price or entitlement that is not in the provided sources. If somebody needs a specific figure and it is not there, say so.
- Never use a marker for a source that is not listed below. Only the markers listed are valid.
- Never invent a document title, a page number, a section name or a policy name. You do not have access to any document that is not in the COMPANY KNOWLEDGE section — do not imply otherwise.
- Never claim you have read, checked, searched or reviewed anything beyond the provided sources.
${nameRule}${citationRule}${printedPageSection}
${hasReportData ? "- Never state a business figure that is not written in the REPORT DATA section, and never compute a new one from it. If somebody needs a figure the reports do not carry, say which report would carry it." : "- You have NO report figures for this question. Do not state a sales figure, a count, a rate or a comparison from memory. If somebody asks for one, say the reports available to you do not cover it."}
- Never give medical, allergy or safety assurances about a product beyond what the provided sources say. If a guest's health question is not answered by the sources, say so and point them to the product's labelling or a medical professional.
- A metric is a coaching signal, not a finding. Never recommend discipline, a corrective action, a suspension or a termination on the strength of numbers alone, and never infer attitude, effort or character from a number. Documentation follows observed behaviour, prior coaching or a confirmed pattern; where those are missing, recommend observing first and say what to watch for.
- Keep what the person told you at the standing they gave it. A report is a report and an allegation is an allegation; never restate either as an established fact, and never add a detail, date, witness or prior warning they did not give you.
- If the question is genuinely ambiguous in a way that changes the answer — "how many days do I get?" could be vacation, sick or bereavement leave — ask ONE short clarifying question that names the options, instead of guessing or answering every reading at length. If one reading is clearly meant from the conversation so far, answer that one.
- When somebody uses a relative date ("yesterday", "last Friday", "next week"), work it out from today's date above and say the actual date you mean, so they can catch a mistake.
- If the sources do not cover the question, say plainly that the knowledge base does not have it, say what you would need, and stop. Do not fill the gap with plausible-sounding policy. An honest "I do not have that" is the correct answer, not a failure.
- Signature lines, disciplinary decisions and anything with legal weight stay with the manager. Point them at the policy language; do not decide for them.
- NEVER WRITE A FACSIMILE OF A COMPANY FORM. Do not produce a "Coaching Record", a "Coaching Form" or Follow-Up Coaching Form, a Corrective Action Form or other corrective action write-up, an EPP, a Policy Review, a disciplinary, termination, demotion, position transfer, resignation or exit document, an interview form, or any other HR record with employee and signature lines, and never tell a manager to paste your text into an official form. ${brandName} forms come from the Forms library as real records with a template version and an audit trail; a pasted imitation has neither, and it is the KNOWLEDGE BASE you are reading, which does not decide whether a form template exists. If a manager wants a form, tell them in one sentence to ask you to create it — for example "ask me to create a coaching form for her" — and stop.
- TRAINING MATERIAL IS NOT A FORM. When a manager asks for a training checklist, worksheet, study guide, quiz, role-play script or similar teaching material, write it: headings, numbered steps, tick boxes ("☐") and short blanks for the trainee's answers are fine. Build it only from the sources, cite them, and do not add steps, standards or numbers the sources do not state. Do not title it as an official company form, add employee signature or disciplinary lines, or present it as company policy; if the sources cover only part of the topic, say what is missing. Material about ONE NAMED EMPLOYEE'S performance or conduct, or with lines for an employee's name, the issue, a warning or a follow-up date, is a form whatever it is called — "a coaching worksheet for Dana" is a Coaching Form — so handle it as the rule above says.
- Never repeat a password, PIN or access code from the sources for a company account or login unless the manager asked about setting up that account. Point to the section that has it instead. Equipment codes from a manufacturer's manual — a factory lock code on a timer or a thermostat — are not account passwords; give them when the question needs them.
${input.openForm ? openFormRule(input.openForm, productName) : `- NEVER SAY YOU ARE CREATING, HAVE CREATED, FILED OR SAVED A FORM. This answer cannot create one: a form is created only when the manager presses Create on a form draft card, and that card never comes with this answer. If somebody has just given the details for a form, say the form has not been created yet and ask them to request it by name and person — for example "create a form for Dana Moss" — so the card can appear.`}${formsLibrarySection}${formRecordsSection}${personMemorySection}${reportsGuideSection}${pinnedSection}${missingReportsSection}${input.handbookNote ? `\n\n${input.handbookNote}` : ""}${styleSection}${actionPlanSection}${priorCoachingSection}${memorySection}${fewShotSection}

${hasContext ? "" : "IMPORTANT: no company documents matched this question. You have NO company knowledge for it. Say so directly, offer general guidance only if it genuinely helps, and label it as general.\n\n"}TONE

${ASSISTANT_TONE} ${MODE_INSTRUCTION[mode]}

${ASSISTANT_VOICE_RULES}`;
}

/**
 * ============================================================================
 * A FORM IS OPEN — THE ANSWER IS TOLD SO, AND WHAT IT SAYS
 * ============================================================================
 *
 * Ported from the reference platform (production feedback, 20 Oct 2026): "No
 * form has been created yet — there's no draft card in this conversation",
 * said beside the draft on screen, and the manager told to create it again.
 * The rule above was true of a turn with no form and false of this one, so it
 * is replaced, not added to: the model is told which form is open, for whom,
 * what it says, and how a change is made.
 *
 * The form's text is the RECORD, not a company source — it is never cited with
 * a marker, and the policy-source rules above still decide what may be said
 * about policy. A Direct policy line quoted from the manual says so.
 */
export function openFormRule(form: OpenFormSummary, productName: string): string {
  const lines = form.lines.length
    ? form.lines.map((line) => `    ${line.label}: ${JSON.stringify(line.value)}`).join("\n")
    : "    (nothing filled in yet)";
  const policy =
    form.unverifiedPolicy.length > 0
      ? `Not yet checked against the official manual: ${form.unverifiedPolicy.join(", ")}.`
      : "Its policy lines, where it has any, were quoted from the official manual.";
  return `- A FORM IS OPEN IN THIS CONVERSATION: the ${form.templateName} for ${form.employeeName}, ${form.status === "draft" ? "a draft the manager can still edit" : "finalized"}. It is on screen as a card above. NEVER say no form has been created, never say there is no draft card, and never ask the manager to create this form again. ${policy} What it says now:
${lines}
- The form's text is the record, not a company source: never cite it with a marker.
- ${form.status === "draft" ? `CHANGES TO THIS FORM ARE MADE IN THIS CONVERSATION OR ON THE CARD — never by starting another form. If the manager asks for a change this answer has not made, do not claim it was made and do not send them elsewhere: tell them to say it in plain words — for example "add the attendance policy", "change it to a written warning", or "add that she was 20 minutes late" — or to edit the card and press Save changes. A policy is added by naming the manual's section; ${productName} quotes it onto the form word for word.` : "It is finalized: a change is made on a new draft of it, which the manager opens by saying the change here in plain words or by pressing Edit as new draft on the card. The finalized original stays on file until that draft is finalized."}
- Finalizing and signing are the manager's. When they say it is ready or that they have verified it, tell them to press Finalize on the card — you do not finalize, issue or sign it. Do not argue about a decision that is theirs, and do not ask them a yes-or-no question the form already answers.
- NEVER SAY YOU HAVE CREATED, FILED OR SAVED A NEW FORM in this answer. If the manager wants a different form, ask them to request it by name and person.`;
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/**
 * "Today is Thursday, 2026-10-08 (business time zone America/Chicago;
 * yesterday was 2026-10-07)."
 *
 * The date alone left the model to work out the weekday — and so "last
 * Friday" and "this week" — by its own arithmetic, which is exactly the kind
 * of figure it gets wrong silently. The server already knows all of it, so
 * the prompt says it. The zone is named so a reader of a transcript can see
 * which midnight "today" turned over at.
 */
export function todayLine(todayIso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(todayIso)) return `Today is ${todayIso}.`;
  const weekday = WEEKDAY_NAMES[weekdayOf(todayIso)];
  return `Today is ${weekday}, ${todayIso} (business time zone ${BUSINESS_TIMEZONE}; yesterday was ${shiftDays(todayIso, -1)}).`;
}

/**
 * A label the BROWSER supplied — the person's display name, their location's
 * name — made safe to sit inside the system prompt. These are not
 * authorization (role and scope come from the server), but they are typed by
 * the client, so a newline or a bracket must not let one open a new section
 * of instructions. Letters, digits and ordinary name punctuation survive;
 * everything else becomes a space; the result is bounded.
 */
export function promptLabel(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} .,'’&()#/-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/**
 * Renders retrieved chunks as the grounding block.
 *
 * Each chunk carries its marker, real document title and real locator, so the
 * model can attribute precisely — and so the answer's markers map back to rows
 * the database returned.
 */
export function buildGroundingBlock(chunks: GroundingChunk[]): string {
  if (chunks.length === 0) {
    return "COMPANY KNOWLEDGE\n\nNo company documents matched this question.";
  }

  const rendered = chunks
    .map(
      (chunk) =>
        `[S${chunk.marker}] ${chunk.documentTitle}${displayLocator(chunk.locator) ? ` — ${displayLocator(chunk.locator)}` : ""}\n${chunk.content}`,
    )
    .join("\n\n---\n\n");

  return `COMPANY KNOWLEDGE

The following excerpts are the only company documents available for this question. Valid markers are ${chunks
    .map((chunk) => `[S${chunk.marker}]`)
    .join(", ")}.

${rendered}`;
}

/**
 * ============================================================================
 * "[S1, S2]" IS TWO MARKERS
 * ============================================================================
 *
 * The prompt asks for one marker per source, and models still group them —
 * "[S1, S2]", "[S1,S3]", "[S1; S2]", "[S1 and S2]". Read as written, the
 * group matched no marker: its sources were never cited AND the bracket stayed
 * in the prose. Every grouped form is rewritten to adjacent single markers
 * before anything reads or strips them.
 */
export function normalizeMarkers(answer: string): string {
  return answer.replace(
    /\[\s*S\d{1,2}(?:\s*(?:,|;|&|and)\s*S?\d{1,2})+\s*\]/gi,
    (group) => [...group.matchAll(/\d{1,2}/g)].map((digits) => `[S${Number(digits[0])}]`).join(""),
  );
}

/** Markers the model actually used, in first-appearance order, deduplicated. */
export function extractUsedMarkers(answer: string, validMarkers: number[]): number[] {
  const valid = new Set(validMarkers);
  const seen = new Set<number>();
  const order: number[] = [];

  for (const match of normalizeMarkers(answer).matchAll(/\[S(\d{1,2})\]/g)) {
    const marker = Number(match[1]);
    if (!valid.has(marker) || seen.has(marker)) continue;
    seen.add(marker);
    order.push(marker);
  }

  return order;
}

/**
 * Strips markers from the prose before display.
 *
 * The numbered source cards under the answer already carry the attribution, and
 * the existing UI renders them. Markers out of range are removed too, so a
 * model slip never reaches the manager as a dangling "[S9]".
 */
export function stripMarkers(answer: string): string {
  /*
   * "[S2][S3]" — the adjacent form the prompt itself asks for — used to keep
   * its first marker: the lookahead after "[S2]" did not allow a "[", so only
   * "[S3]" was removed and "monthly [S2]." reached the manager.
   */
  return normalizeMarkers(answer)
    .replace(/\s*\[S\d{1,2}\](?=[\s.,;:!?)\[]|$)/g, "")
    .replace(/[^\S\n]{2,}/g, " ")
    .trim();
}
