/**
 * Chat-quality flags. Each one defaults off.
 *
 * Unset, empty, "0", "false", and "off" leave the existing chat path
 * untouched. Only an explicit on-value turns a feature on, so a preview can
 * try one change without the others. The variable names are shared so both
 * apps turn the same behaviour on with the same variable.
 */

const ON = new Set(["1", "true", "on", "yes"]);

export function envFlag(name: string): boolean {
  const raw = process.env[name];
  if (typeof raw !== "string") return false;
  return ON.has(raw.trim().toLowerCase());
}

/** Claude tool-use reading of a form turn, and routing that reading off search. */
export function formToolsEnabled(): boolean {
  return envFlag("FORM_TOOLS_ENABLED");
}

/** Keyword + vector fusion via match_knowledge_chunks_hybrid. */
export function hybridSearchEnabled(): boolean {
  return envFlag("HYBRID_SEARCH_ENABLED");
}

/** Haiku reading of a short follow-up before retrieval. */
/**
 * A follow-up that names its own documents or nouns ("The I-9 and W-4
 * forms, direct deposit agreements") is searched on them when the
 * retrieval rewrite kept none of them and searched only the earlier turn's
 * subject ("Employment Verification"). Off, the rewritten query is searched
 * as it is. Same name in both apps. Default off.
 */
export function followupNewTopicRetrievalEnabled(): boolean {
  return envFlag("FOLLOWUP_NEW_TOPIC_RETRIEVAL_ENABLED");
}

export function queryRewriteEnabled(): boolean {
  return envFlag("QUERY_REWRITE_ENABLED");
}

/** Extra system-prompt rules for name, payroll, and a chosen corrective action. */
export function chatStyleRulesEnabled(): boolean {
  return envFlag("CHAT_STYLE_RULES_ENABLED");
}

/** Write one chat_traces row per turn. Off leaves the table untouched. */
export function chatTraceEnabled(): boolean {
  return envFlag("CHAT_TRACE_ENABLED");
}

/**
 * Top-N keyword and vector candidates with no similarity floor, fuzzy
 * section titles, and a Haiku pick. Off keeps the existing cutoff.
 */
export function retrievalRecallEnabled(): boolean {
  return envFlag("RETRIEVAL_RECALL_ENABLED");
}

/**
 * Send a longer history window plus a stored summary of older turns.
 * Off keeps the last 10 messages.
 */
export function longContextEnabled(): boolean {
  return envFlag("LONG_CONTEXT_ENABLED");
}

/**
 * Read-only review and report tools, and the password-reset help text.
 * Off leaves both off the answer.
 */
export function chatDataToolsEnabled(): boolean {
  return envFlag("CHAT_DATA_TOOLS_ENABLED");
}

/**
 * A corrective action may be created when no prior coaching form is in the
 * app. Off, the existing intake still treats that history as required.
 */
export function priorCoachingOptionalEnabled(): boolean {
  return envFlag("PRIOR_COACHING_OPTIONAL_ENABLED");
}

/**
 * Carry a store, employee name, or job title from anywhere in the
 * conversation onto the current turn, including a persisted conversation
 * form state. Off, the proposal reads the turn exactly as it does today.
 */
export function slotRetentionEnabled(): boolean {
  return envFlag("SLOT_RETENTION_ENABLED");
}

/**
 * Restate a month-day the date reader skips, and a payroll amount it
 * skips, in a shape that reader already accepts. Off, those words are
 * left as typed.
 */
export function fieldAccuracyEnabled(): boolean {
  return envFlag("FIELD_ACCURACY_ENABLED");
}

/**
 * A resent create for the same employee, form, and incident reopens that
 * draft. A different incident does not. Off, a new card still files a new
 * draft, and the existing card-id match is unchanged.
 */
export function draftDedupeEnabled(): boolean {
  return envFlag("DRAFT_DEDUPE_ENABLED");
}

/**
 * A follow-up or second document is not revised into the form on screen.
 * Off, the open form keeps the revision path it has now.
 */
export function secondFormEnabled(): boolean {
  return envFlag("SECOND_FORM_ENABLED");
}

/**
 * Write a JBA Policy Manual name and printed page onto a coaching form
 * (and an empty Corrective Action policy line) from retrieved sections.
 * Off, those fields are written exactly as they are today.
 */
export function policyCitationEnabled(): boolean {
  return envFlag("POLICY_CITATION_ENABLED");
}

/**
 * Per-user memory tools and the recalled-memory prompt block.
 * Off, nothing is read or written and the prompt is unchanged.
 */
export function chatMemoryEnabled(): boolean {
  return envFlag("CHAT_MEMORY_ENABLED");
}

/**
 * Grouped Comp Report, Sales Totals, and review breakdowns.
 * Off, chat keeps the existing one-block data read.
 */
export function reportBreakdownEnabled(): boolean {
  return envFlag("REPORT_BREAKDOWN_ENABLED");
}

/**
 * The corrective-action plan must be exactly two sentences. Off, the
 * existing builder's text is stored as it is.
 */
export function actionPlanSentencesEnabled(): boolean {
  return envFlag("ACTION_PLAN_SENTENCES_ENABLED");
}

/**
 * Edits merge into a draft's existing fields. An empty edit does not blank
 * Offense or the Action Plan. Off, a draft write replaces fields as it does today.
 */
export function draftEditMergeEnabled(): boolean {
  return envFlag("DRAFT_EDIT_MERGE_ENABLED") || envFlag("DRAFT_MERGE_ENABLED");
}

/**
 * An employee, store, or policy counts only when it resolves against the
 * Woven roster, the store list, or the JBA manual. Off, a typed name is
 * accepted exactly as it is today.
 */
export function groundedEntitiesEnabled(): boolean {
  return envFlag("GROUNDED_ENTITIES_ENABLED");
}

/**
 * Read and write the per-conversation form state before asking again.
 * Off, nothing is read or written and the question is unchanged.
 */
export function formStateEnabled(): boolean {
  return envFlag("FORM_STATE_ENABLED");
}

/**
 * One tool call reads the form slots, then only the ones the roster, the
 * store list, or the manual headings confirm are kept. Off, the question
 * is unchanged and nothing is read or written.
 */
export function intentExtractionEnabled(): boolean {
  return envFlag("INTENT_EXTRACTION_ENABLED");
}

/**
 * Similar 5-star exchanges in the system prompt. Off, nothing is read and
 * the prompt is unchanged.
 */
export function fewShotExamplesEnabled(): boolean {
  return envFlag("FEWSHOT_EXAMPLES_ENABLED");
}

/**
 * After an answer: the citation is in the retrieved JBA chunks, an action
 * plan is two sentences, and a named employee is on the Woven roster. One
 * repair if a check fails. Off, the answer is unchanged and the model is
 * not called.
 */
export function selfCheckEnabled(): boolean {
  return envFlag("SELF_CHECK_ENABLED");
}

/** Same switch as `draftEditMergeEnabled`. The sibling app's variable name. */
export function draftMergeEnabled(): boolean {
  return draftEditMergeEnabled();
}

/**
 * A name the manager typed is the name on the form. Off, a close roster
 * match still asks "Did you mean", and a state or a document title can
 * still be offered as a person. On, one close roster name is a short note
 * under the card ("Woven has Jane Doe"), not a question and not a block.
 * The card in that same turn uses the typed spelling. No note when nothing
 * on the roster is close. Two different close matches are still a question.
 */
export function typedNameEnabled(): boolean {
  return envFlag("TYPED_NAME_ENABLED");
}

/**
 * Replay anti-loop. Off, chat is unchanged. On, a repeated failure is handled
 * in code: the model does not write the employee, an unmatched name is kept,
 * slots already stored are not cleared, the store is not a question, there is
 * no "Did you mean", a close name is the under-card note, roster refusals and
 * validator text are not shown, dates on the card are ISO, and a policy's
 * page comes from the manual's printed-page map.
 */
export function antiLoopEnabled(): boolean {
  return envFlag("ANTI_LOOP_ENABLED");
}

/**
 * A citation is checked against the page the manual prints. Off, the PDF
 * sheet number is still accepted. On, only `printedPage` counts.
 */
export function printedPageOnlyEnabled(): boolean {
  return envFlag("PRINTED_PAGE_ONLY_ENABLED");
}

/**
 * A Corrective Action line for the payroll amount, immediately after the
 * Yes/No question. The seed document includes the line. It is not published
 * to the database from this change. Off, chat does not ask for an amount and
 * does not fill one. On, the line is filled only from an amount the manager
 * stated — a figure in the cited policy is never written into it, and the
 * action plan does not repeat it.
 */
