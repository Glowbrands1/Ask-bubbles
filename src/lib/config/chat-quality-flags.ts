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
 * A point between two digits ("$3.25", "1.5 hours") is part of the number,
 * not the end of a sentence (Ask Bubbles conv_mvofkkrg2ipw28x, 25 Oct 2026:
 * the Issue read "... register shortage 10-20-26, $3"). Off, the Issue is
 * cut at every point as before.
 */
export function decimalKeepEnabled(): boolean {
  return envFlag("DECIMAL_KEEP_ENABLED");
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
  "REOPEN_VERB_GUARD_ENABLED",
  "TERSE_SLOT_READ_ENABLED",
  "DECIMAL_KEEP_ENABLED",
] as const;