export function payrollDeductAmountFieldEnabled(): boolean {
  return envFlag("PAYROLL_DEDUCT_AMOUNT_ENABLED");
}

/**
 * For a corrective-action or policy question, prefer the current JBA Policy
 * Manual and the section a synonym names. Off, retrieval order is unchanged.
 */
export function caPolicyRetrievalEnabled(): boolean {
  return envFlag("CA_POLICY_RETRIEVAL_ENABLED");
}

/**
 * An open draft for the same employee, template, and incident date is reused
 * even when another chat or another manager started it. Off, only the
 * card-id match and DRAFT_DEDUPE_ENABLED run.
 */
export function crossChatDraftDedupeEnabled(): boolean {
  return envFlag("CROSS_CHAT_DRAFT_DEDUPE_ENABLED");
}

/**
 * A previous, prior, or past coaching question omits drafts. A question that
 * asks for drafts still lists them. Off, drafts stay in the list, labelled
 * as not finalized.
 */
export function priorRecordFinalOnlyEnabled(): boolean {
  return envFlag("PRIOR_RECORD_FINAL_ONLY_ENABLED");
}

/**
 * A global-scope account that is not an admin, owner, or developer is asked
 * once which store the form is for. The question is added after the create
 * sentence, and the card stays ready. A store named in the same message, on
 * an earlier turn, by a reviewed nickname, or as one in-scope typo is used
 * and is not asked again. Off, the existing "covers every store" copy is
 * unchanged, and a typo is still confirmed before it is used.
 */
export function globalStoreAskEnabled(): boolean {
  return envFlag("GLOBAL_STORE_ASK_ENABLED");
}

/**
 * When Woven publishes a revised document, keep the newest edition and
 * leave older editions out of search. A superseded knowledge document is
 * not re-indexed or re-activated: the same Woven record stays off, and a
 * re-filed copy of its content hash stays off. Identical sections from two
 * current copies collapse to one citation. Off, a sync still indexes every
 * current Woven copy, including an older edition of the same document.
 */
export function editionSupersessionEnabled(): boolean {
  return envFlag("EDITION_SUPERSESSION_ENABLED");
}

/**
 * Cache the static system prompt. Off, the answering call sends one system
 * string and does not set a cache breakpoint.
 */
export function promptCacheEnabled(): boolean {
  return envFlag("PROMPT_CACHE_ENABLED");
}

/**
 * One extraction over the whole conversation fills the form. A field is
 * written only from the manager's words, a later edit replaces it, and a
 * blank required field is asked once. Off, the existing form path is used.
 */
export function formFullRemapEnabled(): boolean {
  return envFlag("FORM_FULL_REMAP_ENABLED");
}

/**
 * The remap path's What happened, prior actions and policy, read from the
 * manager's words and the manual. The request ("create a corrective action
 * form for …") is not the incident and not the action plan. "previous
 * coaching: …" is the prior-action list. A policy is "as you said" only
 * when the manager named it; otherwise the manual section and printed page
 * the account resolves are cited on the card. Off, the remap reads these
 * fields as before.
 */
export function remapIncidentFixEnabled(): boolean {
  return envFlag("REMAP_INCIDENT_FIX_ENABLED");
}

/**
 * Put the current brand manual in a cached system block for a policy
 * question. Off, retrieval and citation display stay as they are.
 *
 * On, the manual is rebuilt from indexed chunks in order. Each page is
 * marked with the number printed in the manual. Contents pages 3–6 are
 * left out. An unbranded question includes every brand in that manual.
 * A manual over the token budget is not sent, and retrieval stands.
 * After the answer, each cited section becomes a source on its printed
 * page. A page the manual does not contain is removed. An [S#] that is
 * not one of the sources shown is removed. An answer with no valid page
 * falls back to ordinary retrieval.
 */
export function fullManualContextEnabled(): boolean {
  return envFlag("FULL_MANUAL_CONTEXT_ENABLED");
}

/**
 * A policy or document phrase is not a place. Off, the store reader is
 * unchanged. On, a span that names a policy, manual, section or similar
 * document ("in the workplace policy") is never read as a typed store, and
 * a span-before-"store" match must sit inside one manager turn, so "cite
 * animals in the workplace policy" followed by "store location is …" does
 * not become "the workplace policy store". Also on, a field label is a place
 * cue and the newest turn's store replaces the saved one: "location kearney"
 * after "store is grand island" is Kearney (ported from the sibling app, QA Round 4).
 */
export function placeSpanGuardEnabled(): boolean {
  return envFlag("PLACE_SPAN_GUARD_ENABLED");
}

/**
 * The warning level kept for a Corrective Action is only one the manager
 * stated: read from their own turns, never from Ask Bubbles' ("the warning
 * level, verbal or written" is not a level), never from the slot model's
 * guess, and a bare "Yes" only where the assistant turn just before it asked
 * one yes/no question about that exact level. A bare Yes/No right after "Is
 * payroll deduct applicable?" is kept as the payroll answer before the stored
 * slots are put ahead of it. Off, the intent reading grounds both as it does
 * today. Ported from the sibling app.
 */
export function warningLevelManagerOnlyEnabled(): boolean {
  return envFlag("WARNING_LEVEL_MANAGER_ONLY_ENABLED");
}

/**
 * The intent read takes a payroll amount and the Yes/No only from the
 * manager's own turns. A figure the assistant quoted from policy ("reimburse
 * the company $25 via payroll deduction") is not an amount, and "verbal, no
 * payroll" is No (conv_mvmf4x1i2qxha7u, 24 Oct 2026). Off, every turn is
 * read for an amount, as before.
 */
export function intentPayrollManagerOnlyEnabled(): boolean {
  return envFlag("INTENT_PAYROLL_MANAGER_ONLY_ENABLED");
}

/**
 * Words that are not a person never become the employee: a placeholder
 * ("blank", "n/a", "unknown"), a phrase that starts with a verb ("require
 * practice"), a word of the brand or a report, a place on the store roster,
 * and the app's own lines and lists (the stored "Policy reference: …" line,
 * an assistant reply, a bulleted or priced offer list). Ported from Ask
 * Sunny. Off, the readers take names as they do today.
 */
export function notANameGuardEnabled(): boolean {
  return envFlag("NOT_A_NAME_GUARD_ENABLED");
}

/**
 * The job title and what happened are read only from the manager's own
 * words. The lines the app writes onto the question ("Job title: CA. It
 * happened at Kearney, NE.") are not read as what the manager said, a pasted
 * policy is not their title, and a turn that only names the employee or says
 * where they work is not what happened (ported from the sibling app). Off, every
 * reader is unchanged.
 */
export function managerWordsOnlyEnabled(): boolean {
  return envFlag("MANAGER_WORDS_ONLY_ENABLED");
}

/**
 * One draft per form in a conversation. A new card for the same form and
 * employee in the same chat opens the draft this chat already made, unless a
 * manager turn since that draft asked for another document. Off, every new
 * card creates as it does today.
 */
export function conversationDraftReuseEnabled(): boolean {
  return envFlag("CONVERSATION_DRAFT_REUSE_ENABLED");
}

/**
 * DRAFT_REUSE_SAME_CHAT_ONLY_ENABLED: an open draft is reused only when this
 * chat made it, for the same employee, form and incident or date. A card
 * dated differently from the chat's own draft makes a new draft, and a reuse
 * says so on the card ("Updated your open draft from <date>"). A draft from
 * another chat is never reopened, so it is never overwritten (QA, B18–B20,
 * 25 Oct 2026). Off, every lookup is as it was.
 */
export function draftReuseSameChatOnlyEnabled(): boolean {
  return envFlag("DRAFT_REUSE_SAME_CHAT_ONLY_ENABLED");
}

/**
 * "Delete that draft" deletes the draft on screen where the manager may
 * delete forms (the forms API's own rule), and says truthfully who can where
 * they may not; "same incident", answering "is this the same incident as the
 * <form> for <name>?", opens that form instead of asking for a phrase to type
 * (ported from the sibling app, QA F8). Off, both turns are answered as before.
 */
export function draftActionsEnabled(): boolean {
  return envFlag("DRAFT_ACTIONS_ENABLED");
}

/**
 * A late opening, read as one (QA, 24 Oct 2026; ported from the sibling app).
 * "late to open 10-19" is the manual's Late Opening section and is dated 19
 * October: a yearless dashed month-day after a date cue is a date (the most
 * recent one, never a future day), the newest date the manager states dates
 * the form, "opened late" and "late to open" are Late Opening, and "payroll
 * deduct is not applicable" is No in the saved state. Off, as before.
 */
export function lateOpenDateEnabled(): boolean {
  return envFlag("LATE_OPEN_DATE_ENABLED");
}

/**
 * A request to start a corrective action ("create a Verbal CA for …", "I need
 * a CA for someone opening the store late") is the Corrective Action Form
 * when the intent read has no model reading. The template reader calls that
 * request the progression, and the intent slots used to keep no form for it,
 * so the next answer ("verbal", "no payroll") was not a form turn (QA F4,
 * 24 Oct 2026). A metric with no behaviour stays the progression, as in the
 * form proposal. Off, the form slot is left as before.
 */
export function caTemplateMapEnabled(): boolean {
  return envFlag("CA_TEMPLATE_MAP_ENABLED");
}

/**
 * The form is the one the manager named in their own words, newest turn
 * first. The model's formType, the assistant's "**Corrective Action Form**"
 * and the state lines never pick it, and a "Policy reference:" line is not a
 * form request. "Disciplinary Action" (the discipline procedure) is never the
 * violated policy. Ported from the sibling app (QA, 24 Oct 2026: coaching and
 * Policy Review requests became a Corrective Action). Off, the form is read
 * as before.
 */
export function formChoiceStatedEnabled(): boolean {
  return envFlag("FORM_CHOICE_STATED_ENABLED");
}

/**
 * Prior actions read the way managers write them. A list after "received …
 * coaching 9/8" keeps its later comma items that name a step; "prior verbal
 * 9-1-26" and "Her prior coaching is her policy manual acknowledgement on
 * 9/01" are earlier steps; a date governed by "previous / prior / coached /
 * jba manual / policy manual acknowledgement" never dates the form; and an
 * action plan that is only the history label is dropped. Off, the readers
 * are unchanged.
 */
export function priorActionsParseEnabled(): boolean {
  return envFlag("PRIOR_ACTIONS_PARSE_ENABLED");
}

/**
 * Keep other conversations out of the reply text. The person-memory recall
 * quotes another chat only when the manager refers back to it ("again", "last
 * time", "like before", "same as …"); a name read from a turn that is only
 * that name ("asdasd") is recalled only when it is on the roster; the prompt
 * labels the block as records from other conversations; and a reply sentence
 * that still says the manager raised or sent something in another chat or on
 * another date is taken out. Ported from the sibling app (QA, 24 Oct 2026). Off,
 * recall and the reply are exactly as before.
 */
export function crossChatReplyGuardEnabled(): boolean {
  return envFlag("CROSS_CHAT_REPLY_GUARD_ENABLED");
}

/**
 * A reading note beside the JBA Policy Manual p.19 cell-phone sentence when
 * the grounding holds it: "not in back pockets, charging in the break room,
 * or sitting on top of a drawer till" lists three places the phone may NOT
 * be (conv_mvnoscyz200gtat, QA 25 Oct 2026). The note goes in the per-turn
 * grounding block, never in the manual text or the cached manual prefix.
 * Off, the grounding is exactly as before.
 */
export function manualNegatedListNoteEnabled(): boolean {
  return envFlag("MANUAL_NEGATED_LIST_NOTE_ENABLED");
}

/**
 * An edit typed in chat is applied to its field or answered, and dates follow
 * the incident (QA history replay, 25 Oct 2026; the same flag as the sibling
 * app). "change observation of offense to: …" replaces What happened with the
 * manager's text; "add that …" appends their clause; "clean up my grammar" and
 * "change the date to …" never become What happened. "X instead of Y" names
 * X. A prior action's date is never the form's Date, and "today" dates the
 * form today. "can you edit the form I already finalized" opens it as a
 * revision. Off, every reader is as before.
 */
export function formEditDateRulesEnabled(): boolean {
  return envFlag("FORM_EDIT_DATE_RULES_ENABLED");
}

/**
 * The Corrective Action Form's Action Plan is the manager's, or blank (Pau,
 * 25 Oct 2026). A plan they typed ("action plan: …") goes on the card and the
 * form word for word. With none typed, nothing is written: no "Management
 * will review …" sentence, no closing, no model summary. Off, the plan is
 * built as it is today.
 */
export function actionPlanManagerOnlyEnabled(): boolean {
  return envFlag("ACTION_PLAN_MANAGER_ONLY_ENABLED");
}

/**
 * The form's employee stays the employee. A person the manager's account
 * mentions ("onboarding with new hire Test Newhire") does not replace them on
 * a later turn, and a bare first name ("test") keeps the fuller name already
 * on the form (ported from the sibling app, QA round 10). Here: the full
 * remap's own name reading, used when the model's name is not in the
 * manager's words, sets the employee from a passing mention only when there
 * is none yet. And the name the manager typed is the employee: "for Test
 * Employee" is Test Employee, not "Test" ("Employee" is a form word to the
 * name readers), on the full remap, the proposal flow and the intent reading
 * (ported from the sibling app, QA 25 Oct 2026). A lower-case "an employee"
 * or "my employee" is still nobody's name. Off, the latest name read wins
 * and the name is read as before.
 */
export function keepFormEmployeeEnabled(): boolean {
  return envFlag("KEEP_FORM_EMPLOYEE_ENABLED");
}

/**
 * A directory title counts as stated only as a whole word, and a short
 * all-capitals title only as the manager typed it ("1 hr late" is an hour).
 * A title the slot model typed is kept only when the manager's words carry
 * it. Ported from the sibling app (QA round 10, where "throught the rest"
 * contained a two-letter directory title). Off, the intent reading grounds
 * the title as before.
 */
export function titleWholeWordEnabled(): boolean {
  return envFlag("TITLE_WHOLE_WORD_ENABLED");
}

/**
 * Finalized-form edits carry a reason and a revision number, and the
 * revision chain shows: "Revised <date> (supersedes <ref>)" on a revision and
 * "Superseded <date> by <ref>" on the original, on the PDF and the form view,
 * plus "Revision N of <ref>" with a link to the previous version.
 *
 * Off (the default) leaves the shipped revise flow exactly as it is: no
 * reason is asked for or recorded, the history route answers 404, and the
 * PDF footer is byte-identical. On, the server refuses an edit of a
 * finalized form that gives no reason.
 *
 * The browser reads `NEXT_PUBLIC_FORM_REVISIONS_ENABLED` (see
 * `formRevisionsUiEnabled`). Turn both on together: the server refuses an
 * edit without a reason, and only the browser flag shows the reason dialog.
 * Either spelling turns the server side on.
 */
export function formRevisionsEnabled(): boolean {
  return envFlag("FORM_REVISIONS_ENABLED") || envFlag("NEXT_PUBLIC_FORM_REVISIONS_ENABLED");
}

/**
 * The browser half of `formRevisionsEnabled`: the reason dialog, the marks
 * and the history on the form card, the form page and the register row.
 * Next inlines only a statically written `process.env.NEXT_PUBLIC_*` name
 * into a client bundle, so the name is written out here.
 */
export function formRevisionsUiEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_FORM_REVISIONS_ENABLED;
  return typeof raw === "string" && ON.has(raw.trim().toLowerCase());
}

/**
 * The exit form's intake reads what the manager typed (live QA, 25 Oct 2026).
 * A Details answer ("items returned") or the Permanent Address the manager
 * typed is never offered as the employee; "change the reason for resignation
 * to: …" replaces the reason; a yearless "last day 10-24" is the most recent
 * 24 October; the Permanent Address is read; and "did not call in for her
 * last two shifts" is No Call No Show. Same name in the sibling app. Off, the
 * exit readers read as before.
 */
export function exitIntakeFixEnabled(): boolean {
  return envFlag("EXIT_INTAKE_FIX_ENABLED");
}

/**
 * A reformat turn keeps the sources of the answer it reformats. "Make this a
 * downloadable document", "put that in a table", "summarize that" is searched
 * again with the question the previous answer was written for, and those rows
 * go first, so the reply does not "correct" claims whose sources it can no
 * longer see. Removing [S#] markers also never leaves their grammar behind
 * ("two markers, and, that"). Ported from the sibling app. Off, retrieval and
 * marker stripping are as before.
 */
export function reformatKeepsSourcesEnabled(): boolean {
  return envFlag("REFORMAT_KEEPS_SOURCES_ENABLED");
}

/**
 * The coaching framework covers an issue it does not name. With the framework
 * among the sources, the prompt tells the model to answer from its general
 * sections (root cause, performance vs behavior, conversation structure), cite
 * them, and say only that no section names this exact issue, instead of "the
 * knowledge base does not have it" (QA, conv_mvb28ztb85z53mc). Off, the
 * prompt is byte-for-byte as before.
 */
export function frameworkGeneralSectionsEnabled(): boolean {
  return envFlag("FRAMEWORK_GENERAL_SECTIONS_ENABLED");
}

/**
 * A question is answered, never routed into a form (P0, live replay 25 Oct
 * 2026: "what policy does that fall under?" was written into the open card's
 * What happened). On, a turn `question-not-form.ts` reads as a question skips
 * the slot reader, the remap, the proposal and the open-form correction and
 * revision paths, and is answered. Off, every turn is routed as before. The
 * same flag as in the sibling app.
 */
export function questionNotFormEnabled(): boolean {
  return envFlag("QUESTION_NOT_FORM_ENABLED");
}

/**
 * The exit form's How Employee Resigned line also reads a resignation the
 * manager says was given verbally ("she told me verbally", "verbal notice"),
 * as "Verbal" (Pau's decision, 25 Oct 2026, ported from the sibling app). A
 * bare "she resigned" still leaves the line blank, and "verbal warning" is
 * never a method. Off, the methods read are exactly as before.
 */
export function resignMethodFollowupEnabled(): boolean {
  return envFlag("RESIGN_METHOD_FOLLOWUP_ENABLED");
}

/**
 * The Performance Management Framework document is not pinned into a
 * governed form's drafting prompt (QA, 25 Oct 2026). The uploaded framework
 * text still carries the sibling company's examples, metrics and name, and
 * the governed-form draft pinned up to sixteen of its sections. On, a
 * governed form drafts without the framework's sections: the document is not
 * read, its absence does not withhold the draft, and the app's own
 * escalation rules (lowest rung, no termination, demotion or suspension,
 * leave the step unset) still apply. Off, the sections are pinned as before.
 */
export function frameworkUnpinEnabled(): boolean {
  return envFlag("FRAMEWORK_UNPIN_ENABLED");
}

/**
 * The composer's reading of CHAT_LONG_MESSAGE_ENABLED. Only a statically
 * written `process.env.NEXT_PUBLIC_*` name reaches a client bundle, so the
 * browser reads the public twin and nothing else. Off, the composer renders
 * and sends exactly as it did.
 */
export function chatLongMessageClientEnabled(): boolean {
  const inlined = process.env.NEXT_PUBLIC_CHAT_LONG_MESSAGE_ENABLED;
  return typeof inlined === "string" && ON.has(inlined.trim().toLowerCase());
}

/**
 * A chat message may be up to 12,000 characters instead of 4,000
 * (`LONG_MESSAGE_LIMIT` in `lib/chat/message-limit.ts`). Over the limit the
 * route returns a 400 that says how long the message is; nothing is cut. An
 * earlier turn in the history over `LIMITS.historyMessage` is refused with a
 * 400 instead of being shortened. Off (the default), the route keeps the
 * 4,000-character check, its wording and the history slice exactly as they
 * are.
 *
 * The composer is a client component, so the browser reads
 * `NEXT_PUBLIC_CHAT_LONG_MESSAGE_ENABLED`, written out statically for Next
 * to inline. The server reads either spelling, so a deployment that sets
 * only the public name never shows a 12,000 limit the route refuses.
 */
export function chatLongMessageEnabled(): boolean {
  const inlined = process.env.NEXT_PUBLIC_CHAT_LONG_MESSAGE_ENABLED;
  return (
    envFlag("CHAT_LONG_MESSAGE_ENABLED") ||
    envFlag("NEXT_PUBLIC_CHAT_LONG_MESSAGE_ENABLED") ||
    (typeof inlined === "string" && ON.has(inlined.trim().toLowerCase()))
  );
}

/**
 * A full-remap card names the manager's turns it was read from (QA H1, 25 Oct
 * 2026), so Create draft prefills the form from them instead of filing it
 * blank. Off, the remap card names no turns, as before. See
 * `lib/ai/remap-draft-sources.ts`.
 */
export function remapDraftSourcesEnabled(): boolean {
  return envFlag("REMAP_DRAFT_SOURCES_ENABLED");
}

/**
 * The browser's reading of REMAP_DRAFT_SOURCES_ENABLED, for the Create step
 * (`chat/create-inline-form.ts`): a draft whose notes are empty is written
 * from the card's own lines only with this on. Only a statically written
 * `process.env.NEXT_PUBLIC_…` is inlined by Next, so it is read here, not
 * through `envFlag`. Off, a card with no usable turns files a blank draft and
 * says so, as before.
 */
export function remapDraftSourcesClientEnabled(): boolean {
  const inlined = process.env.NEXT_PUBLIC_REMAP_DRAFT_SOURCES_ENABLED;
  return typeof inlined === "string" && ON.has(inlined.trim().toLowerCase());
}

/**
 * The form's date is the incident date the manager stated, or the day the
 * form is created — never a deadline, due date, assignment date, prior-action
 * date or a "by <date>" (Pau's coordinator, 25 Oct 2026, D3). Off, the date
 * readers keep main's reading.
 */
export function formDateIncidentOnlyEnabled(): boolean {
  return envFlag("FORM_DATE_INCIDENT_ONLY_ENABLED");
}

/**
 * A new form asked for is never read as "show me the form on file" (QA B22,
 * 25 Oct 2026, both apps): "… for no call no show on 10/22" read "show" as
 * the verb and put another chat's corrective action back in the thread. On,
 * incident phrases that contain a reopen verb ("no call no show", "didn't
 * show up") are not read as one, and a turn that opens by asking for a
 * document ("Draft a …", "Write up …", "I need a …") is never a reopen. Off,
 * the reopen reading is exactly as before.
 */
export function reopenVerbGuardEnabled(): boolean {
  return envFlag("REOPEN_VERB_GUARD_ENABLED");
}

/**
 * A terse "ca <name> <store> <what happened> <date> verbal" line is written
 * out as the long form before it is read, so the name, store, date, warning
 * level and payroll amount are read as from a full sentence, and the card
 * appears (conv_mvofim8a2lqx6jn, 25 Oct 2026; ported from the sibling app).
 * See `ai/terse-slots.ts`. Off, the turn is read as typed.
 */
export function terseSlotReadEnabled(): boolean {
  return envFlag("TERSE_SLOT_READ_ENABLED");
}

/**
 * The exit form's chat prose and Additional Details say only what is true
 * (QA, 25 Oct 2026): the Date line shows the card's date when it has one, not
 * "the day the draft is created"; Additional Details is never promised as "a
 * short account drafted from what you've described" when nothing was
 * described; and a drafted Details sentence about working the notice or
 * calling in survives only when the manager raised it. Off, as before.
 */
export function exitProseFactsEnabled(): boolean {
  return envFlag("EXIT_PROSE_FACTS_ENABLED");
}

/**
 * Chat answers never repeat a default-password format or Social Security
 * digits from the knowledge base (QA P0, 25 Oct 2026; same flag in both
 * apps). The sentence is taken out of the excerpts the model is given and of
 * the reply and its cited excerpts, and the person is told to ask their
 * manager or HR to reset it. Knowledge rows are not changed. Off, the text is
 * as retrieved.
 */
export function sensitiveDefaultsRedactEnabled(): boolean {
  return envFlag("SENSITIVE_DEFAULTS_REDACT_ENABLED");
}

/**
 * "I forgot my password" (any spelling) is answered about this app first:
 * click "Forgot your password?" on the log-in screen (QA and Pau, 25 Oct
 * 2026; same flag in both apps). Another system is talked about only when
 * the manager names it. Off, the turn is answered as before.
 */
export function appPasswordHelpEnabled(): boolean {
  return envFlag("APP_PASSWORD_HELP_ENABLED");
}

/**
 * A source excerpt shown under an answer never quotes the sibling company's
 * lines (QA, 25 Oct 2026, B22-4). The JBA Policy Manual covers every brand;
 * a question that names no brand reads the whole manual, and the excerpt cut
 * from that reading quoted another company's peak-season PTO bullet. On, a
 * line, bullet or sentence of a multi-brand manual's excerpt that names a
 * brand in `EXCERPT_HIDDEN_BRANDS` (`config/company/knowledge.ts`) is left
 * out before the excerpt is cut; what is kept is verbatim. Retrieval,
 * ranking, the prompt, page numbers and titles are unchanged. Off, excerpts
 * are built exactly as before.
 */
export function excerptBrandFilterEnabled(): boolean {
  return envFlag("EXCERPT_BRAND_FILTER_ENABLED");
}

/**
 * A Google review question gets the Google Reviews page's month-to-date
 * figures, goal and pace for the caller's stores, and only with View reports.
 * Off, review questions keep the existing path. Ported from the sibling app (QA T11).
 */
export function googleReviewsInChatEnabled(): boolean {
  return envFlag("GOOGLE_REVIEWS_IN_CHAT_ENABLED");
}

/**
 * A Corrective Action or coaching draft is never filed blank (production, 26
 * Oct 2026: `drafted` with no fields and nothing rejected, from Create clicks
 * fired several at once). The model's tool call is read when its `values` /
 * `checked` came back JSON-encoded, one object per section, keyed by label,
 * or with a single option as text; a model call that threw (429, 529,
 * overloaded), answered with no tool call, or left no narrative although the
 * notes hold an account is tried again up to twice (after 1 s, then 3 s), as
 * is a failed framework read; if it is still empty, the Observation is the
 * manager's own incident clause (the card's "Issue"). Every reason goes on a
 * drafted event, with `{"fallback": "manager_words"}` where used. See
 * `forms/draft-never-blank.ts`. Off, the draft route is unchanged.
 */
export function draftNeverBlankEnabled(): boolean {
  return envFlag("DRAFT_NEVER_BLANK_ENABLED");
}

/**
 * NAME_BEFORE_TITLE_ENABLED (QA, 26 Oct 2026): "ca for <first> <last>, team member at
 * <store>" in lowercase left the Employee unread, and "for <First> <Last> Team
 * Member at <store>" dropped the surname. A two-word name right before a job
 * title is read as the name, with the title after a comma. See
 * `ai/name-before-title.ts`. Off, the turn is read as typed.
 */
export function nameBeforeTitleEnabled(): boolean {
  return envFlag("NAME_BEFORE_TITLE_ENABLED");
}

export const CHAT_QUALITY_FLAG_NAMES = [
  "SLOT_RETENTION_ENABLED",
  "FIELD_ACCURACY_ENABLED",
  "DRAFT_DEDUPE_ENABLED",
  "SECOND_FORM_ENABLED",
  "POLICY_CITATION_ENABLED",
  "RETRIEVAL_RECALL_ENABLED",
  "HYBRID_SEARCH_ENABLED",
  "QUERY_REWRITE_ENABLED",
  "PRIOR_COACHING_OPTIONAL_ENABLED",
  "CHAT_DATA_TOOLS_ENABLED",
  "REPORT_BREAKDOWN_ENABLED",
  "FORM_TOOLS_ENABLED",
  "CHAT_STYLE_RULES_ENABLED",
  "CHAT_TRACE_ENABLED",
  "LONG_CONTEXT_ENABLED",
  "CHAT_MEMORY_ENABLED",
  "ACTION_PLAN_SENTENCES_ENABLED",
  "ANTI_LOOP_ENABLED",
  "DRAFT_EDIT_MERGE_ENABLED",
  "DRAFT_MERGE_ENABLED",
  "GROUNDED_ENTITIES_ENABLED",
  "FORM_STATE_ENABLED",
  "INTENT_EXTRACTION_ENABLED",
  "FEWSHOT_EXAMPLES_ENABLED",
  "SELF_CHECK_ENABLED",
  "TYPED_NAME_ENABLED",
  "PRINTED_PAGE_ONLY_ENABLED",
  "PAYROLL_DEDUCT_AMOUNT_ENABLED",
  "CA_POLICY_RETRIEVAL_ENABLED",
  "CROSS_CHAT_DRAFT_DEDUPE_ENABLED",
  "PRIOR_RECORD_FINAL_ONLY_ENABLED",
  "GLOBAL_STORE_ASK_ENABLED",
  "EDITION_SUPERSESSION_ENABLED",
  "PROMPT_CACHE_ENABLED",
  "FORM_FULL_REMAP_ENABLED",
  "FULL_MANUAL_CONTEXT_ENABLED",
  "PLACE_SPAN_GUARD_ENABLED",
  "WARNING_LEVEL_MANAGER_ONLY_ENABLED",
  "INTENT_PAYROLL_MANAGER_ONLY_ENABLED",
  "NOT_A_NAME_GUARD_ENABLED",
  "MANAGER_WORDS_ONLY_ENABLED",
  "CONVERSATION_DRAFT_REUSE_ENABLED",
  "DRAFT_ACTIONS_ENABLED",
  "LATE_OPEN_DATE_ENABLED",
  "CA_TEMPLATE_MAP_ENABLED",
  "FORM_CHOICE_STATED_ENABLED",
  "REMAP_INCIDENT_FIX_ENABLED",
  "PRIOR_ACTIONS_PARSE_ENABLED",
  "CROSS_CHAT_REPLY_GUARD_ENABLED",
  "FOLLOWUP_NEW_TOPIC_RETRIEVAL_ENABLED",
  "ACTION_PLAN_MANAGER_ONLY_ENABLED",
  "KEEP_FORM_EMPLOYEE_ENABLED",
  "TITLE_WHOLE_WORD_ENABLED",
  "EXIT_INTAKE_FIX_ENABLED",
  "MANUAL_NEGATED_LIST_NOTE_ENABLED",
  "FORM_REVISIONS_ENABLED",
  "NEXT_PUBLIC_FORM_REVISIONS_ENABLED",
  "REFORMAT_KEEPS_SOURCES_ENABLED",
  "FRAMEWORK_GENERAL_SECTIONS_ENABLED",
  "FORM_EDIT_DATE_RULES_ENABLED",
  "QUESTION_NOT_FORM_ENABLED",
  "DRAFT_REUSE_SAME_CHAT_ONLY_ENABLED",
  "RESIGN_METHOD_FOLLOWUP_ENABLED",
  "FRAMEWORK_UNPIN_ENABLED",
  "CHAT_LONG_MESSAGE_ENABLED",
  "NEXT_PUBLIC_CHAT_LONG_MESSAGE_ENABLED",
  "REMAP_DRAFT_SOURCES_ENABLED",
  "NEXT_PUBLIC_REMAP_DRAFT_SOURCES_ENABLED",
  "FORM_DATE_INCIDENT_ONLY_ENABLED",
  "REOPEN_VERB_GUARD_ENABLED",
  "TERSE_SLOT_READ_ENABLED",
  "POLICY_SPECIFIC_TOPICS_ENABLED",
  "EXIT_PROSE_FACTS_ENABLED",
  "SENSITIVE_DEFAULTS_REDACT_ENABLED",
  "APP_PASSWORD_HELP_ENABLED",
  "INCIDENT_CLAUSE_SPLIT_ENABLED",
  "EXCERPT_BRAND_FILTER_ENABLED",
  "STATE_CODE_NOT_A_PERSON_ENABLED",
  "GOOGLE_REVIEWS_IN_CHAT_ENABLED",
  "DRAFT_NEVER_BLANK_ENABLED",
  "NAME_BEFORE_TITLE_ENABLED",
  "LATE_OPEN_PAYROLL_FROM_FORM_ENABLED",
  "STORED_SLOTS_NOT_A_REQUEST_ENABLED",
  "ATTENDANCE_ACTION_PLAN_ENABLED",
  "HIDE_NO_POLICY_MATCH_NOTICE_ENABLED",
  "PRIOR_SENTENCE_FIX_ENABLED",
  "DATE_ANSWER_APPLIED_ENABLED",
  "DATE_ANSWER_KEEPS_OPEN_ENABLED",
  "REQUEST_LINE_ACCOUNT_ENABLED",
  "PAYROLL_TYPO_NOT_A_NAME_ENABLED",
  "POSITION_ANSWER_GUARD_ENABLED",
  "PRIOR_ROW_NOT_ON_INCIDENT_DATE_ENABLED",
  "NEXT_PUBLIC_ASD_NO_FORM_MONITORING_ENABLED",
  "PRIVATE_CREATOR_FORMS_ENABLED",
  "NOT_DEDUCTIBLE_READ_ENABLED",
  "PRIOR_STEP_SENTENCE_ENABLED",
  "EXIT_FULFILLED_IS_LAST_DAY_ENABLED",
  "DATE_LINE_NO_ECHO_ENABLED",
  "FUTURE_PRIOR_ROW_DROP_ENABLED",
  "MEETING_NOT_LATENESS_PLAN_ENABLED",
  "PLAN_PAYROLL_SENTENCE_ENABLED",
  "NAME_QUESTION_ONLY_ENABLED",
  "ANIMAL_ANYWHERE_ENABLED",
  "ANSWER_NOT_A_NAME_ENABLED",
  "STORE_WORD_NOT_A_NAME_ENABLED",
  "STEP_DATE_NOT_INCIDENT_ENABLED",
  "JOB_TITLE_FROM_WORDS_ENABLED",
  "DATE_REASK_FRESH_ENABLED",
  "WARNING_LEVEL_AND_CLAUSE_ENABLED",
  "LEVEL_STEP_NOT_ACCOUNT_ENABLED",
  "FIRST_NAME_ASK_ENABLED",
  "UNKNOWN_NAME_ASK_ENABLED",
  "TYPO_READING_ROUTES_ENABLED",
  "TYPO_READING_COPY_ENABLED",
  "DAY_WORD_TYPOS_ENABLED",
  "AMOUNT_UNKNOWN_ACK_ENABLED",
  "NEXT_PUBLIC_CARD_CHANGE_ENABLED",
  "ACCOUNT_ONLY_POLICY_QUERY_ENABLED",
  "RELATIVE_DATE_READER_ENABLED",
  "UNREAD_DATE_ASK_ENABLED",
  "DECIMAL_NOT_SENTENCE_END_ENABLED",
  "AMOUNT_TURN_STAYS_ENABLED",
  "MODEL_CALL_DAILY_CAP_ENABLED",
  "MONTHLY_BUDGET_GUARD_ENABLED",
  "ORDINAL_DATE_IN_DRAFT_ENABLED",
  "PAYROLL_TYPO_ANSWER_ENABLED",
  "WIDER_DATE_READER_ENABLED",
  "JOB_TITLE_APPOSITION_ENABLED",
  "EXIT_READBACK_JOB_TITLE_ENABLED",
  "FOLLOW_UP_CITATION_FIELD_ENABLED",
  "AI_READS_CODE_CHECKS_ENABLED",
] as const;

/**
 * Specific incidents cite their own manual section, chosen by the code (policy
 * reading; QA, 26 Oct 2026): no wet floor sign -> Safety in the Workplace, a
 * long break -> Meal and Rest Policy, a social media post -> Social Media
 * Policy, sexual comments -> Sexual and Other Forms of Harassment, a pet at
 * work -> Animals in the Workplace, theft, cash shortages, insubordination and
 * talking badly about coworkers -> the Standards of Conduct page that lists
 * them. A coaching form's "other" topic is no longer primed with
 * "Punctuality". Off, the policy and the topic are read exactly as before.
 */
export function policySpecificTopicsEnabled(): boolean {
  return envFlag("POLICY_SPECIFIC_TOPICS_ENABLED");
}

/**
 * What happened (the card's Issue) is read from the clauses that say what
 * happened: a clause that only gives the employee's title, store or tenure,
 * a policy instruction or pasted policy text is never the incident, and
 * "dodge, ne", "$3.25", "9/25/26" and "st. joe" stay inside one clause
 * (`lib/ai/incident-clauses.ts`; QA, 26 Oct 2026). Off (the default), the
 * incident readers see the turn as typed.
 */
export function incidentClauseSplitEnabled(): boolean {
  return envFlag("INCIDENT_CLAUSE_SPLIT_ENABLED");
}

/**
 * A US state code after a place ("Dodge, NE", "lawrence, ks") is never a
 * second person when a chat card is created (26 Oct 2026: "…at Dodge, NE.
 * She did not clock in…" was refused as naming "Odalys Merriweather, NE";
 * ported from the sibling app, same flag in both apps). See
 * `forms/state-code-place.ts`. Off, the conversation is read as typed.
 */
export function stateCodeNotAPersonEnabled(): boolean {
  return envFlag("STATE_CODE_NOT_A_PERSON_ENABLED");
}

/**
 * With LATE_OPEN_DATE_ENABLED on, payroll deduct is read from this form only
 * (QA, 26 Oct 2026; ported from the sibling app, same flag in both apps): what
 * the manager's own turns state, and a bare Yes/No only as the reply to the
 * payroll question just asked on a Corrective Action Form. A bare "Yes" after
 * an exit form, a resignation or a Coaching Form is never saved as payroll
 * deduct on the intent read; the full remap's card (this app's live form
 * path) already never stored it. See `latePayrollFromForm` in
 * `ai/intent-slots.ts`. Off, exactly as before.
 */
export function latePayrollFromFormEnabled(): boolean {
  return envFlag("LATE_OPEN_PAYROLL_FROM_FORM_ENABLED");
}

/**
 * The stored-slot lines put ahead of a turn ("The form is the Corrective
 * Action Form. The employee is … Policy reference: …") are not a new request
 * for the form (ported from the sibling app, same flag in both apps; Pau
 * approved the form-proposal.ts edit on 26 Oct 2026). Live: a Corrective
 * Action, then "yes", then "$25", then Create draft gave a blank draft, since
 * the slot answer restarted the form and its draft was written from "$25"
 * alone. On, the proposal decides whether a turn starts a new form from the
 * manager's own words. Off, as before.
 */
export function storedSlotsNotARequestEnabled(): boolean {
  return envFlag("STORED_SLOTS_NOT_A_REQUEST_ENABLED");
}

/**
 * A Corrective Action whose policy is Attendance gets Pau's attendance Action
 * Plan, with no follow-up date (26 Oct 2026; same flag in both apps). See
 * `forms/attendance-action-plan.ts`. Off, the plan is built as before.
 */
export function attendanceActionPlanEnabled(): boolean {
  return envFlag("ATTENDANCE_ACTION_PLAN_ENABLED");
}

/**
 * The yellow note "Woven does not see a matching policy in the knowledge base,
 * so the policy fields are left for you to complete." is not shown on the form
 * (Pau, 26 Oct 2026; same flag in both apps). The policy fields still stay
 * blank for the manager as before; only the note goes. A real failure, such as
 * the manual not being searchable, still says so. Off, the note shows.
 */
export function hideNoPolicyMatchNoticeEnabled(): boolean {
  return envFlag("HIDE_NO_POLICY_MATCH_NOTICE_ENABLED");
}

/**
 * A coaching or prior step said as its own sentence on a Corrective Action
 * (QA, 26 Oct 2026, the sibling app's production; same flag in both apps): "i coached
 * her on 10-16 about being late", "coached her 10-16, written warning on
 * 10-20" are Prior actions rows, never the form's Date, and never the
 * Observation of Offense in place of the incident ("she was late again
 * today" stays). See `heldStepSpans` in `forms/form-date-answer.ts` and
 * the incident clause in `ai/remap-incident.ts`. Off, read as before.
 */
export function priorSentenceFixEnabled(): boolean {
  return envFlag("PRIOR_SENTENCE_FIX_ENABLED");
}

/**
 * The manager's answer to "Which date goes on the form?" sets the form's date
 * (QA, 26 Oct 2026; same flag in both apps): "10-15", "the 15th" and "most
 * recent" are answers, also after a turn in between ("She is at Dodge"), and
 * "most recent" is never read as a person. See `incident-dates.ts`. Off, read
 * as before.
 */
export function dateAnswerAppliedEnabled(): boolean {
  return envFlag("DATE_ANSWER_APPLIED_ENABLED");
}

/**
 * A one-line request carries its own account (QA, 26 Oct 2026; same flag in
 * both apps): in "create a verbal ca for <name> at omaha ne, she was late on
 * 10-15-26" the clause after the comma is what happened, so a draft the model
 * left blank is retried and then written from it (DRAFT_NEVER_BLANK). See
 * `managerAccountClause` in `forms/draft-never-blank.ts`. Off, as before.
 */
export function requestLineAccountEnabled(): boolean {
  return envFlag("REQUEST_LINE_ACCOUNT_ENABLED");
}

/**
 * "not payroll deductible" is a No (a manager in the sibling app, 26 Oct 2026;
 * same flag in both apps): it was not read, and "Is payroll deduct
 * applicable?" was asked on every turn. The reader
 * (`forms/payroll-deduct-answer.ts`, which imports nothing) reads the same
 * variable itself. Off, as before.
 */
export function notDeductibleReadEnabled(): boolean {
  return envFlag("NOT_DEDUCTIBLE_READ_ENABLED");
}

/**
 * An earlier step told in a sentence is a Prior actions row (managers in the
 * sibling app, 26 Oct 2026; same flag in both apps): "note a verbal ca was
 * given on 9-1-26" and "she was issued a verbal ca on 10.1 for this same
 * thing" listed none. See `sentenceSteps` in `forms/prior-actions.ts`. Off, as
 * before.
 */
export function priorStepSentenceEnabled(): boolean {
  return envFlag("PRIOR_STEP_SENTENCE_ENABLED");
}

/**
 * A notice worked to the last day was fulfilled on it (a manager in the
 * sibling app, 26 Oct 2026; same flag in both apps): "her last day worked was
 * 9-28-26" with "gave and worked 2 week notice" left "Date that notice was
 * fulfilled" blank. See `readExitFacts` in `forms/exit-facts.ts`. Off, as
 * before.
 */
export function exitFulfilledIsLastDayEnabled(): boolean {
  return envFlag("EXIT_FULFILLED_IS_LAST_DAY_ENABLED");
}

/**
 * The reply is not sent on with an "It happened on …" line the conversation
 * already dates (QA LS-B5, 26 Oct 2026; same flag in both apps): after "… for
 * previous coaching" that line read as a second earlier step and the form was
 * dated today. See `fieldLines` in `ai/intake-augment.ts`. Off, as before.
 */
export function dateLineNoEchoEnabled(): boolean {
  return envFlag("DATE_LINE_NO_ECHO_ENABLED");
}

/**
 * A Prior actions row dated after today is never kept (QA LS-B11, 26 Oct 2026;
 * same flag in both apps): a typo "11-1-26" the manager corrected to "11-1-25"
 * left "Coaching — signed 11/01/2026" on the draft. See `groundPriorActions`
 * in `forms/prior-actions.ts`. Off, as before.
 */
export function futurePriorRowDropEnabled(): boolean {
  return envFlag("FUTURE_PRIOR_ROW_DROP_ENABLED");
}

/**
 * A missed meeting with no lateness keeps the general Action Plan, not the
 * attendance (lateness) wording (QA LS-B8, 26 Oct 2026). The policy pick is
 * unchanged. See `missedMeetingNotLateness` in `forms/attendance-action-plan.ts`.
 * Off, as before.
 */
export function meetingNotLatenessPlanEnabled(): boolean {
  return envFlag("MEETING_NOT_LATENESS_PLAN_ENABLED");
}

/**
 * The Action Plan says the deduction: "<name> will be payroll deducted $3.25."
 * when payroll deduct is Yes and the manager stated an amount (QA LS-B6 /
 * LS-B9, 26 Oct 2026). See `forms/plan-payroll-sentence.ts`. Off, as before.
 */
export function planPayrollSentenceEnabled(): boolean {
  return envFlag("PLAN_PAYROLL_SENTENCE_ENABLED");
}

/**
 * With no employee named, the chat asks one plain question — "Who is this
 * form for? Tell me the employee's full name." — never a list of details
 * (Pau, 26 Oct 2026; QA LS-B3). This PR covers the Corrective Action intake
 * ("ca", "blank corrective action form"); the coaching card's list in the
 * protected `ai/form-proposal.ts` follows on Pau's approval. Off, as before.
 */
export function nameQuestionOnlyEnabled(): boolean {
  return envFlag("NAME_QUESTION_ONLY_ENABLED");
}

/**
 * A payroll answer with typos ("yes payrol ldeduct") is never read as the
 * employee's name, so the card is not called out of date for "payrol ldeduct"
 * (a manager in the sibling app, 26 Oct 2026; same flag in both apps). See `forms/payroll-words.ts`.
 * Off, names are read as before.
 */
export function payrollTypoNotANameEnabled(): boolean {
  return envFlag("PAYROLL_TYPO_NOT_A_NAME_ENABLED");
}

/**
 * An answer to another open question is never the job title (QA, 26 Oct 2026):
 * with "What is <name>'s position (job title)?" open, "This is a verbal",
 * "Written" or "Verbal" was saved as the Job Title. See `readPositionAnswer`
 * in `forms/employee-position.ts`. Off, read as before.
 */
export function positionAnswerGuardEnabled(): boolean {
  return envFlag("POSITION_ANSWER_GUARD_ENABLED");
}

/**
 * A drafted Prior actions row dated on an incident date is invented (QA BT4,
 * 26 Oct 2026; same flag in both apps): "Verbal coaching on lateness —
 * 10/15/2026" from "verbal" and "10-15", when the manager named no step on
 * 10/15. Such a row is removed unless the manager named a step on that day or
 * a form on file has it. See `groundPriorActions` in `forms/prior-actions.ts`.
 * Off, as before.
 */
export function priorRowNotOnIncidentDateEnabled(): boolean {
  return envFlag("PRIOR_ROW_NOT_ON_INCIDENT_DATE_ENABLED");
}

/**
 * On top of DATE_ANSWER_APPLIED_ENABLED (QA BT4, 26 Oct 2026; same flag in both
 * apps): the date question stays on every card until answered, the answer
 * counts after other answers (the app's own lines around it are skipped), and
 * a reply with two dates picks neither. Off, the live date answer is unchanged.
 * See `incident-dates.ts`.
 */
export function dateAnswerKeepsOpenEnabled(): boolean {
  return envFlag("DATE_ANSWER_KEEPS_OPEN_ENABLED");
}

/**
 * An animal anywhere in a sentence about being at work is the Animals in the
 * Workplace incident (QA LS-B11 / SX5, Pau 27 Oct 2026; same flag in both
 * apps): "came into the store to show her team her new puppy" cited Standards
 * of Conduct. See `specific-policy-topics.ts`. Off, as before.
 */
export function animalAnywhereEnabled(): boolean {
  return envFlag("ANIMAL_ANYWHERE_ENABLED");
}

/**
 * A step's date is not the incident date (ported from the sibling app, QA
 * SF4, 27 Oct 2026; same flag in both apps): "for opening late on 9-28-26" /
 * "note a verbal ca was given on 9-1-26" dated the card and the form 9/1.
 * See `forms/step-sentence-dates.ts`. Off, as before.
 */
export function stepDateNotIncidentEnabled(): boolean {
  return envFlag("STEP_DATE_NOT_INCIDENT_ENABLED");
}

/**
 * The job title the manager typed is the card's Job Title, as typed; with none
 * typed and none on record it is asked once (QA item 3 / LS-B2, 27 Oct 2026;
 * same flag in both apps): "<name> was a tanning consultant at dodge location",
 * a title not on this company's list, left the exit form's Job Title empty,
 * and an exit form never asked the position. See `ai/job-title-from-words.ts`.
 * Off, as before.
 */
export function jobTitleFromWordsEnabled(): boolean {
  return envFlag("JOB_TITLE_FROM_WORDS_ENABLED");
}

/**
 * The date question asked again leads the reply with fresh words (QA D3, 27
 * Oct 2026): after "10/5 and 10/15" the re-asked reply was the same text as
 * the one before, so the screen did not change. See `ai/date-reask-fresh.ts`.
 * Off, as before.
 */
export function dateReaskFreshEnabled(): boolean {
  return envFlag("DATE_REASK_FRESH_ENABLED");
}

/**
 * An answer to the app's question names nobody (ported from the sibling app,
 * QA BF7, 27 Oct 2026; same flag in both apps): "yes payrol ldeduct" became
 * the employee. See `forms/answer-not-a-name.ts`. Off, as before.
 */
export function answerNotANameEnabled(): boolean {
  return envFlag("ANSWER_NOT_A_NAME_ENABLED");
}

/**
 * A reply that is only a store's name is the store, not the employee (QA BF7,
 * 27 Oct 2026): "dodge" became the employee. See `forms/answer-not-a-name.ts`.
 * Off, as before.
 */
export function storeWordNotANameEnabled(): boolean {
  return envFlag("STORE_WORD_NOT_A_NAME_ENABLED");
}

/**
 * A warning level stated in an "and"-clause of its own is the card's level
 * (ported from the sibling app, QA S12 / SF4, 27 Oct 2026; same flag in both apps):
 * "this should be a written and note a verbal ca was given on 9-1-26" left the
 * level blank. See `ai/warning-level-clause.ts`. Off, as before.
 */
export function warningLevelAndClauseEnabled(): boolean {
  return envFlag("WARNING_LEVEL_AND_CLAUSE_ENABLED");
}

/**
 * The title set off by a comma right after the name is the typed title (QA
 * S12, 27 Oct 2026; same flag in both apps): "<name>, <title> at <store>". On
 * top of JOB_TITLE_FROM_WORDS_ENABLED, which fills an empty Job Title only.
 * See `ai/job-title-from-words.ts`. Off, as before.
 */
export function jobTitleAppositionEnabled(): boolean {
  return envFlag("JOB_TITLE_APPOSITION_ENABLED");
}

/**
 * The exit form's read-back shows the Job Title the card and the draft have
 * (QA, 27 Oct 2026): with JOB_TITLE_FROM_WORDS it said "Left blank for you to
 * review: Job Title" while the draft had "Tanning Consultant". See
 * `ai/job-title-from-words.ts`. Off, as before.
 */
export function exitReadbackJobTitleEnabled(): boolean {
  return envFlag("EXIT_READBACK_JOB_TITLE_ENABLED");
}

/**
 * The Follow-Up Coaching Form's policy citation goes with the Original
 * Expectation (ported from the sibling app, QA P5, 27 Oct 2026; same flag in
 * both apps): it went into Follow-Up Observation, which stays blank until the
 * follow-up has happened, so that field read "Policy reference: …". See
 * `ai/policy-citation-fields.ts`. Off, as before.
 */
export function followUpCitationFieldEnabled(): boolean {
  return envFlag("FOLLOW_UP_CITATION_FIELD_ENABLED");
}

/**
 * A clause that only sets the warning level or only lists a prior step is not
 * the account (ported from the sibling app, QA S12, 27 Oct 2026; same flag in
 * both apps): "this should be a written and note a verbal ca was given on
 * 9-1-26" was the card's Issue. See `forms/account-clauses.ts`. Off, as before.
 */
export function levelStepNotAccountEnabled(): boolean {
  return envFlag("LEVEL_STEP_NOT_ACCOUNT_ENABLED");
}

/**
 * The AI reads the fields of a form request, each with the manager's words it
 * took it from, and the code checks every one before it is used (QA, 27 Oct
 * 2026; same flag in both apps). A field both read differently is asked once.
 * A model error, a reply over two seconds or an unusable reply leaves the turn
 * to today's readers. See `ai/reader/`. Off, as before.
 */
export function aiReadsCodeChecksEnabled(): boolean {
  return envFlag("AI_READS_CODE_CHECKS_ENABLED");
}

/**
 * The name question uses the first name the manager gave, and is never asked
 * twice in the same words (ported from the sibling app, QA S15, 27 Oct 2026;
 * same flag in both apps): "I have an employee ivy …" then "Yes" got "Who is
 * this form for? Tell me the employee's full name." twice. See
 * `ai/first-name-ask.ts`. Off, as before.
 */
export function firstNameAskEnabled(): boolean {
  return envFlag("FIRST_NAME_ASK_ENABLED");
}

/**
 * A typed name that is not on the directory is named back once, and the name
 * question is never shown twice in a row (QA BF7 live, 27 Oct 2026): the same
 * "Who is this Corrective Action Form for?" came back five times while the
 * typed name was never read. See `ai/unknown-name-ask.ts`. Off, as before.
 */
export function unknownNameAskEnabled(): boolean {
  return envFlag("UNKNOWN_NAME_ASK_ENABLED");
}

/**
 * With a form card open, a turn that only answers the payroll amount stays
 * with the form (QA BF7b live, 27 Oct 2026): "i dont know the amount" was
 * answered as a policy question. See `ai/amount-turn.ts`. Off, as before.
 */
export function amountTurnStaysEnabled(): boolean {
  return envFlag("AMOUNT_TURN_STAYS_ENABLED");
}

/**
 * A payroll answer with a typo is the payroll answer (QA BF7b live, 27 Oct
 * 2026): "yes payrol ldeduct" set no Payroll deduct on the card. See
 * `ai/payroll-typo-answer.ts`. Off, as before.
 */
export function payrollTypoAnswerEnabled(): boolean {
  return envFlag("PAYROLL_TYPO_ANSWER_ENABLED");
}

/**
 * The date reader also reads "2 october", "the 2nd of october", "on 10.2" and
 * "on the 2nd" (ported from the sibling app, 27 Oct 2026; same flag in both
 * apps). See `forms/wider-dates.ts`. Off, as before.
 */
export function widerDateReaderEnabled(): boolean {
  return envFlag("WIDER_DATE_READER_ENABLED");
}

/**
 * A point between two digits ends no sentence in the Issue read-back (QA,
 * 27 Oct 2026; same flag in both apps): "late on 10.2" read "late on 10",
 * "$10.25" read "$10". See `forms/incident-issue.ts`. Off, as before.
 */
export function decimalNotSentenceEndEnabled(): boolean {
  return envFlag("DECIMAL_NOT_SENTENCE_END_ENABLED");
}

/**
 * One user's traced model calls per UTC day are capped at MODEL_CALL_DAILY_CAP
 * (default 40); over it, the chat answers without calling the model (Pau,
 * 27 Oct 2026; same flag in both apps). See `ai/spend-guard.ts`. Off, as before.
 */
export function modelCallDailyCapEnabled(): boolean {
  return envFlag("MODEL_CALL_DAILY_CAP_ENABLED");
}

/**
 * This month's traced model spend, at list prices, is held under
 * MONTHLY_BUDGET_USD (default 10); at it, no question reaches the model (Pau,
 * 27 Oct 2026; same flag in both apps). See `ai/spend-guard.ts`. Off, as before.
 */
export function monthlyBudgetGuardEnabled(): boolean {
  return envFlag("MONTHLY_BUDGET_GUARD_ENABLED");
}

/**
 * A bare "the 2nd" in the manager's notes is read against today when a draft's
 * dates are checked (QA, 27 Oct 2026; same flag in both apps): the drafted
 * "December 2, 2025" was kept beside a form dated 10/02/2026. See
 * `forms/form-date-grounding.ts`. Off, as before.
 */
export function ordinalDateInDraftEnabled(): boolean {
  return envFlag("ORDINAL_DATE_IN_DRAFT_ENABLED");
}

/**
 * The draft's policy search reads the manager's account only, never a payroll
 * or amount answer, and the drafting rules forbid an opening, shift or role the
 * manager did not write (QA, 27 Oct 2026; same flag in both apps). See
 * `forms/account-only-policy-query.ts`. Off, as before.
 */
export function accountOnlyPolicyQueryEnabled(): boolean {
  return envFlag("ACCOUNT_ONLY_POLICY_QUERY_ENABLED");
}

/**
 * The date reader also reads "last tuesday", "this past monday", "on tuesday",
 * "yesterday" and "today" from the business date (QA, 27 Oct 2026; same flag
 * in both apps). See `forms/relative-dates.ts`. Off, as before.
 */
export function relativeDateReaderEnabled(): boolean {
  return envFlag("RELATIVE_DATE_READER_ENABLED");
}

/**
 * A card with no date says which of the manager's words it could not read as
 * one and asks for the date (QA, 27 Oct 2026; same flag in both apps). See
 * `ai/unread-date-ask.ts`. Off, as before.
 */
export function unreadDateAskEnabled(): boolean {
  return envFlag("UNREAD_DATE_ASK_ENABLED");
}

/**
 * "yesturday", "tuesdy" and "last tusday" are read by the relative date reader
 * as the day words they can only be (QA, 27 Oct 2026; same flag in both
 * apps). See `forms/typo-match.ts`. Off, as before.
 */
export function dayWordTyposEnabled(): boolean {
  return envFlag("DAY_WORD_TYPOS_ENABLED");
}

/**
 * The chat's readers see the manager's turns with each typo read as the one
 * known word it can only be; employee names never (QA, 27 Oct 2026; same flag
 * in both apps). See `ai/typo-reading-copy.ts`. Off, as before.
 */
export function typoReadingCopyEnabled(): boolean {
  return envFlag("TYPO_READING_COPY_ENABLED");
}

/**
 * The form routes' readers (the draft's notes; the create route's payroll
 * amount and warning level) see the manager's words with each typo read as the
 * one known word it can only be; stored text stays as typed (QA, 27 Oct 2026;
 * same flag in both apps). See `ai/typo-reading-copy.ts`. Off, as before.
 */
export function typoReadingRoutesEnabled(): boolean {
  return envFlag("TYPO_READING_ROUTES_ENABLED");
}

/**
 * "i dont know the amount", right after the amount question, is answered with
 * one line instead of the card alone (QA, 27 Oct 2026; same flag in both
 * apps). See `ai/amount-unknown-ack.ts`. Off, as before.
 */
export function amountUnknownAckEnabled(): boolean {
  return envFlag("AMOUNT_UNKNOWN_ACK_ENABLED");
}
