/**
 * Chat-quality flags. Each one defaults off.
 *
 * Unset, empty, "0", "false", and "off" leave the existing chat path
 * untouched. Only an explicit on-value turns a feature on, so a preview can
 * try one change without the others. The variable names are shared so both
 * apps turn the same behaviour on with the same variable.
 */

import { flagFromEnv } from "./default-on";

const ON = new Set(["1", "true", "on", "yes"]);

/**
 * A flag's value from the environment. A flag in `DEFAULT_ON` (Pau, 3 Nov
 * 2026, "(E) batch 1") is on unless its variable says "0"/"false"/"off"/"no";
 * every other flag is off unless its variable says on. See `default-on.ts`.
 */
export function envFlag(name: string): boolean {
  return flagFromEnv(name, process.env[name]);
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
 * PRIOR_COACHING_DENIAL_ENABLED (QA, 5 Nov 2026; default off): "There's no
 * prior coaching on file." was quoted back by PRIOR_COACHING_OPTIONAL_ENABLED
 * as "Prior coaching note: prior coaching on file." — the protected note
 * reader starts at "prior coaching" and drops the "no". With the flag on, the
 * caller hands it the manager's turns with each sentence that denies prior
 * coaching left out, unless it names a further step after "except", "other
 * than" or "but" ("no prior coaching except a verbal in July", "… except a
 * verbal warning"; Pau's decision B, 6 Nov 2026), which is kept as that step
 * (`ai/prior-coaching-denial.ts`). Off, the turns as before.
 */
export function priorCoachingDenialEnabled(): boolean {
  return envFlag("PRIOR_COACHING_DENIAL_ENABLED");
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
 * SECOND_REQUEST_OWN_ACCOUNT_ENABLED (QA's audit, 7 Nov 2026; default off). With a Corrective Action for <A> already
 * created in a chat, a second request for <A> ("I need another corrective action for <A>, his cash drawer was short")
 * reopened the first draft (the reopen lookup read every turn of the chat as the incident), or its card carried the
 * first request's policy ("Late Opening, as you said"), Action Plan and, when not worded as a create request, its
 * account. On: a turn that starts a new form request does not carry the saved policy heading (`ai/form-state.ts`). Off, as before.
 */
export function secondRequestOwnAccountEnabled(): boolean {
  return envFlag("SECOND_REQUEST_OWN_ACCOUNT_ENABLED");
}

/**
 * CARD_POLICY_OWN_REQUEST_ENABLED (ported from the sibling app, QA's live tester, 7 Nov 2026; same flag in both apps;
 * default off). "Coaching form for <A> for being on her phone …", then "Coaching form for <B>": with
 * POLICY_CITATION_ENABLED on, B's card cites Cell Phone/Smart Watch from A's request, because the form answer's mapped
 * policy is read over every manager turn. On: it is read from the latest form request that names the card's employee,
 * when no earlier turn names them (`ai/card-policy-request.ts`). Off, as before.
 */
export function cardPolicyOwnRequestEnabled(): boolean {
  return envFlag("CARD_POLICY_OWN_REQUEST_ENABLED");
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
 * WOVEN_PDF_OCR_ENABLED (QA's plan, approved by Pau, 7 Nov 2026; same flag in both apps; default off). Scanned Woven
 * PDFs have no text layer, so the sync left them in ERROR ("no_text") and their knowledge never reached an answer.
 * On: a Woven sync has a PDF with no text at all transcribed page by page by Claude (`ingestion/extract/pdf-ocr.ts`),
 * capped per document and per run, and indexes it like any PDF. Uploads, and PDFs with any text, are unchanged.
 * Off, as before.
 */
export function wovenPdfOcrEnabled(): boolean {
  return envFlag("WOVEN_PDF_OCR_ENABLED");
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
 * an assistant reply, a bulleted or priced offer list). Ported from the
 * sibling app. Off, the readers take names as they do today.
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

// coding 2: REVISION_EDIT_NEEDS_EDIT
/**
 * REVISION_EDIT_NEEDS_EDIT_ENABLED / NEXT_PUBLIC_REVISION_EDIT_NEEDS_EDIT_ENABLED (QA, 8 Nov 2026, the sibling
 * app's round-5 live tester, item 1; default off; same flags in both apps). "Change <A> CA" opened a new draft of the finalized form
 * whose banner said "You edited the policy wording: … was changed by hand" when nobody had edited anything: on a
 * revision, every carried policy field without verified provenance counted as an edit. With this flag on, a revision
 * counts as edited only once it has an edit of its own (`forms/policy-verification.ts`). The banner is shown in the
 * browser and Finalize reads the same rule on the server, so there are two variables: FLIP BOTH TOGETHER
 * (NEXT_PUBLIC_ is inlined at build time). Off, as before.
 */
export function revisionEditNeedsEditEnabled(): boolean {
  if (typeof window === "undefined") return envFlag("REVISION_EDIT_NEEDS_EDIT_ENABLED");
  const inlined = process.env.NEXT_PUBLIC_REVISION_EDIT_NEEDS_EDIT_ENABLED;
  return typeof inlined === "string" && ON.has(inlined.trim().toLowerCase());
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
 * A form on file is asked for with any verb that opens it, not only "edit"
 * (QA, 6 Nov 2026; QA's history review of a location manager's chats, 5 Nov
 * 2026: "bring up <name>'s corrective action", "bring up an old coaching form
 * for <first name>" started over). On, a request that leads with "bring up",
 * "pull up", "open" or "find" and names a person and a form opens that
 * person's form on file through the "edit" reopen path (a finalized one as a
 * new draft of it), or says none is on file; and a form named only as "CA" /
 * "corrective action" ("Change <name> CA") counts as named. A request to
 * create one ("write up", "create", "make") still creates. Off, the reopen
 * reading is exactly as before.
 */
export function reopenByAnyOpenVerbEnabled(): boolean {
  return envFlag("REOPEN_BY_ANY_OPEN_VERB_ENABLED");
}

// coding 2: POSSESSIVE_NO_APOSTROPHE
/**
 * POSSESSIVE_NO_APOSTROPHE_ENABLED (QA, Bubbles live tester with round 5, 8 Nov 2026; default off; same flag in both
 * apps; only with REOPEN_BY_ANY_OPEN_VERB). "bring up <first name>s corrective action" — the possessive typed without
 * its apostrophe, one roster person by that first name — asked "Who is this form for?" with a blank card, while
 * "<first name>'s" opened the form on file. With this flag on, a first name the roster does not have as typed is tried
 * without its final "s" ("ss" never), by the same one-person rule (`forms/chat-reopen.ts`). Off, as before.
 */
export function possessiveNoApostropheEnabled(): boolean {
  return envFlag("POSSESSIVE_NO_APOSTROPHE_ENABLED");
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
  "INCIDENT_FROM_EARLIER_TURN_ENABLED",
  "LEVEL_REQUEST_DATE_ENABLED",
  "CA_SHORTCUT_WORDS_ENABLED",
  "EXIT_SHORTCUT_WORDS_ENABLED",
  "STREET_ADDRESS_NOT_A_NAME_ENABLED",
  "EXIT_TERMS_NOT_NAMES_ENABLED",
  "SUGGEST_ANSWER_REPLACES_TYPED_ENABLED",
  "UNREAD_DATE_PLAIN_ASK_ENABLED",
  "SEVERAL_FORMS_STAY_CURRENT_ENABLED",
  "SWITCH_KEEPS_NAMED_FORM_ENABLED",
  "PREFERRED_NAME_CARD_CURRENT_ENABLED",
  "PARTIAL_SURNAME_ASK_ENABLED",
  "PARTIAL_NAME_LOOSE_MATCH_ENABLED",
  "STALE_NEEDS_ROSTER_PERSON_ENABLED",
  "PARTIAL_NAME_CARD_CURRENT_ENABLED",
  "UNREAD_DAY_NOT_INCIDENT_DATE_ENABLED",
  "OTHER_WRITE_IN_GUARD_ENABLED",
  "OTHER_WRITE_IN_NOT_A_QUESTION_ENABLED",
  "CHAT_IMPORT_OWN_ONLY_ENABLED",
  "CHAT_HISTORY_STATE_CHUNKED_ENABLED",
  "NEXT_PUBLIC_CHAT_HISTORY_TOLERANT_ENABLED",
  "CHAT_IMPORT_PROVEN_OWN_ENABLED",
  "FORM_EDIT_PLAIN_WORDS_ENABLED",
  "FORM_EDIT_HONEST_REPLY_ENABLED",
  "PERSON_GUARD_ENABLED",
  "REFUSAL_NO_REPEAT_ENABLED",
  "TITLE_NOT_SPEAKERS_MANAGER_ENABLED",
  "NEW_REQUEST_OWN_TURNS_ENABLED",
  "OPEN_DRAFT_KEEPS_TURNS_ENABLED",
  "FORM_EDIT_REFERS_BACK_ENABLED",
  "CLAIM_GUARD_ENABLED",
  "NAME_CORRECTION_WORDS_ENABLED",
  // Coding: PROPOSAL_NAME_CORRECTION (round 5, 8 Nov 2026; default off): forced off with the others.
  "PROPOSAL_NAME_CORRECTION_ENABLED",
  // Coding: NEAR_MISS_QUESTION_RULES (round 5, 8 Nov 2026; port from the sibling app; default off): forced off with the others.
  "NEAR_MISS_QUESTION_RULES_ENABLED",
  "POLICY_CHANGE_REST_OF_TURN_ENABLED",
  "OPEN_FORM_NO_SELECTION_ENABLED",
  "ANGLE_PLACEHOLDER_GUARD_ENABLED",
  "FORM_PLACEHOLDER_WORDS_ENABLED",
  "FIRST_NAME_YES_KEEPS_REQUEST_ENABLED",
  "REVISION_SAME_VALUE_ENABLED",
  "SAME_FORM_COPY_ENABLED",
  // Missing from this list since its PR (QA, 7 Nov 2026): forced off with the others.
  "SAME_FORM_COPY_NEW_PERSON_ENABLED",
  "STAFF_PICKER_ENABLED",
  "STAFF_PICKER_STORE_TITLES_ENABLED",
  "ROSTER_STORE_SCOPED_ENABLED",
  "FORM_EDIT_NAME_GATE_ROSTER_ENABLED",
  "STAFF_PICKER_BARE_ANSWER_ENABLED",
  "WHOLE_TEAM_COACHING_ENABLED",
  "SAME_ASK_NO_REPEAT_ENABLED",
  "FORM_PATCH_REDUCER_ENABLED",
  "FORM_REPLY_FROM_DIFF_ENABLED",
  "FORM_EDIT_SINGLE_WRITER_ENABLED",
  "FORM_EDIT_SAID_REPLACEMENT_ENABLED",
  "FORM_EDIT_TOOL_IN_STREAM_ENABLED",
  "CHAT_GLOSSARY_ENABLED",
  "CA_SALES_POLICY_ENABLED",
  // Default-off fix flags (#486, coding-3 items 4 and 5): forced off with the others.
  "CA_PERFORMANCE_REASON_ENABLED",
  "WRITE_ME_THE_FORM_ENABLED",
  // Missing from this list since its PR (QA, 7 Nov 2026): forced off with the others.
  "WOVEN_TRAINING_CONDUCT_ENABLED",
  "FORM_NAME_FROM_ROSTER_ENABLED",
  "FORM_EDIT_NOOP_GUARD_ENABLED",
  "CA_NAME_FROM_CHAT_ENABLED",
  "NEXT_PUBLIC_CARD_POLICY_TO_DRAFT_ENABLED",
  "NEW_REQUEST_OPEN_DRAFT_ENABLED",
  "NEXT_PUBLIC_TEAM_CARD_NO_POSITION_ENABLED",
  "TEAM_CARD_WORDING_ENABLED",
  "DRAFT_REUSE_NEW_REQUEST_ENABLED",
  "PRIOR_ACTIONS_POLICY_ENABLED",
  "STAFF_PICKER_REMEMBER_LOCATION_ENABLED",
  "SHARED_LOGIN_NOT_STAFF_ENABLED",
  "STAFF_PICKER_NO_REPEAT_ENABLED",
  "COACHING_FOR_EVERYONE_ENABLED",
  "CHAT_RESPONSE_STREAM_ENABLED",
  "TRUNCATION_RETRY_BUDGET_ENABLED",
  "REPORT_NAME_NOT_A_PERSON_ENABLED",
  "MANAGER_NAME_NOT_EMPLOYEE_ENABLED",
  "AM_PRIOR_WARNINGS_ENABLED",
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
  // Missing from this list since its PR (QA, 7 Nov 2026): forced off with the others.
  "PAYROLL_AMOUNT_SAME_MESSAGE_ENABLED",
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
  // Missing from this list since its PR (QA, 7 Nov 2026): forced off with the others.
  "PAST_FORMS_BEFORE_LIBRARY_ENABLED",
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
  // coding 2: REMOVE_POLICY_NOT_NAMED (A1; default off): forced off with the others.
  "REMOVE_POLICY_NOT_NAMED_ENABLED",
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
  "REOPEN_BY_ANY_OPEN_VERB_ENABLED",
  // coding 2: KEPT_REQUEST_SAME_FORM and CARRIED_PERSON_NOTICE (default off): forced off with the others.
  "KEPT_REQUEST_SAME_FORM_ENABLED",
  "NEXT_PUBLIC_KEPT_REQUEST_SAME_FORM_ENABLED",
  "CARRIED_PERSON_NOTICE_ENABLED",
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
  "NEXT_PUBLIC_ASSISTANT_MANAGER_CREATE_ENABLED",
  "NEXT_PUBLIC_CHAT_LOCAL_OWNER_ENABLED",
  "PRIVATE_CREATOR_FORMS_ENABLED",
  "NOT_DEDUCTIBLE_READ_ENABLED",
  "PRIOR_STEP_SENTENCE_ENABLED",
  // coding 2: PRIOR_STEP_PREVIOUSLY (A2; default off): forced off with the others.
  "PRIOR_STEP_PREVIOUSLY_ENABLED",
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
  "ADDITIONAL_LOCATION_TAKEN_ENABLED",
  "OUT_OF_SCOPE_PLACE_SAID_ENABLED",
  "OUT_OF_SCOPE_PLACE_KEEPS_OWN_ENABLED",
  "FORM_TYPE_SWITCH_ENABLED",
  "FORM_TYPE_SWITCH_AFTER_CREATE_NOTE_ENABLED",
  "CARD_CHANGE_PLAN_REBUILD_ENABLED",
  "SPEND_GUARD_ALL_CALLS_ENABLED",
  "FIRST_NAME_SUGGEST_ENABLED",
  "NEXT_PUBLIC_CARD_CHANGE_ENABLED",
  "NEXT_PUBLIC_CARD_CHANGE_FINALIZED_ENABLED",
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
  "LAST_FIRST_NAME_READ_ENABLED",
  "POLICY_CITATION_CHECK_ENABLED",
  "PRIOR_ACTIONS_NO_SIGNED_ENABLED",
  "REQUEST_LEVEL_NOT_HISTORY_ENABLED",
  // The sibling app's gate fix flags (6 Nov 2026): forced off with the others by flags-off-parity's child run.
  "TITLE_ENDS_AT_LINE_ENABLED",
  "PLACE_FROM_CUE_ENABLED",
  // Port of the sibling app's fix flag after its flip (6 Nov 2026): forced off with the others.
  "SALES_SHORTFALL_OBJECT_ENABLED",
  "SALES_OBSERVATION_ACCOUNT_ENABLED",
  // coding 2: SOURCE_NOTE_GUARD (default off): forced off with the others.
  "SOURCE_NOTE_GUARD_ENABLED",
  "UNDER_PERFORMANCE_EXPLAINED_ENABLED",
  // coding 2: POLICY_CORRECTION_NOT_ACCOUNT (default off): forced off with the others.
  "POLICY_CORRECTION_NOT_ACCOUNT_ENABLED",
  // coding 2: REVISION_EDIT_NEEDS_EDIT (default off): forced off with the others.
  "REVISION_EDIT_NEEDS_EDIT_ENABLED",
  "NEXT_PUBLIC_REVISION_EDIT_NEEDS_EDIT_ENABLED",
  // coding 2: EXIT_TERMINATION_STATED (default off): forced off with the others.
  "EXIT_TERMINATION_STATED_ENABLED",
  // coding 2: EXIT_OTHER_PERSON_NOT_SUBJECT (default off): forced off with the others.
  "EXIT_OTHER_PERSON_NOT_SUBJECT_ENABLED",
  // coding 2: POSSESSIVE_NO_APOSTROPHE (default off): forced off with the others.
  "POSSESSIVE_NO_APOSTROPHE_ENABLED",
  // coding 2: FIELD_LABEL_NOT_A_QUESTION (default off): forced off with the others.
  "FIELD_LABEL_NOT_A_QUESTION_ENABLED",
  // coding 2: EXIT_ANSWER_NOT_A_CORRECTION (default off): forced off with the others.
  "EXIT_ANSWER_NOT_A_CORRECTION_ENABLED",
  "NO_NOTICE_NO_DATE_ENABLED",
  "ISSUE_IS_THE_ACCOUNT_ENABLED",
  // coding 2: DENIAL_NO_ACCOUNT (default off): forced off with the others.
  "DENIAL_NO_ACCOUNT_ENABLED",
  // Live in production since the 6 Nov flip, but missing from this list (QA, 6 Nov 2026): a gate run with them on
  // would keep them on inside flags-off-parity's child run. Test-only effect.
  "METRIC_GUARD_ENABLED",
  "REPLY_MATCHES_CARD_ENABLED",
  "TITLE_OF_THE_EMPLOYEE_ENABLED",

  "CA_OFFER_KEEPS_ACCOUNT_ENABLED",

  // Default-off fix flag (#483).
  "REPLY_MATCHES_CARD_EACH_CARD_ENABLED",
  // Default-off fix flag (the flip-3 gate, 6 Nov 2026).
  "OFF_ROSTER_CONFIRM_ENABLED",
  // Default-off fix flag (QA, 7 Nov 2026).
  "METRIC_CHOICE_ONE_QUESTION_ENABLED",
  // coding 5: POLICY_SET_ASIDE_PLAN (default off): forced off with the others.
  "POLICY_SET_ASIDE_PLAN_ENABLED",
  // coding 5: POLITE_ABOUT_STAYS_CARD (default off): forced off with the others.
  "POLITE_ABOUT_STAYS_CARD_ENABLED",
  // QA round-5 batch (8 Nov 2026): the round-5 PRs' entries (lost in the batch merge), forced off with the others.
  "ACCOUNT_VERB_NOT_A_NAME_ENABLED",
  "CARD_COMPLAINT_NOT_ACCOUNT_ENABLED",
  "COPY_OPEN_FORM_FOR_PERSON_ENABLED",
  "CREATE_COMMAND_POINTS_TO_CARD_ENABLED",
  "FINAL_REPLY_MARKER_GUARD_ENABLED",
  "ISSUE_AFTER_REQUEST_REASON_ENABLED",
  "LIST_POLICY_IS_EDIT_ENABLED",
  "OUT_OF_DATE_IS_THE_PROPOSAL_ENABLED",
  "PRIOR_STEP_DATE_LIST_ENABLED",
  "REOPEN_NOT_OPEN_FORM_ENABLED",
  "SIGNED_STEP_NOT_A_REQUEST_ENABLED",
  "STEP_DATES_NOT_FORM_DATE_ENABLED",
  "TAKE_OFF_STAYS_CARD_ENABLED",
  // coding 4: ACCOUNT_PLACE_LEAD (round 6; default off): forced off with the others.
  "ACCOUNT_PLACE_LEAD_ENABLED",
  // coding 5: STEP_B_DATE_WITH_ABOUT (default off): forced off with the others.
  "STEP_B_DATE_WITH_ABOUT_ENABLED",
  // coding 5: COMPLAINT_ACCOUNT (port of the sibling app's flag, default off): forced off with the others.
  "COMPLAINT_ACCOUNT_ENABLED",
  // coding 5: UNKNOWN_NAME_ASK_WHO_FOR (default off): forced off with the others.
  "UNKNOWN_NAME_ASK_WHO_FOR_ENABLED",
  // coding 5: CORRECTED_DATE_KEPT (default off): forced off with the others.
  "CORRECTED_DATE_KEPT_ENABLED",
  // coding 5: MISSED_SHIFT_NOT_LATENESS (default off): forced off with the others.
  "MISSED_SHIFT_NOT_LATENESS_ENABLED",
  // coding 5: REQUEST_PARTICIPLE_LEAD (port, default off): forced off with the others.
  "REQUEST_PARTICIPLE_LEAD_ENABLED",
  // Default-off fix flag (QA's live Create test, 8 Nov 2026).
  "UNDATED_ACCOUNT_BRIEF_ENABLED",
  // coding 4: FIRST_NAME_ANSWER_KEEPS_ACCOUNT and SHIFT_ACCOUNT_IS_INCIDENT (port from the sibling app, default off).
  "FIRST_NAME_ANSWER_KEEPS_ACCOUNT_ENABLED",
  "SHIFT_ACCOUNT_IS_INCIDENT_ENABLED",
  // Default-off fix flag (QA, the Bubbles round-6 live test, 9 Nov 2026).
  "EXIT_LETTER_SIGNER_NOT_SUBJECT_ENABLED",
  // Default-off fix flag (QA, the Bubbles round-6 live test, 9 Nov 2026).
  "POSSESSIVE_PLACE_NOT_PERSON_ENABLED",
  // Default-off fix flag (QA, the Bubbles round-6 live test, 9 Nov 2026).
  "OFF_ROSTER_ASK_BEFORE_CARD_ENABLED",
  // coding 4: WORK_AREA_ABSENCE_CITES_CONDUCT (Pau's decision, 9 Nov 2026; default off).
  "WORK_AREA_ABSENCE_CITES_CONDUCT_ENABLED",
  // Default-off fix flag (ported from the sibling app: QA's live test there, 9 Nov 2026).
  "EXIT_LETTER_ADDRESSEE_ENABLED",
  // Default-off fix flag (QA, the Bubbles round-7 live test, 9 Nov 2026).
  "POSSESSIVE_PLACE_ACCOUNT_ENABLED",
  "LETTER_GREETING_NOT_NAME_ENABLED",
  "EXIT_FORM_DATE_FROM_TERMINATION_ENABLED",
  // Default-off fix flag (QA, the Bubbles round-7 live test, 9 Nov 2026).
  "MISSED_SHIFT_CITES_ATTENDANCE_ENABLED",
  // Default-off fix flag (QA, the Bubbles round-7 live test, 9 Nov 2026).
  "EXIT_LINE_ANSWERS_ADD_UP_ENABLED",
  // coding 4: MADE_ABOUT_ALL_OR_NOTHING (QA's live round-7 test, 9 Nov 2026; default off).
  "MADE_ABOUT_ALL_OR_NOTHING_ENABLED",
  // coding 4: MADE_ABOUT_READER_ACCOUNT (QA's live round-9 test, 9 Nov 2026; default off).
  "MADE_ABOUT_READER_ACCOUNT_ENABLED",
  // coding 4: MADE_ABOUT_REWRITE_FINISHES (the sibling app's live round-13 test, 9 Nov 2026; default off).
  "MADE_ABOUT_REWRITE_FINISHES_ENABLED",
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
 * "Calder, Remy" is read as Remy Calder without a model (ported from the sibling
 * app, QA 27 Oct 2026; same flag in both apps): the AI reader's one measured win,
 * by the reader's own checks alone. A "Last, First" pair in the manager's turns
 * that fits exactly one person on the scoped roster fills an employee today's
 * readers left open. See `ai/reader/last-first.ts`. Off, as before.
 */
export function lastFirstNameReadEnabled(): boolean {
  return envFlag("LAST_FIRST_NAME_READ_ENABLED");
}

/** A checked reading reaches the card: the AI reader's, or the Last, First one. */
export function checkedReadingEnabled(): boolean {
  return aiReadsCodeChecksEnabled() || lastFirstNameReadEnabled();
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

/**
 * A short turn naming one of the manager's own stores, primary or additional,
 * is read as the change of store it is (Pau, 28 Oct 2026; this app only).
 * See `ai/additional-store.ts`. Off, as before.
 */
export function additionalLocationTakenEnabled(): boolean {
  return envFlag("ADDITIONAL_LOCATION_TAKEN_ENABLED");
}

/**
 * A store-scoped manager who names a store they are not assigned to is told
 * so in the reply (QA, 28 Oct 2026; same flag in both apps). See
 * `ai/out-of-scope-place.ts`. Off, as before.
 */
export function outOfScopePlaceSaidEnabled(): boolean {
  return envFlag("OUT_OF_SCOPE_PLACE_SAID_ENABLED");
}

/**
 * A card never holds a store the manager is not assigned to: it goes back to
 * the manager's own, or asks which (Pau, 28 Oct 2026; same flag in both
 * apps). See `ai/keeps-own-place.ts`. Off, as before.
 */
export function outOfScopePlaceKeepsOwnEnabled(): boolean {
  return envFlag("OUT_OF_SCOPE_PLACE_KEEPS_OWN_ENABLED");
}

/**
 * While the card is open, "change to coaching" / "change to ca" switch it to
 * the other form (Pau, 28 Oct 2026; same flag in both apps). See
 * `ai/form-type-switch.ts`. Off, as before.
 */
export function formTypeSwitchEnabled(): boolean {
  return envFlag("FORM_TYPE_SWITCH_ENABLED");
}

/**
 * After the form was created, "change to coaching" starts the other form and
 * the reply says the existing one is left as it is (Pau, 28 Oct 2026; same
 * flag in both apps). See `ai/form-type-switch.ts`. Off, as before.
 */
export function formTypeSwitchAfterCreateNoteEnabled(): boolean {
  return envFlag("FORM_TYPE_SWITCH_AFTER_CREATE_NOTE_ENABLED");
}

/**
 * Payroll deduct changed in a finalized form's Change something panel rebuilds
 * the new draft's Action Plan (Pau, 28 Oct 2026; same flag in both apps). See
 * the forms instance route's PATCH. Off, the panel asks the manager to check
 * the plan, as before.
 */
export function cardChangePlanRebuildEnabled(): boolean {
  return envFlag("CARD_CHANGE_PLAN_REBUILD_ENABLED");
}

/**
 * Every Claude call is counted toward the monthly budget, not only the chat
 * answer and the reader: retries, helpers, form revision, the Create card's
 * draft and template ingest (Pau and QA, 28 Oct 2026; same flag in both
 * apps). See `ai/spend-meter.ts`. Counting only — nothing is blocked that was
 * not before. Off, the guard counts as before.
 */
export function spendGuardAllCallsEnabled(): boolean {
  return envFlag("SPEND_GUARD_ALL_CALLS_ENABLED");
}

/**
 * A first name alone ("quinn") is asked about from the manager's own roster —
 * "Did you mean **Quinn Marlowe** or **Quinn Ashby**?" or "Is this for
 * **Quinn Marlowe**?" — instead of a card for the bare name or a plain "who is
 * this for" (QA and Pau, 28 Oct 2026; same flag in both apps). See
 * `ai/first-name-suggest.ts`. Off, as before.
 */
export function firstNameSuggestEnabled(): boolean {
  return envFlag("FIRST_NAME_SUGGEST_ENABLED");
}

/**
 * A ticked "Other" box is never left with its write-in empty: the write-in
 * gets what happened in the manager's words, else "Other" is unticked (QA,
 * 29 Oct 2026; same flag in both apps). See `forms/other-write-in.ts`. Off,
 * the draft as the model returned it.
 */
export function otherWriteInGuardEnabled(): boolean {
  return envFlag("OTHER_WRITE_IN_GUARD_ENABLED");
}

/**
 * The Other write-in is never a question the manager asked: "Which forms can I
 * create here?" a turn before the coaching request came back as the topic in
 * the sibling app (QA, 30 Oct 2026; same flag in both apps). See
 * `forms/other-write-in.ts`. Off, as before.
 */
export function otherWriteInNotAQuestionEnabled(): boolean {
  return envFlag("OTHER_WRITE_IN_NOT_A_QUESTION_ENABLED");
}

/**
 * A chat another account wrote is never saved to this one: an Assistant
 * Manager's Import on a Location Manager's browser copied the manager's chats
 * into their account (QA, 30 Oct 2026; same flag in both apps). See
 * `chat/store.ts` `saveOwnConversation`. Off, as before.
 */
export function chatImportOwnOnlyEnabled(): boolean {
  return envFlag("CHAT_IMPORT_OWN_ONLY_ENABLED");
}

/**
 * The history-state read counts turns in batches of conversation ids, so an
 * account with thousands of chats no longer gets a 503 from
 * GET /api/chat/conversations/import (QA, 31 Oct 2026; same flag in both
 * apps). See `chat/store.ts` `ownHistoryState`. Off, as before.
 */
/**
 * "fix her last name …" on a Corrective Action changes the Employee Name on
 * the card and the draft, and says so (Pau, 3 Nov 2026) — only to a name that
 * shares a first or last name with the form's and that exactly one person on
 * the roster has. See `forms/ca-name-from-chat.ts`. Off, as before.
 */
export function caNameFromChatEnabled(): boolean {
  return envFlag("CA_NAME_FROM_CHAT_ENABLED");
}

/**
 * A card that still needs something never repeats the last reply word for
 * word: it says first that it is still waiting on the same answer (the team
 * card's store question, asked twice; the replay pack, 3 Nov 2026). Same flag
 * in both apps. See `forms/reply-guards.ts` `withoutRepeatedAsk`. Off, as
 * before.
 */
export function sameAskNoRepeatEnabled(): boolean {
  return envFlag("SAME_ASK_NO_REPEAT_ENABLED");
}

export function chatHistoryStateChunkedEnabled(): boolean {
  return envFlag("CHAT_HISTORY_STATE_CHUNKED_ENABLED");
}

/**
 * A freshly signed-in browser shows the account's chats even when the
 * history-state read fails: the list the server returned is merged on its own
 * (QA, 31 Oct 2026; same flag in both apps). Read in the browser, so only a
 * statically written `process.env.NEXT_PUBLIC_…` is inlined, at build time.
 * See `store/app-store.tsx`. Off, as before.
 */
/**
 * The draft cites the policy the card cited (QA live check in the sibling
 * app, 3 Nov 2026: the card read "Late Opening p.15", the draft made from it
 * "Attendance p.14"). The browser sends the card's heading with the draft
 * request; the draft route uses it where the pinned manual has it. Read on
 * both sides, so a statically written `process.env.NEXT_PUBLIC_…`, inlined at
 * build time. See `forms/card-policy.ts`. Off, as before.
 */
export function cardPolicyToDraftEnabled(): boolean {
  const inlined = process.env.NEXT_PUBLIC_CARD_POLICY_TO_DRAFT_ENABLED;
  return typeof inlined === "string" && ON.has(inlined.trim().toLowerCase());
}

export function chatHistoryTolerantEnabled(): boolean {
  const inlined = process.env.NEXT_PUBLIC_CHAT_HISTORY_TOLERANT_ENABLED;
  return typeof inlined === "string" && ON.has(inlined.trim().toLowerCase());
}

/**
 * An import of a chat this account does not hold yet must prove it is its
 * own: every answered turn recorded for this account; a chat with no turn on
 * record is declined (independent review, 31 Oct 2026; same flag in both
 * apps). The activity read is batched. See `chat/store.ts`. Off, as before.
 */
export function chatImportProvenOwnEnabled(): boolean {
  return envFlag("CHAT_IMPORT_PROVEN_OWN_ENABLED");
}

/**
 * With a Coaching Form draft open, details given in plain words, "make that
 * update", and "update the draft with these details" (the previous answer's)
 * are written into the draft by the open-form revision (QA, 30 Oct 2026; same
 * flag in both apps). See `forms/form-content-turn.ts`. Off, as before.
 */
export function formEditPlainWordsEnabled(): boolean {
  return envFlag("FORM_EDIT_PLAIN_WORDS_ENABLED");
}

/**
 * With a form open, an answer that changed nothing never says it updated the
 * form (QA, 30 Oct 2026; same flag in both apps). See
 * `forms/form-content-turn.ts` `honestFormReply`. Off, as before.
 */
export function formEditHonestReplyEnabled(): boolean {
  return envFlag("FORM_EDIT_HONEST_REPLY_ENABLED");
}

/**
 * One answer to "is this a person?" for every reader of who a form is for:
 * somebody on the roster always is; a policy, a practice run ("Practice") or a
 * metric never is (QA, 3 Nov 2026; same flag in both apps). See
 * `forms/person-guard.ts`. Off, as before.
 */
export function personGuardEnabled(): boolean {
  return envFlag("PERSON_GUARD_ENABLED");
}

/**
 * A reply that would open with the same paragraph as the one before it, with
 * no card, is not said again — one line says what moves it on ("It also gave
 * the same refusal 3 times", the sibling app's 2 Nov 2026 scan; same flag in both apps). See
 * `forms/reply-guards.ts`. Off, as before.
 */
export function refusalNoRepeatEnabled(): boolean {
  return envFlag("REFUSAL_NO_REPEAT_ENABLED");
}

/**
 * "my DM told me …" is the manager's own District Manager, never the
 * employee's title on the card (the sibling app's 2 Nov 2026 scan; same flag in both apps).
 * See `forms/reply-guards.ts`. Off, as before.
 */
export function titleNotSpeakersManagerEnabled(): boolean {
  return envFlag("TITLE_NOT_SPEAKERS_MANAGER_ENABLED");
}

/**
 * A new form request for a person already in the chat draws its card from its
 * own turns, not an earlier request's (the sibling app's 2 Nov 2026 scan: "a
 * new late-opening request reused an older trash-and-rugs incident"; same flag
 * in both apps). See `forms/new-request-turns.ts`. Off, as before.
 */
export function newRequestOwnTurnsEnabled(): boolean {
  return envFlag("NEW_REQUEST_OWN_TURNS_ENABLED");
}

/**
 * With a draft open, a turn that names no form, no other person and is not a
 * question is content for that draft — never a new card (the sibling app's
 * 2 Nov 2026 scan: a Corrective Action's next message started a new draft
 * without what the manager had typed, and that one was finalized; same flag in
 * both apps). See `forms/open-draft-turn.ts`. Off, as before.
 */
export function openDraftKeepsTurnsEnabled(): boolean {
  return envFlag("OPEN_DRAFT_KEEPS_TURNS_ENABLED");
}

/**
 * With a Coaching draft open, "yes, do that", "the details we just
 * discussed!!!" and "include the details of rolling rack" are written into the
 * draft's Details, and the answer's "Updating the draft now" / "That's on the
 * card" claims are caught too (a Location Manager, 30 Oct 2026, 2 stars;
 * replayed 3 Nov; same flag in both apps). See `forms/form-content-turn.ts`.
 * Off, as before.
 */
export function formEditRefersBackEnabled(): boolean {
  return envFlag("FORM_EDIT_REFERS_BACK_ENABLED");
}

/**
 * A policy named with more in the same message: the rest goes to the revision
 * of the same draft, and the reply never says "everything else is as it was"
 * over a sentence it dropped (the 2 Nov 2026 scan: "Previous Coaching is when
 * she signed the Policy manual May 2025" left Prior Actions empty; same flag
 * in both apps). See `forms/policy-rest-of-turn.ts`. Off, as before.
 */
export function policyChangeRestOfTurnEnabled(): boolean {
  return envFlag("POLICY_CHANGE_REST_OF_TURN_ENABLED");
}

/**
 * No reply says the form changed, or that something was checked against the
 * records, unless this turn changed the form: "now reads …", "Confirmed
 * against records … matching Woven" are caught on every line about the form,
 * the name or the record (the 2 Nov 2026 scan; same flag in both apps). See
 * `forms/form-content-turn.ts`. Off, as before.
 */
export function claimGuardEnabled(): boolean {
  return envFlag("CLAIM_GUARD_ENABLED");
}

/**
 * "fix her last name …", "the name is supposed to be …", "the correct way is
 * …" correct the name on the open draft, as "change her name to …" does (the
 * 2 Nov 2026 scan; same flag in both apps). See `forms/name-correction-words.ts`.
 * Off, as before.
 */
export function nameCorrectionWordsEnabled(): boolean {
  return envFlag("NAME_CORRECTION_WORDS_ENABLED");
}

/**
 * With a draft open, a reply never offers a form selection ("Based on what
 * you've described, I can prepare:") — that heading was all the manager saw
 * (the 2 Nov 2026 scan; same flag in both apps). Off, as before.
 */
export function openFormNoSelectionEnabled(): boolean {
  return envFlag("OPEN_FORM_NO_SELECTION_ENABLED");
}

/**
 * A revised or drafted field never keeps an all-caps angle-bracket token such
 * as "<UNKNOWN>" (the sibling app's live check, 31 Oct 2026; same flag in both apps). See
 * `forms/drafted-text.ts`. Off, as before.
 */
export function anglePlaceholderGuardEnabled(): boolean {
  return envFlag("ANGLE_PLACEHOLDER_GUARD_ENABLED");
}

/**
 * A chat revision whose value for a field is the text already there is not a
 * change, so the reply never says "Updated" for it (the sibling app's live
 * check A3, 31 Oct 2026; same flag in both apps; protected-file edit approved
 * by Pau in writing). See `forms/chat-revision.ts`. Off, as before.
 */
export function revisionSameValueEnabled(): boolean {
  return envFlag("REVISION_SAME_VALUE_ENABLED");
}

/**
 * "Do the same coaching form for <another>": the new person's draft gets the
 * content of the manager's own earlier form of that template, name swapped
 * (QA, 30 Oct 2026; same flag in both apps). See `forms/same-form-copy.ts`.
 * Off, as before.
 */
export function sameFormCopyEnabled(): boolean {
  return envFlag("SAME_FORM_COPY_ENABLED");
}

/**
 * "A coaching form for my whole staff": no card for everyone. Several
 * locations in scope and none named → asks which; one → lists its staff from
 * the scoped Woven directory (name and position) and asks who the form is for
 * (Pau, 30 Oct 2026; same flag in both apps). See `forms/staff-picker.ts`.
 * Off, as before.
 */
export function staffPickerEnabled(): boolean {
  return envFlag("STAFF_PICKER_ENABLED");
}

/**
 * The whole-staff list shows the store's staff only — store titles, not the
 * office accounts the directory also affiliates with a store (QA, 31 Oct 2026;
 * same flag in both apps). See `forms/staff-picker.ts`. Off, as before.
 */
export function staffPickerStoreTitlesEnabled(): boolean {
  return envFlag("STAFF_PICKER_STORE_TITLES_ENABLED");
}

/**
 * An Assistant Manager's Corrective Action counts the employee's earlier
 * warnings filed by anyone at their locations, shown by level and date only
 * (Pau, 31 Oct 2026, "Yes option A"; same flag in both apps). See
 * `forms/prior-forms.ts`. Off, only their own forms, as before.
 */
export function amPriorWarningsEnabled(): boolean {
  return envFlag("AM_PRIOR_WARNINGS_ENABLED");
}

/**
 * The app's own report names are never read as an employee (the sibling app's
 * live QA, 1 Nov 2026; same flag in both apps). See `ai/report-name.ts`. Off,
 * as before.
 */
export function reportNameNotAPersonEnabled(): boolean {
  return envFlag("REPORT_NAME_NOT_A_PERSON_ENABLED");
}

/**
 * The manager's own name is only for addressing them, never an employee's in an
 * answer (QA, the sibling app's live chat, 1 Nov 2026; same flag in both apps).
 * See `ai/manager-name-guard.ts`. Off, as before.
 */
export function managerNameNotEmployeeEnabled(): boolean {
  return envFlag("MANAGER_NAME_NOT_EMPLOYEE_ENABLED");
}

/**
 * /api/chat streams a slow answer (a 200 with keep-alive bytes, then the
 * answer), so nothing between the browser and the function cuts it off at 30 s
 * (the sibling app's live QA, 1 Nov 2026; same flag in both apps). See
 * `api/streamed-response.ts`. Off, as before.
 */
export function chatResponseStreamEnabled(): boolean {
  return envFlag("CHAT_RESPONSE_STREAM_ENABLED");
}

/**
 * A cut-off answer whose first attempt took over 50 s starts no retry, so a
 * call never stacks past its route's 120 s ceiling (the sibling app's live QA,
 * 1 Nov 2026; same flag in both apps). See `ai/truncation.ts`. Off, as before.
 */
export function truncationRetryBudgetEnabled(): boolean {
  return envFlag("TRUNCATION_RETRY_BUDGET_ENABLED");
}

/**
 * With a draft open, a turn that is only "for whole staff" is the staff list,
 * not another answer about the open draft (QA, the sibling app's live retest,
 * 31 Oct 2026; same flag in both apps). See `forms/staff-picker.ts`. Off, as before.
 */
export function staffPickerBareAnswerEnabled(): boolean {
  return envFlag("STAFF_PICKER_BARE_ANSWER_ENABLED");
}

/**
 * "coaching form for all team members" makes the team Coaching card ("All
 * team members", one store) for every role that may create a coaching form,
 * in every chat — the staff picker no longer refuses it (a Location Manager,
 * 2 Nov 2026, rated 1 star; Pau, 3 Nov: "I need all managers to have it").
 * Same flag in both apps. See `forms/whole-team-coaching.ts`. Off, as before.
 */
export function wholeTeamCoachingEnabled(): boolean {
  return envFlag("WHOLE_TEAM_COACHING_ENABLED");
}

/**
 * With a draft open, "make me a CA for <the same person> for being late to
 * opening this morning" — a request for a form, for that person, mostly about
 * something not said before — is a new card, and the open draft is not
 * touched (QA live check in the sibling app, 3 Nov 2026: the open draft was
 * redrafted from both incidents; the same race reproduces here). See
 * `forms/new-request-open-draft.ts`. Off, as before.
 */
export function newRequestOpenDraftEnabled(): boolean {
  return envFlag("NEW_REQUEST_OPEN_DRAFT_ENABLED");
}

/**
 * The team Coaching card ("All team members") shows no Position row: the team
 * has no one position, and the row read "Not set — tell Bubbles their
 * position" (QA live check, 3 Nov 2026). Read in the browser, so only a
 * statically written `process.env.NEXT_PUBLIC_…` is inlined, at build time.
 * See `features/chat/message-bubble.tsx`. Off, as before.
 */
export function teamCardNoPositionEnabled(): boolean {
  const inlined = process.env.NEXT_PUBLIC_TEAM_CARD_NO_POSITION_ENABLED;
  return typeof inlined === "string" && ON.has(inlined.trim().toLowerCase());
}

/**
 * Two more team-card wordings (QA live check, 3 Nov 2026), read only with
 * WHOLE_TEAM_COACHING on: "store wide everyone needs the reminder to call a
 * manager for cash drawer shortages, overages, and returns" — the team, then
 * what it needs, with no "coaching" in it — is the team Coaching card when no
 * draft is open; and words that only name the audience ("for the whole
 * store") are not handed on as the card's content, so Details does not echo
 * them. Same flag in both apps. See `forms/whole-team-coaching.ts`. Off, as
 * before.
 */
export function teamCardWordingEnabled(): boolean {
  return envFlag("TEAM_CARD_WORDING_ENABLED");
}

/**
 * With CONVERSATION_DRAFT_REUSE on, Create reuses this chat's earlier draft of
 * the same form for the same person. A manager turn since that draft that asks
 * for the form for that person and says what it is about ("make me a CA for
 * <name> for being late to opening this morning") is a new incident: it gets
 * its own draft (the 2 Nov scan, replay case nov2-p2; QA, 3 Nov 2026). See
 * `forms/new-request-turns.ts`. Off, as before.
 */
export function draftReuseNewRequestEnabled(): boolean {
  return envFlag("DRAFT_REUSE_NEW_REQUEST_ENABLED");
}

/**
 * Each line of a Corrective Action's "List previously received coaching
 * and/or corrective action with date signed" read from the Forms Register
 * names the earlier form's policy: "Verbal corrective action (Attendance) —
 * signed 11/02/2026" (Pau, 3 Nov 2026). Coaching lines are unchanged: a
 * Coaching Form has no policy violated. Same flag in both apps. See
 * `forms/prior-forms.ts`. Off, as before.
 */
export function priorActionsPolicyEnabled(): boolean {
  return envFlag("PRIOR_ACTIONS_POLICY_ENABLED");
}

/**
 * The staff picker reuses the store this conversation already settled
 * ("dodge"), instead of asking "Which location's staff…" again (same report;
 * same flag in both apps). See `forms/staff-picker.ts`. Off, as before.
 */
export function staffPickerRememberLocationEnabled(): boolean {
  return envFlag("STAFF_PICKER_REMEMBER_LOCATION_ENABLED");
}

/**
 * A directory row that is a shared or store login ("<Store> Account") is
 * never a team member: not listed, suggested or matched (same report; same
 * flag in both apps). See `forms/employee-match.ts`. Off, as before.
 */
export function sharedLoginNotStaffEnabled(): boolean {
  return envFlag("SHARED_LOGIN_NOT_STAFF_ENABLED");
}

/**
 * Once the staff picker has listed a store's staff in this conversation,
 * another whole-staff turn is told what to do next in one line, never the
 * same refusal and list again (same report; same flag in both apps). See
 * `forms/staff-picker.ts`. Off, as before.
 */
export function staffPickerNoRepeatEnabled(): boolean {
  return envFlag("STAFF_PICKER_NO_REPEAT_ENABLED");
}

/**
 * "Create this coaching form for everyone on my team": one DRAFT Coaching Form
 * per person at the open draft's store, each with the open draft's Details,
 * after one confirmation listing who (Pau, 3 Nov 2026: "also having to
 * replicate that coaching verbiage to all coaching forms so she doesn't have
 * to copy paste"; same flag in both apps). See
 * `forms/coaching-for-everyone.ts`. Off, as before.
 */
export function coachingForEveryoneEnabled(): boolean {
  return envFlag("COACHING_FOR_EVERYONE_ENABLED");
}

/**
 * "She was late last week" with no date read and the form left at today: the
 * Corrective Action draft is told today is not the incident's date, today is
 * not treated as a date the manager gave, and the manager is told to set the
 * date (QA, 29 Oct 2026; same flag in both apps). See
 * `forms/unread-day-date.ts`. Off, as before.
 */
export function unreadDayNotIncidentDateEnabled(): boolean {
  return envFlag("UNREAD_DAY_NOT_INCIDENT_DATE_ENABLED");
}

/**
 * The card's question about a day it cannot read says plainly that it can't
 * guess, and shows the format to type: I can't guess "last week" - what date
 * was it? Type it like 9/11/26. (Pau, 29 Oct 2026; same flag in both apps.)
 * Only with UNREAD_DATE_ASK_ENABLED, which asks the question. Off, the
 * question reads as before.
 */
export function unreadDatePlainAskEnabled(): boolean {
  return envFlag("UNREAD_DATE_PLAIN_ASK_ENABLED");
}

/**
 * Create accepts a card whose roster name the manager typed in part ("katrin
 * dov" for Katrin Dovetail, filled by the AI reader): every word they typed
 * begins a word of the card's name. A later turn naming somebody else still
 * makes the card stale (QA and Pau, 29 Oct 2026; same flag in both apps). See
 * `forms/proposal-currency.ts`. Off, as before.
 */
export function partialNameCardCurrentEnabled(): boolean {
  return envFlag("PARTIAL_NAME_CARD_CURRENT_ENABLED");
}

/**
 * Create accepts a card whose roster person was typed by preferred name and
 * last name ("kit dovetail" for Katrin Dovetail, preferred name Kit) — the
 * creation check otherwise reads the typed name as somebody else (audit, 29
 * Oct 2026; same flag in both apps). See `forms/preferred-name-current.ts`.
 * Off, as before.
 */
export function preferredNameCardCurrentEnabled(): boolean {
  return envFlag("PREFERRED_NAME_CARD_CURRENT_ENABLED");
}

/**
 * A switch turn that names a form of its own ("make it a follow up coaching")
 * is read as typed, not as "change this to a coaching form" (audit, 29 Oct
 * 2026; same flag in both apps). See `ai/form-type-switch.ts`. Off, as
 * before.
 */
export function switchKeepsNamedFormEnabled(): boolean {
  return envFlag("SWITCH_KEEPS_NAMED_FORM_ENABLED");
}

/**
 * Each card from a message that asked for several forms ("a coaching form for
 * A and a CA for B") stays current at Create after later turns that name
 * nobody else and ask for no form (audit, 29 Oct 2026; same flag in both
 * apps). See `forms/proposal-currency.ts`. Off, as before.
 */
export function severalFormsStayCurrentEnabled(): boolean {
  return envFlag("SEVERAL_FORMS_STAY_CURRENT_ENABLED");
}

/**
 * A card whose name, as typed, is a first or preferred name and the start of
 * a surname ("marisol co") is asked about from the manager's roster — "Is
 * this for **Marisol Corvane**?" or "Did you mean …" — in code, whatever the
 * AI reader read (QA and Pau, 29 Oct 2026; same flag in both apps). See
 * `ai/first-name-suggest.ts`. Needs FIRST_NAME_SUGGEST_ENABLED. Off, as before.
 */
export function partialSurnameAskEnabled(): boolean {
  return envFlag("PARTIAL_SURNAME_ASK_ENABLED");
}

/**
 * An answer to the first-name question ("no, jordan testperson") replaces
 * the whole name the manager typed ("marisol co"), not the first name alone
 * (QA live, 29 Oct 2026; same flag in both apps). See
 * `ai/first-name-suggest.ts`. Off, as before.
 */
export function suggestAnswerReplacesTypedEnabled(): boolean {
  return envFlag("SUGGEST_ANSWER_REPLACES_TYPED_ENABLED");
}

/**
 * At Create, a typed surname piece that does not begin the card's surname
 * but has its letters in order ("marisol co" for Marisol Camarillo,
 * "dovtail" for Dovetail) is the card's person when nobody else on the
 * manager's roster fits (QA and Pau, 29 Oct 2026; same flag in both apps).
 * See `forms/loose-name.ts`. Off, as before.
 */
export function partialNameLooseMatchEnabled(): boolean {
  return envFlag("PARTIAL_NAME_LOOSE_MATCH_ENABLED");
}

/**
 * At Create, a name in the conversation that is neither the card's person nor
 * anybody on the manager's roster ("drop wage", "forfeit bonus" in an exit
 * request) does not make the card name "more than one person" (a Buff City
 * manager, 29 Oct 2026; same flag in both apps). See
 * `forms/proposal-currency.ts`. Off, as before.
 */
export function staleNeedsRosterPersonEnabled(): boolean {
  return envFlag("STALE_NEEDS_ROSTER_PERSON_ENABLED");
}

/**
 * The exit form's own shortcut words ("drop wage", "forfeit bonus", "store
 * key", "not eligible for rehire") are never read as a person: not by the
 * chat's "Which of them is this … for" question, not by Create (a Buff City
 * manager, 29 Oct 2026; same flag in both apps). See
 * `forms/answer-not-a-name.ts`. Off, as before.
 */
export function exitTermsNotNamesEnabled(): boolean {
  return envFlag("EXIT_TERMS_NOT_NAMES_ENABLED");
}

/**
 * The Corrective Action form's shortcuts fill their fields: "no PD", "PD
 * applies", "deduct 25" the payroll deduction (Pau, 29 Oct 2026: "recognize
 * all form wording … so when manager type shortcuts, it can understand it";
 * same flag in both apps). Read inline by `forms/payroll-deduct-answer.ts`,
 * which imports nothing. Off, as before.
 */
export function caShortcutWordsEnabled(): boolean {
  return envFlag("CA_SHORTCUT_WORDS_ENABLED");
}

/**
 * REQUEST_LEVEL_NOT_HISTORY_ENABLED (QA, coding-3 item 6, 6 Nov 2026; same flag in both apps; default off).
 * "I need to write up <name> with a written warning for leaving the front desk unattended for 30 minutes on
 * 10/22" was answered "I've treated the earlier warning you mentioned as previous corrective action history"
 * and asked Verbal or Written: the incident's date (before today) made the level asked for history. On: a
 * level in the same clause as the request for this form is this form's level, whatever date the clause
 * carries (`forms/warning-level.ts` levelInRequestClause). A dated warning in a clause of its own ("she got
 * a written warning on 9/1") stays history. Off, as before.
 */
export function requestLevelNotHistoryEnabled(): boolean {
  return envFlag("REQUEST_LEVEL_NOT_HISTORY_ENABLED");
}

/**
 * The exit form's shortcuts fill their fields: "drop wage" the minimum-wage
 * line, "deducted for store key" the key line, "called to quit" How Employee
 * Resigned, "immediate voluntary term" / "quit, no notice given" the
 * Immediate Voluntary box, "abandoned job" / "job abandonment" No Call No
 * Show (Pau, 29 Oct 2026: "recognize all form wording … prioritize the exit form";
 * same flag in both apps). See `forms/exit-details.ts`, `forms/exit-facts.ts`.
 * Off, as before.
 */
export function exitShortcutWordsEnabled(): boolean {
  return envFlag("EXIT_SHORTCUT_WORDS_ENABLED");
}

/**
 * A name candidate inside a street address ("Ne Oakfield Lane", "lees
 * summit", "mo" in "125 Ne Oakfield Lane, lees summit, MO. 64064") is not a
 * person (QA, 29 Oct 2026; same flag in both apps). See
 * `forms/answer-not-a-name.ts`. Off, as before.
 */
export function streetAddressNotANameEnabled(): boolean {
  return envFlag("STREET_ADDRESS_NOT_A_NAME_ENABLED");
}

/**
 * A level request with a date before "for" ("create a written on 10/20 for
 * <name>, she was late again") is the request, not the account: the card's
 * Observation and a draft written from the manager's words start with what
 * happened (QA, the sibling app's live chat, 30 Oct 2026; same flag in both
 * apps). See `ai/remap-incident.ts` and `forms/draft-never-blank.ts`. Off, as
 * before.
 */
export function levelRequestDateEnabled(): boolean {
  return envFlag("LEVEL_REQUEST_DATE_ENABLED");
}

/**
 * Name checks and the staff list read only the manager's own stores' active
 * people from the Woven-synced directory, paged under the database's 1,000-row
 * cap, minus the reviewed store logins ("Dodge Account") in
 * `forms/roster-non-person.ts` (master plan step 1, 3 Nov 2026; same flag in
 * both apps). See `readStoreRoster` in `forms/employee-roster.ts`. Off, as
 * before: the whole directory is read and scoped in memory.
 */
export function rosterStoreScopedEnabled(): boolean {
  return envFlag("ROSTER_STORE_SCOPED_ENABLED");
}

/**
 * With a form open, a capitalised word in the manager's edit is "another
 * person" only when it matches somebody active at the manager's own stores
 * (master plan step 2, 3 Nov 2026; same flag in both apps). See
 * `forms/roster-name-gate.ts`. Off, as before.
 */
export function formEditNameGateRosterEnabled(): boolean {
  return envFlag("FORM_EDIT_NAME_GATE_ROSTER_ENABLED");
}

/**
 * "TBD", "TBA", "TBC", "to be determined", "to be confirmed" in a drafted field
 * are placeholders like `[Follow-Up Date]`: the sentence carrying one is left
 * out, and a field that was only that is left empty for the manager (master
 * plan step 5, 3 Nov 2026; same flag in both apps). "N/A" is one only as the
 * whole value of a field the model wrote, never on a payroll or prior-actions
 * field. See `forms/drafted-text.ts`. Off, as before.
 */
export function formPlaceholderWordsEnabled(): boolean {
  return envFlag("FORM_PLACEHOLDER_WORDS_ENABLED");
}

/**
 * "Yes" to "Is this for <name>?" keeps the form request the manager made in a
 * later turn than the one that gave the first name (replay set b2, 3 Nov 2026;
 * same flag in both apps). See `ai/first-name-suggest.ts`. Off, as before.
 */
export function firstNameYesKeepsRequestEnabled(): boolean {
  return envFlag("FIRST_NAME_YES_KEEPS_REQUEST_ENABLED");
}

/**
 * A chat edit or a redraft of an open form is read as a patch (field, value,
 * how, the manager's words it came from) and merged by code: typed fields are
 * never blanked, a "replace" on one needs the manager's own words, dates and
 * amounts must be ones the manager stated, prior actions are de-duplicated
 * (Step B, 3 Nov 2026). See `forms/form-reducer.ts` and
 * `forms/form-patch-model.ts`. Nothing reads it yet. Off, as before.
 */
export function formPatchReducerEnabled(): boolean {
  return envFlag("FORM_PATCH_REDUCER_ENABLED");
}

/**
 * The reply to a form edit says what the saved form now holds: "Changed
 * <Label> to <value>" per changed field, or that nothing changed — never
 * "Updated" without a change (Step B, 3 Nov 2026). See
 * `forms/form-diff-reply.ts`. Nothing reads it yet. Off, as before.
 */
export function formReplyFromDiffEnabled(): boolean {
  return envFlag("FORM_REPLY_FROM_DIFF_ENABLED");
}

/**
 * Every manual quote and "<Heading>, JBA Policy Manual p.N" label is checked
 * by code against the retrieved manual chunks: a quote must be a verbatim
 * part of one, the heading one of theirs, the page the manual's (Step A,
 * 3 Nov 2026). See `ai/policy-from-manual/`. Nothing reads it yet. Off, as
 * before.
 */
export function policyCitationCheckEnabled(): boolean {
  return envFlag("POLICY_CITATION_CHECK_ENABLED");
}

/**
 * One writer for every form edit (Step 2a, 4 Nov 2026): a chat correction, a
 * redraft, a same-form copy, a policy change, a reopen, the stated facts and
 * the Action Plan's sync hand their values to `writeFormEdits`
 * (`forms/form-write.ts`), which runs them through the form reducer — all or
 * nothing, protected values and dropped words refused — and saves through the
 * existing writers. Independent of the Step B flags. Off, every path calls its
 * old writer and `form-write` is never loaded.
 */
export function formEditSingleWriterEnabled(): boolean {
  return envFlag("FORM_EDIT_SINGLE_WRITER_ENABLED");
}

/**
 * FORM_EDIT_SAID_REPLACEMENT_ENABLED (QA's Step B gate, 6 Nov 2026; default
 * off; only with FORM_EDIT_SINGLE_WRITER_ENABLED). The single writer refused
 * "fix her last name, it is Laine" (drops_words) and an offense changed to
 * "absenteeism" (unknown_option). With this flag on, an old word the new text
 * replaces in place with a word the manager's latest message says may go, and
 * an old offense box is written as the box that replaced it; a word dropped
 * with nothing in its place is still refused (`forms/form-reducer.ts`). Off,
 * as before.
 */
export function formEditSaidReplacementEnabled(): boolean {
  return envFlag("FORM_EDIT_SAID_REPLACEMENT_ENABLED") && formEditSingleWriterEnabled();
}

// --- coding 5 flags (Step B edit reader; placed after FORM_EDIT_SAID_REPLACEMENT, not at a block end, so merges do not collide) ---

/**
 * FORM_PATCH_READER_FIXES_ENABLED (coding 5, 7 Nov 2026; QA's Step B target, the real "I haven't changed the
 * <form>" refusals; same flag in both apps; default off). Step B's reader, fixed where the real-AI trace (6 Nov)
 * refused faithful edits. Active only with FORM_PATCH_REDUCER_ENABLED. On:
 *   (1) a patch whose values are already on the form answers "<Field> already says that" (never "Updated"); an
 *       empty or "other" reading goes to the old path, whose writes may not repeat the field, echo the instruction
 *       or (after an empty reading) add nothing new;
 *   (2) the evidence and word checks read the form's own employee name as said (a "<Name> must practice …"
 *       for "Add that she Must Practice …"), match a word by its stem ("missed" for "missing"), and hold every
 *       FACT word — a number, a date, a capitalised word inside a sentence — to the manager's words or the
 *       form; only a few other added words (at most 2, or 15% of them) may be unsaid;
 *   (3) Pau's "yes rewrite" (7 Nov 2026): the reader may answer how "reword" when the latest message asks for
 *       the wording to change; the field's text is rewritten in new words, every fact still the manager's or
 *       the form's, every protected value (name, date, amount) kept (one prompt line added, never edited);
 *   (4) the form's Job Title is a field the reader may set, only to words of the latest message ("change her
 *       position to Team Member"), written as the manager's own edit.
 * Off, the reader, the schema, the prompt and the reducer are byte for byte as before.
 */
export function formPatchReaderFixesEnabled(): boolean {
  return envFlag("FORM_PATCH_READER_FIXES_ENABLED") && formPatchReducerEnabled();
}

/**
 * EDIT_POLICY_ASK_ENABLED (QA's live run, 7 Nov 2026; coding 5; same flag in both apps; default off; only with
 * FORM_PATCH_REDUCER_ENABLED). "I need you to make it about showing up late and please list the policy make the
 * date for 10/14/26." on an open Coaching Form changed Details and said nothing about the policy. On: the patch
 * reader says whether the latest message asks for the policy (`policy_asked`, a prompt line added after the
 * approved text), and the app lists it the way a first draft does — the manual sections the account reads as, as
 * its own "Policy reference" line on the account field — or the reply says it found none and asks which applies
 * (`forms/edit-policy-ask.ts`). Off, as before.
 */
export function editPolicyAskEnabled(): boolean {
  return envFlag("EDIT_POLICY_ASK_ENABLED") && formPatchReducerEnabled();
}
/**
 * STEP_B_DATE_WITH_ABOUT_ENABLED (the Bubbles round-5 gate, 8 Nov 2026; QA's ruling; coding 5; default off; only with
 * STEP_B_DATE_SAID_ENABLED and STEP_B_MAKE_IT_ABOUT_ACCOUNT_ENABLED). With both on, a turn that says what the form is
 * about AND its date ("… make it about showing up late … make the date for 10/14/26") was handed to the old path and
 * the Date was never written. On: that turn stays on Step B (the reader's edits and the date are written), and the
 * reply says plainly that the account field was kept (`forms/form-patch-turn.ts`). Off, as before.
 */
export function stepBDateWithAboutEnabled(): boolean {
  return envFlag("STEP_B_DATE_WITH_ABOUT_ENABLED");

}

/**
 * COMPLAINT_ACCOUNT_ENABLED (port of the sibling app's flag; QA's audit, 7 Nov 2026, a real manager's chat here on
 * 3 Nov 2026; default off). "create a ca form for <name>", then "verbal warning The date she complained was Oct 31st .
 * The customer said she was giving her an attitude …" made the card's Issue "verbal warning The date she complained
 * was Oct 31st" and read the level as an earlier warning ("I've treated the earlier warning you mentioned as previous
 * corrective action history"). On: a level that opens the turn and runs straight on into a new sentence is this
 * form's Type of Warning, the date after it belongs to that sentence (`forms/warning-level.ts`); the Issue never opens
 * with the level, and a sentence that only dates the account is not the account (`forms/incident-issue.ts`). Off, as
 * before.
 */
export function complaintAccountEnabled(): boolean {
  return envFlag("COMPLAINT_ACCOUNT_ENABLED");
}

/**
 * UNKNOWN_NAME_ASK_WHO_FOR_ENABLED (QA's round-6 audit, 8 Nov 2026; coding 5; default off; only with
 * UNKNOWN_NAME_ASK_ENABLED). The live repeat "I still need a name that is on the directory — **<name>** isn't. What is
 * the employee's full name as the directory has it?" says "I still need" beside no "Who is this … for?" (the replay
 * pack's `stillAsks` check refuses it). On: every ask is worded around "Who is this **<form>** for?", the wording of
 * the sibling app's port (`ai/unknown-name-ask.ts`). Off, as before.
 */
export function unknownNameAskWhoForEnabled(): boolean {
  return envFlag("UNKNOWN_NAME_ASK_WHO_FOR_ENABLED");
}

/**
 * CORRECTED_DATE_KEPT_ENABLED (the sibling app's round-5 trace of corrective-action-conversation-qa Q6, 8 Nov 2026;
 * coding 5; same flag in both apps; default off). "the meeting was actually on 10-19-26", then "sorry, the verbal ca
 * was on 9-2-26 not 9-1-26": the card's date became 09-02, the prior step's corrected date, and Create saved it. On: a
 * correction of a prior step's date is never the form's date (`forms/incident-dates.ts` correctedIncidentDate). Off,
 * as before.
 */
export function correctedDateKeptEnabled(): boolean {
  return envFlag("CORRECTED_DATE_KEPT_ENABLED");
}

/**
 * MISSED_SHIFT_NOT_LATENESS_ENABLED (the sibling app's live Create test, QA round 5, 8 Nov 2026; sf-s38; coding 5; same
 * flag in both apps; default off). A Corrective Action for missed weekend shifts was saved with the Attendance
 * lateness plan ("expected to arrive on time … Continued lateness …"), not the plan the card showed. On: an account of
 * a missed or no-show shift, a call-out or an absence that says nothing about lateness keeps the general plan, as a
 * missed meeting does under MEETING_NOT_LATENESS_PLAN (`forms/attendance-action-plan.ts`). Off, as before.
 */
export function missedShiftNotLatenessEnabled(): boolean {
  return envFlag("MISSED_SHIFT_NOT_LATENESS_ENABLED");
}

/**
 * POLICY_SET_ASIDE_PLAN_ENABLED (the Bubbles live tester, QA, 8 Nov 2026, round 5 on; coding 5; default off; with
 * PROPOSAL_POLICY_SET_ASIDE). "take the attendance policy off the form" made the card say "**Policy:** none", while
 * its Action plan still reviewed the Attendance policy. On: the plan names no policy that was taken off, the ones
 * left or "the applicable company policy" (`forms/policy-set-aside.ts`). Off, as before.
 */
export function policySetAsidePlanEnabled(): boolean {
  return envFlag("POLICY_SET_ASIDE_PLAN_ENABLED");
}

/**
 * POLITE_ABOUT_STAYS_CARD_ENABLED (the Bubbles live tester, QA, 8 Nov 2026; coding 5; default off). With a card open,
 * "can you make it for missing out monthly meeting" lost the card (a policy answer); without "can you" it kept it. On:
 * that polite request reaches the proposal without its polite lead (`ai/polite-about-request.ts`; the call is one
 * line in `ai/server-ask.ts`). Off, as before.
 */
export function politeAboutStaysCardEnabled(): boolean {
  return envFlag("POLITE_ABOUT_STAYS_CARD_ENABLED");
}

/**
 * REQUEST_PARTICIPLE_LEAD_ENABLED (port of the sibling app's flag; its round-5 live check, 8 Nov 2026; coding 5; same
 * flag in both apps; default off). "I need a corrective action made for under performance. <A> was below on PPTA, …"
 * made the card's Issue the whole request. On: "<form> made / done / written up for …" is read as the request, and a
 * request whose for-clause is only a sales reason leaves the Issue to the account (`forms/incident-issue.ts`). Off, as
 * before.
 */
export function requestParticipleLeadEnabled(): boolean {
  return envFlag("REQUEST_PARTICIPLE_LEAD_ENABLED");
}

/**
 * UNDATED_ACCOUNT_BRIEF_ENABLED (QA's live Create test, 8 Nov 2026; coding 5; same flag in both apps; default off). An
 * account with no date ("missing her saturday and sunday shifts …") was saved as "… scheduled shifts on November 8,
 * 2026", the day the form was created: the draft brief told the model the form's date was the incident's. On: with no
 * date stated (a stated "today" is one), the brief says the form is dated the day it is created and no date goes into
 * the account (`forms/form-date-grounding.ts` formDateBrief). Off, as before.
 */
export function undatedAccountBriefEnabled(): boolean {
  return envFlag("UNDATED_ACCOUNT_BRIEF_ENABLED");
}
/**
 * EXIT_LETTER_SIGNER_NOT_SUBJECT_ENABLED (QA, the Bubbles round-6 live test, 9 Nov 2026; coding 5; same flag in both
 * apps; default off). "create an exit form for <B>, team member … Here is the termination letter: '… <C>, District
 * Manager'" offered <B>, <C> and "District Manager'" as the exit form's person, and took "District Manager" as the
 * Position. On: when the turn names the form's person, the proposal reads it without a letter's closing "<Name>,
 * <Title>" sign-off of another person (`ai/letter-signer.ts`). Off, as before.
 */
export function exitLetterSignerNotSubjectEnabled(): boolean {
  return envFlag("EXIT_LETTER_SIGNER_NOT_SUBJECT_ENABLED");
}

/**
 * POSSESSIVE_PLACE_NOT_PERSON_ENABLED (QA, the Bubbles round-6 live test, 9 Nov 2026; coding 5; same flag in both apps;
 * default off). "create a CA for Lee's Summit Plaza, she was late on 10-20-26" made a card for Employee "Lee". On: a
 * card whose person is only ever the possessive of a place ("<Name>'s <store name>", "<Name>'s … Plaza") loses that
 * name and asks who the form is for (`forms/possessive-place.ts`, after PERSON_GUARD in the chat route). Off, as before.
 */
export function possessivePlaceNotPersonEnabled(): boolean {
  return envFlag("POSSESSIVE_PLACE_NOT_PERSON_ENABLED");
}

/**
 * OFF_ROSTER_ASK_BEFORE_CARD_ENABLED (QA, the Bubbles round-6 live test, 9 Nov 2026; coding 5; same flag in both apps;
 * default off). "create a coaching form for <full name not on the roster>" gave a ready card with no question. On: for a
 * store-scoped manager, such a card is held back once and the reply asks "I can't find <name> on your roster — is that
 * the right name, or are they at another store?", with OFF_ROSTER_CONFIRM's "reply use <name>" offer
 * (`forms/off-roster-ask.ts`). District, region and global managers are never held up. Off, as before.
 */
export function offRosterAskBeforeCardEnabled(): boolean {
  return envFlag("OFF_ROSTER_ASK_BEFORE_CARD_ENABLED");
}

/**
 * EXIT_LETTER_ADDRESSEE_ENABLED (ported from the sibling app: QA's live test there, 9 Nov 2026; coding 5; same flag in
 * both apps; default off; with EXIT_LETTER_SIGNER_NOT_SUBJECT_ENABLED). "I need an exit form with this information." and
 * a termination letter to <A> signed "Sincerely,\n<C>\nDistrict Manager" gave the exit card the signer's title, and the
 * first no-show date as the Resignation Date; with <A> off the roster the signer was offered. On: the letter's
 * salutation names the form's person when no "form for <X>" does, a sign-off on lines of its own is not read
 * (`ai/letter-signer.ts`), another person's title on the exit read-back is the employee's own or goes
 * (`ai/title-of-the-employee.ts`), and a stated "terminated, effective <date>" is the Resignation Date. Off, as before.
 */
export function exitLetterAddresseeEnabled(): boolean {
  return envFlag("EXIT_LETTER_ADDRESSEE_ENABLED");
}

/**
 * POSSESSIVE_PLACE_ACCOUNT_ENABLED (QA, the Bubbles round-7 live test, 9 Nov 2026; coding 5; same flag in both apps;
 * default off; with POSSESSIVE_PLACE_NOT_PERSON_ENABLED). The ask-who card for "create a CA for Lee's Summit Plaza, she
 * was late on 10-20-26" read "What happened: Lee's Summit Plaza". On: that card's Issue is the words after the place
 * ("she was late on 10-20-26"), or blank (`forms/possessive-place.ts`). Off, as before.
 */
export function possessivePlaceAccountEnabled(): boolean {
  return envFlag("POSSESSIVE_PLACE_ACCOUNT_ENABLED");
}

/**
 * MISSED_SHIFT_CITES_ATTENDANCE_ENABLED (QA, the Bubbles round-7 live test, 9 Nov 2026; coding 5; same flag in both
 * apps; default off). "create a CA for <A>, not showing up to her shifts on 11/7 and 11/8" made a card with no Policy
 * line. On: an account that names no policy and says a shift was not shown up to, missed, skipped or not worked reads
 * as Attendance, said on the card as "Attendance — read from this request" (`forms/ca-policy.ts`). Off, as before.
 */
export function missedShiftCitesAttendanceEnabled(): boolean {
  return envFlag("MISSED_SHIFT_CITES_ATTENDANCE_ENABLED");
}

/**
 * EXIT_LINE_ANSWERS_ADD_UP_ENABLED (QA, the Bubbles round-7 live test, 9 Nov 2026; coding 5; same flag in both apps;
 * default off; with FIELD_LABEL_NOT_A_QUESTION_ENABLED). An exit form answered one field per turn lost How Employee
 * Resigned once a later turn filled another field: the earlier "how employee resigned - …" turn was read as a question
 * and left out of the form's turns. On: a turn that fills an exit field by its label is never a question
 * (`forms/employment-change.ts` isQuestion), so the line answers add up. Off, as before.
 */
export function exitLineAnswersAddUpEnabled(): boolean {
  return envFlag("EXIT_LINE_ANSWERS_ADD_UP_ENABLED");
}
/**
 * LETTER_GREETING_NOT_NAME_ENABLED (QA, 9 Nov 2026; coding 5; same flag in both apps; default off). A letter opening
 * "Dear <A>," gave the exit card the employee "Dear <A>", no Job Title and no store, on the roster or off it. On: a
 * letter's salutation word (Dear, Hi, Hello, Hey, To, Attn, Good morning, …) before the addressee is not part of the
 * name; the proposal reads "<A>," (`ai/letter-signer.ts`). Off, as before.
 */
export function letterGreetingNotNameEnabled(): boolean {
  return envFlag("LETTER_GREETING_NOT_NAME_ENABLED");
}

/**
 * EXIT_FORM_DATE_FROM_TERMINATION_ENABLED (ported from the sibling app: QA's live round 11 there, 9 Nov 2026; coding 5;
 * same flag in both apps; default off). A termination letter "… is terminated, effective 11/08/2026 … no-call no-shows
 * on 11/3, 11/5 and 11/7" gave the exit card the Date November 7 (the last no-show) beside Resignation Date November 8.
 * On: an exit card whose manager states the termination's effective date is dated that day, in the card and in the
 * reply's Date line (`forms/exit-form-date.ts`). Off, as before.
 */
export function exitFormDateFromTerminationEnabled(): boolean {
  return envFlag("EXIT_FORM_DATE_FROM_TERMINATION_ENABLED");
}

// --- end coding 5 flags ---

/**
 * The edit tool in the main call (Step 3, 4 Nov 2026): with a draft form open
 * and a turn that is not a correction or a policy change (a question-phrased
 * turn too, Pau's ruling A3), the
 * answering call is offered one tool, `edit_form`, with the open form as JSON
 * in one extra data block. A tool call is written through `writeFormEdits`
 * (path "tool", all or nothing) and the reply is the saved diff; the model's
 * text is not shown. No call, a refusal or nothing changed: the turn goes to
 * the redraft, the copy and the revision as before. One model call, no tool
 * result round trip. See `forms/form-edit-tool.ts`. Needs
 * FORM_EDIT_SINGLE_WRITER_ENABLED too: off unless both are on. Off, the main
 * request is byte for byte as before and the Step B patch turn runs as it did.
 */
export function formEditToolInStreamEnabled(): boolean {
  return envFlag("FORM_EDIT_TOOL_IN_STREAM_ENABLED") && formEditSingleWriterEnabled();
}

/**
 * The abbreviation glossary (QA's overnight scan, 4 Nov 2026, sf-s12: "I need
 * to make a corrective action for msb"). The approved table, `CHAT_GLOSSARY`
 * in `ai/glossary.ts`, is sent as one extra context block in the main
 * answering call and in the form-intake calls that read the employee from the
 * manager's words, and a name candidate that is a term in it ("msb") is never
 * the employee: the manager is asked who the form is for instead. Off, every
 * request and every reader is byte for byte as before.
 */
export function chatGlossaryEnabled(): boolean {
  return envFlag("CHAT_GLOSSARY_ENABLED");
}

/**
 * Sales and MSB corrective actions cite the Standards of Conduct (client
 * request relayed by Pau, 4 Nov 2026). A Corrective Action whose account reads
 * as the Under Performance offense type (results against a sales or
 * performance target, the reading `ca-policy.ts` already makes) or uses a term
 * from the approved glossary (`ai/glossary.ts`: MSB, Must See Behaviors) is
 * read as the Standards of Conduct: the card says so, the draft ticks that box
 * and Direct policy cites the manual's section by heading and page. The
 * drafting model is also told so, in one added line. Off, every reading, card
 * line, prompt and draft is byte for byte as before. See `forms/ca-sales-policy.ts`.
 */
export function caSalesPolicyEnabled(): boolean {
  return envFlag("CA_SALES_POLICY_ENABLED");
}

/**
 * CA_PERFORMANCE_REASON_ENABLED (QA, coding-3 item 5, 5 Nov 2026; default
 * off; same flag in both apps; only effective with CA_SALES_POLICY_ENABLED).
 * "can you write me a Ca for <name> for performance for october" got "You
 * haven't told me what happened yet": the bare "performance" is neither a
 * metric named and judged (`statesMetricShortfall`) nor the removed Under
 * Performance box's name. On, the sentence that asks for the Corrective
 * Action naming performance (the EPP reader's existing performance pattern,
 * `namesPerformance` in `forms/epp-policy.ts`), with nothing else read from
 * the account, is the sales-performance reading: the card cites the
 * Standards of Conduct and does not ask what happened. See `withSalesPolicy`
 * in `forms/ca-policy.ts`. Off, as before.
 */
export function caPerformanceReasonEnabled(): boolean {
  return envFlag("CA_PERFORMANCE_REASON_ENABLED");
}

/**
 * No false "Updated" after a form edit (Step 4, 4 Nov 2026). The one writer
 * refuses, on the tool, patch, revision and correction paths, an op that sets
 * a field to the value it already has (`same_value`) and an op whose value
 * holds the manager's whole latest message of 3 words or more
 * (`copies_message`, the overnight scan's sf-s11); both hand the turn off as
 * any refusal does. On a turn the edit tool was offered, the reply about the
 * form comes only from the saved diff ("Updated: <label>: <value>"), and an
 * empty diff says "I didn't change anything on the form. Tell me which part
 * to change and what it should say." See `forms/form-noop-reply.ts`. Needs
 * FORM_EDIT_SINGLE_WRITER_ENABLED: off unless both are on. Off, nothing
 * changes.
 */
export function formEditNoopGuardEnabled(): boolean {
  return envFlag("FORM_EDIT_NOOP_GUARD_ENABLED") && formEditSingleWriterEnabled();
}

/**
 * Step 5, names from the roster: first piece, the overnight scan's sf-s19
 * "metrics read as people". A metric is never read as a person, and never
 * stripped from the text (Pau, 4 Nov 2026: "I need a corrective action verbal
 * for <name>. This is for Under Performance on PPTA, LPSVA, Club Average, Club
 * Close %, and Spa %.").
 *
 * When the message names somebody on the roster (an exact or close match, or
 * a roster first or preferred name typed in lowercase: "for perpetua"), a
 * name candidate that matches nobody exactly or closely and is not shaped
 * like anyone on the roster (`forms/roster-shape.ts`: a 2+ word candidate
 * whose first word is nobody's first name, one word that is nobody's first or
 * last name) is left in the question: not stripped, not announced as "I
 * couldn't find … in the Woven roster", and not cleared from the card; with
 * the person guard's roster read this turn the name reader drops it too, so it
 * is never the card's employee (`forms/answer-not-a-name.ts`). A message that
 * names nobody on the roster is read as before: "Zuleika Brightwell" typed
 * alone is still said back as not on the roster. One exception (QA for Pau,
 * 4 Nov 2026): one word typed all in lowercase that is nobody's first,
 * preferred or last name on the roster is never a name ("CA for under
 * performance on Club Close % and Spa %": "under" is not said back or put on
 * the card; the reply asks for the employee).
 *
 * Works with CA_SALES_POLICY_ENABLED off too (QA, 4 Nov 2026). It used to
 * need the sales policy: alone, "Under Performance" kept in the question is
 * read as a metric-only request and a Corrective Action card is refused ("I
 * won't open formal corrective action off a metric") — main only made a card
 * because "Under" was stripped. That refusal is the policy's answer with the
 * sales policy off. But a message that names another form where the person
 * goes ("I need a corrective action for Coaching Form. This is for Under
 * Performance on Club Close % and Spa %.") is not a Corrective Action, so the
 * refusal never runs, and the sibling app made a Coaching Form card for "Club
 * Close" in production; here the reply said "I couldn't find **Club Close**
 * or **Under** in the Woven roster". The request slot and the list rule need
 * no sales policy, so the flag is FORM_NAME alone.
 *
 * Part 2 (QA for Pau, 5 Nov 2026), roster-free: when the message's first
 * sentence asks for a form "… for <Name>", that name is its only employee
 * candidate, and a capitalised item of a list of three or more is never one
 * (`forms/request-slot.ts`). A first name typed with a surname that is not
 * close to a roster person's is never offered as them ("Remy Fenn" is not
 * Remy Calder). Off, as before.
 */
export function formNameFromRosterEnabled(): boolean {
  return envFlag("FORM_NAME_FROM_ROSTER_ENABLED");
}

/**
 * PAST_FORMS_BEFORE_LIBRARY_ENABLED (Pau, 5 Nov 2026; overnight scan sf-s29,
 * default off). "are there any coaching and ca's for <name>" was answered
 * from the forms library ("Yes. **Corrective Action Form** — …") instead of
 * the forms on file for that person. On: when the forms-library check
 * (`detectInventoryQuestion`) would answer a message that names a person or
 * asks about forms already on file, the past-forms lookup
 * (`chat-form-records.ts`) runs for it instead and the library answer steps
 * aside. "do we have a coaching form?" still gets the library answer. Off, as
 * before.
 */
export function pastFormsBeforeLibraryEnabled(): boolean {
  return envFlag("PAST_FORMS_BEFORE_LIBRARY_ENABLED");
}

/**
 * COACHING_ASKS_WHAT_HAPPENED_ENABLED (Pau, 5 Nov 2026, sf-s27; default off).
 * "Create a coaching form." → "<name>" answered "Everything I need is here …
 * I have the employee and the store." with no incident and no draft. On: a
 * Coaching Form card for a person with no account in the manager's turns for
 * it does not say it has everything; it asks what happened, once per card
 * (`ai/coaching-what-happened.ts`). Off, as before.
 */
export function coachingAsksWhatHappenedEnabled(): boolean {
  return envFlag("COACHING_ASKS_WHAT_HAPPENED_ENABLED");
}

/**
 * A question that asks about the Corrective Action and says what happened is
 * the account (Pau, sf-s28, 5 Nov 2026): "can i give a ca for not signing off
 * on the cleaning check list" was dropped from the form's turns as a question
 * naming nobody. See `turnsAboutThisForm` in `ai/form-proposal.ts`. Off, as
 * before.
 */
export function incidentFromEarlierTurnEnabled(): boolean {
  return envFlag("INCIDENT_FROM_EARLIER_TURN_ENABLED");
}

/**
 * TITLE_OF_THE_EMPLOYEE_ENABLED (QA, 5 Nov 2026, R2; default off). One
 * employee's story naming their district manager in passing ("When <employee>
 * spoke with District manager <name> …") gave the card Position "District
 * Manager". On: a title the manager's words attach to another named person
 * (`forms/title-of-another-person.ts`) is never the card's Position; the
 * employee's Woven position stands. Off, as before.
 */
export function titleOfTheEmployeeEnabled(): boolean {
  return envFlag("TITLE_OF_THE_EMPLOYEE_ENABLED");
}

/**
 * ROSTER_NAME_IN_CANDIDATE_ENABLED (QA, 5 Nov 2026, R2; found in the sibling
 * app, same flag in both; default off). One employee's story that names their
 * district manager in passing ("When <employee> spoke with District manager
 * <name> …"): with FORM_NAME_FROM_ROSTER_ENABLED on, the candidate
 * "When <employee>" is set aside as shaped like nobody on the roster (its
 * first word is nobody's first name). There the card went to the district
 * manager; here it stays on the employee, through another reader. On: a
 * candidate whose last words are a roster person's first name, or a
 * roster-shaped name, could be that person (`forms/roster-shape.ts`
 * couldBeOnRoster). Off, as before.
 */
export function rosterNameInCandidateEnabled(): boolean {
  return envFlag("ROSTER_NAME_IN_CANDIDATE_ENABLED");
}

/**
 * ROSTER_NEAR_MISS_ENABLED (QA's testers, 5 Nov 2026, R3/R5/R7; default off,
 * on with FORM_NAME_FROM_ROSTER_ENABLED). A real, active roster person's
 * surname typed with one letter wrong: before the flip the card's Employee was
 * the name as typed; with FORM_NAME on it was "Not yet", the Action Plan still
 * named the person, and the reply asked "Who is this form for?". On: (a) a
 * near-miss of exactly one roster name gets "Is this for <roster full name>?"
 * (`forms/roster-only-names.ts` oneCloseRosterPerson also reads the typed-name
 * matcher's close name); (b) with no employee on the card, no reply text names
 * the person who is not on it. Off, as before.
 */
export function rosterNearMissEnabled(): boolean {
  return envFlag("ROSTER_NEAR_MISS_ENABLED");
}

/**
 * NEAR_MISS_DETAILS_ACCEPT_ENABLED (QA's Bubbles gate on 4d42c342, 7 Nov 2026; default off). With FORM_NAME on, a
 * full name typed close to one roster person ("Corvina Ashdown Vellacot") got "Is this for **<roster name>**? Tell me
 * if that should change.", and the next turn ("verbal warning, no payroll deduct, part-time team member,") got the
 * same question again: the answer reader took only "yes" or a name, the details were dropped and no card came. On: a
 * turn after that question that gives form details (a warning level or a payroll answer, by the app's own readers)
 * and does not turn the name down accepts the asked name, when the manager typed that person's first name and a
 * surname close to theirs (`ai/first-name-suggest.ts` chosenName). A first name typed alone is still asked, as
 * before. Off, as before.
 */
export function nearMissDetailsAcceptEnabled(): boolean {
  return envFlag("NEAR_MISS_DETAILS_ACCEPT_ENABLED");
}

/**
 * REPLY_MATCHES_CARD_ENABLED (QA for Pau, 5 Nov 2026; default off). The last
 * step of every chat turn compares the finished reply with the finished card
 * and makes the reply agree with it: no employee on the card, no person named
 * and "Who is this form for?"; an employee on the card, never asked who; one
 * policy, the card's; no removed Type of Offense label; never "You haven't told
 * me what happened yet" beside an account (`ai/reply-matches-card.ts`). Off, as
 * before.
 */
export function replyMatchesCardEnabled(): boolean {
  return envFlag("REPLY_MATCHES_CARD_ENABLED");
}

/**
 * ROSTER_COMPOUND_SURNAME_ENABLED (the re-flip's rollback, 5 Nov 2026; default
 * off). The flip's live testers (R3/R5/R7): a real employee's surname is two
 * words, and the manager typed one with a transposed or swapped letter. The
 * matcher compared only the typed last word with the whole two-word surname,
 * so it was never close: with FORM_NAME + ROSTER_NEAR_MISS the card emptied and
 * asked who. On: a compound surname is compared word by word
 * (`forms/employee-match.ts` compoundSurnameScore). Off, as before.
 */
export function rosterCompoundSurnameEnabled(): boolean {
  return envFlag("ROSTER_COMPOUND_SURNAME_ENABLED");
}

/**
 * ROSTER_NOT_FOUND_ANY_PHRASING_ENABLED (QA-A/QA-B, the re-flip's live testers, 5 Nov 2026; default off). With
 * FORM_NAME + ROSTER_NEAR_MISS on, an off-roster full name got no "I couldn't find **<name>** in the Woven roster"
 * note when the request did not put it straight after "for" with a comma or period ("i have an employee, <name>
 * that needs …", or "… for <name>" at the end). On: the note also reads "employee, <Name>" and "for <Name>" at the
 * end of the message, Title Case names only (`forms/roster-only-names.ts` notFoundName). Off, as before.
 */
export function rosterNotFoundAnyPhrasingEnabled(): boolean {
  return envFlag("ROSTER_NOT_FOUND_ANY_PHRASING_ENABLED");
}

/**
 * METRIC_GUARD_ENABLED (QA's LIVE=1 on main f99ee58a, 5 Nov 2026; default off). With the smaller set
 * (CA_SALES + REPLY_MATCHES_CARD + TITLE, FORM_NAME off), a metrics CA for a person typed short was asked
 * "Which of them is this Corrective Action Form for — **Club Close**, **<first name>** or **Under**?": the
 * metric guards are all behind FORM_NAME_FROM_ROSTER_ENABLED. On: the final reply never offers a metric or
 * offense word as a choice (`forms/roster-only-names.ts` withoutMetricChoices). Off, as before.
 */
export function metricGuardEnabled(): boolean {
  return envFlag("METRIC_GUARD_ENABLED");
}

/**
 * SAME_FORM_COPY_NEW_PERSON_ENABLED (coding3, 5 Nov 2026; same flag in both
 * apps; default off). "can you create the same draft that we did with <C> by
 * changing the name and position?" with <C>'s own form open (or no form open
 * and <C>'s own form on file), the new person not named yet: asks who the new
 * form is for, leaves <C>'s form alone and makes no card for <C>. The reply
 * carries the form to copy from (`pendingCopy`); the next turn naming one
 * roster person starts that person's card with `copyFromInstanceId`, and
 * Create copies that form's content onto the new draft (creator and visibility
 * re-checked) — never re-read from the wording. Any other turn drops it. See
 * `forms/same-form-copy.ts`. Off, as before.
 */
export function sameFormCopyNewPersonEnabled(): boolean {
  return envFlag("SAME_FORM_COPY_NEW_PERSON_ENABLED");
}

/**
 * PAYROLL_AMOUNT_SAME_MESSAGE_ENABLED (live chat, 5 Nov 2026; default off). "…the register was off $20. which will
 * be payroll deducted from <name>'s check. … payroll deduct applies" still asked "**Payroll deduction amount?**":
 * "which" between the amount and "will be payroll deducted" hid the $20 from the amount reader. On: an amount
 * followed by "which / that / this / it … (payroll) deducted" is the stated amount
 * (`forms/payroll-amount-referent.ts`). Off, as before.
 */
export function payrollAmountSameMessageEnabled(): boolean {
  return envFlag("PAYROLL_AMOUNT_SAME_MESSAGE_ENABLED");
}

/**
 * PRIOR_ACTIONS_NO_SIGNED_ENABLED (QA, a location manager's chat, 5 Nov 2026; default off). "this is a verbal
 * warning. previous coaching policy manual 10-15-26" drafted Prior actions that said the earlier steps were
 * SIGNED; nothing was ever signed or given. Rule (Pau / QA): list only finalized forms, and never say "signed"
 * unless the record or the manager says so. On: the drafting prompt no longer asks for "— signed <date>",
 * `groundPriorActions` drops a "signed" the manager did not write for that date, and the code's own lines read
 * "<step> — finalized MM/DD/YYYY" for a form on file and "<step> — MM/DD/YYYY" for a step the manager told
 * ("signed" only when they said so). The list parsers read every format. Off, as before.
 */
export function priorActionsNoSignedEnabled(): boolean {
  return envFlag("PRIOR_ACTIONS_NO_SIGNED_ENABLED");
}

/**
 * WOVEN_TRAINING_CONDUCT_ENABLED (Pau's ruling, 6 Nov 2026; default off). Three managers asking for a Corrective
 * Action for assigned Woven policy acknowledgements or training not completed by a deadline got three answers: a
 * tentative Standards of Conduct, "Woven does not see a section … for \"not signing the woven\" … so I won't cite
 * one", and no policy line at all, with "the applicable company policy" in the Action Plan. On: such an account is
 * the Standards of Conduct, said on the card with the manual's section and page, ticked and quoted on the draft
 * (`forms/ca-policy.ts` wovenWork, `forms/named-policy-section.ts`), and a section the manual lacks is said in
 * the app's own voice ("I don't see a section …"), not with the product as its subject. Off, as before.
 */
export function wovenTrainingConductEnabled(): boolean {
  return envFlag("WOVEN_TRAINING_CONDUCT_ENABLED");
}

/**
 * Cleaning left undone cites the manual's Care and Cleaning of Equipment and
 * Facilities section, chosen by the code (Code 3, policy reading; QA T5,
 * 25 Oct 2026): "cleaning duties not being completed", "weren't done",
 * "didn't get done", "left dirty". Other duties left undone in those words are
 * the Standards of Conduct. Off, the policy is read exactly as before.
 */
export function policyCleaningIncidentEnabled(): boolean {
  return envFlag("POLICY_CLEANING_INCIDENT_ENABLED");
}

/**
 * CLEANING_OTHER_EVERY_WORDING_ENABLED (ported from the sibling app: QA's live eval and replay, 6 Nov 2026; same
 * flag in both apps; default off; Pau's ruling: cleaning left undone is Other, never the Standards of Conduct).
 * With CA_SALES_POLICY_ENABLED on, "for not completing his daily cleaning duties" and "for not completing closing
 * cleaning tasks" got no Policy line and a draft ticked Standards of Conduct (the cleaning reader missed
 * "completing"), and the live model's own reply named the Standards of Conduct for "he did not complete daily
 * cleaning duties". On: the cleaning reader also reads "not completing / finishing / doing … cleaning", an account
 * that reads only as cleaning is Other (`forms/ca-policy.ts` withCleaningOther), and the final reply's **Policy:**
 * line is the Other line whenever the account reads so (`ai/reply-matches-card.ts`). Off, as before.
 */
export function cleaningOtherEveryWordingEnabled(): boolean {
  return envFlag("CLEANING_OTHER_EVERY_WORDING_ENABLED");
}

/**
 * AS_YOU_SAID_MANAGER_WORDS_ENABLED (the sibling app's live chats, 4 Nov 2026; same flag in both apps; default off).
 * "**Policy:** Late Opening, as you said" for leaving early, and "Standards of Conduct, as you said" for "it should be
 * must see behaviors": the manager never named either. The intent reader's heading is written back onto the turn as
 * the app's own line ("Policy reference: <heading>, JBA Policy Manual p.N.", `ai/form-state.ts`), and the policy
 * reader took it as the manager naming that policy. On: `forms/ca-policy.ts` readCaPolicy reads without the app's
 * lines (`ai/app-sentences.ts` withoutAppLines). Off, as before.
 */
export function asYouSaidManagerWordsEnabled(): boolean {
  return envFlag("AS_YOU_SAID_MANAGER_WORDS_ENABLED");
}

/**
 * UNDER_PERFORMANCE_EXPLAINED_ENABLED (port of the sibling app's, Pau, 6 Nov
 * 2026; default off). When the manager's message names Under Performance and
 * the card cites the Standards of Conduct, the reply says why, once: "Under
 * Performance isn't on the CA form. Sales performance CAs use the Standards
 * of Conduct." (`ai/under-performance-explained.ts`). Off, as before.
 */
export function underPerformanceExplainedEnabled(): boolean {
  return envFlag("UNDER_PERFORMANCE_EXPLAINED_ENABLED");
}

// coding 2: POLICY_CORRECTION_NOT_ACCOUNT
/**
 * POLICY_CORRECTION_NOT_ACCOUNT_ENABLED (QA, 8 Nov 2026, ported from the sibling app's round-5 live tester, item 3;
 * default off; same flag in both apps). "it should be under performance not standard of conduct", turn 4 of a sales
 * Corrective Action, became the card's Issue. With this flag on, a short sentence that only says which policy or
 * category applies ("it should be X not Y", "it's X not Y", "wrong policy") is no account (`ai/policy-correction-turn.ts`,
 * `forms/incident-issue.ts`); the turn stays in the request for the policy readers. Off, as before.
 */
export function policyCorrectionNotAccountEnabled(): boolean {
  return envFlag("POLICY_CORRECTION_NOT_ACCOUNT_ENABLED");
}

/**
 * SALES_SHORTFALL_OBJECT_ENABLED (port of the sibling app's finding, 6 Nov
 * 2026, tester batch 1 after its flip; default off). "Not meeting sales
 * requirements for the month of October" got a Corrective Action with no
 * policy: the stated-shortfall reader (`forms/metric-shortfall.ts`) named
 * "sales" only as "sales are / is", so the CA_SALES_POLICY_ENABLED reading
 * never fired. With this flag on, "sales" is a named metric where a shortfall
 * verb of the reader's own judged list governs it, with only determiners or
 * possessives between ("not meeting her sales goals"); "missing from the sales
 * floor" is not. Off, as before.
 */
export function salesShortfallObjectEnabled(): boolean {
  return envFlag("SALES_SHORTFALL_OBJECT_ENABLED");
}

/**
 * WRITE_ME_THE_FORM_ENABLED (QA, 4 Nov 2026: "Can you write me a performace ca for an employee who … <name> - verbal"
 * made no card; default off). "write me a …" and one or two plain words before the form ("a performance CA", "a quick
 * CA") still ask to write the form; the object must still BE the form ("write a summary of the CA policy" does not
 * match; `forms/template-intent.ts` WRITES_THE_FORM_LOOSE). The sibling app ships it under CA_SALES_POLICY_ENABLED
 * (0d16be2a); here it has its own flag, because CA_SALES_POLICY is already live and nothing new may act under a live
 * flag (QA, 7 Nov 2026). Off, as before.
 */
export function writeMeTheFormEnabled(): boolean {
  return envFlag("WRITE_ME_THE_FORM_ENABLED");
}

/**
 * PLACE_FROM_CUE_ENABLED (port of the sibling app's gate finding, 6 Nov 2026,
 * sf-s28; default off). "create a corrective action for <name> from bellevue",
 * from a manager not assigned to Bellevue: "from" was no place cue, so the
 * store was not read and the card silently took the employee's own store with
 * no word about Bellevue (CA_SALES_POLICY_ENABLED on or off). With this flag
 * on, "for <name> from <store>" names the store (`forms/place-from-cue.ts`), so
 * a store outside the assignment gets the "isn't a store on your assignment"
 * question. Other "from"s ("transferred from", "a call from the store", "from
 * 10/5") are left alone. Off, as before.
 */
export function placeFromCueEnabled(): boolean {
  return envFlag("PLACE_FROM_CUE_ENABLED");
}

/**
 * TITLE_ENDS_AT_LINE_ENABLED (port from the sibling app's gate, 6 Nov 2026,
 * s16; default off). With TITLE_OF_THE_EMPLOYEE_ENABLED on, an exit form
 * typed as lines ("<name>\nTeam Member Part Time \nNE Omaha Dodge\n…") lost
 * the employee's own Position: the capitalised words on the NEXT line (the
 * store) were read as another person beside the title. With this flag on, the
 * name after a title must be on the title's own line
 * (`forms/title-of-another-person.ts`); a typed list's name on the line before
 * still owns the title below it, and "District manager <name>" on one line is
 * still that person's. Off, as before.
 */
export function titleEndsAtLineEnabled(): boolean {
  return envFlag("TITLE_ENDS_AT_LINE_ENABLED");
}

/**
 * POLICY_CHANGE_RELEVANT_ENABLED (QA, 5 Nov 2026, severe; default off). A location manager's revision of a
 * Corrective Action ("in the previously recieved coaching include that <name> signed the jba policy manual on
 * 10-15-26") cited the manual's 401k sheet headed "Warning": the bare "that" read as a reference back, and the
 * app's own "**Verbal Warning** or **Written Warning**?" named the heading. On: a message whose only "policy" is
 * the manual's own name changes no policy; a reference back must refer to a policy; an earlier turn names a
 * section only as one (`forms/chat-policy-change.ts`). Off, as before.
 */
export function policyChangeRelevantEnabled(): boolean {
  return envFlag("POLICY_CHANGE_RELEVANT_ENABLED");
}

/**
 * EXIT_STATED_ONLY_ENABLED (ported from the sibling app: QA, 5 Nov 2026, severe; default off). There a manager pasted a termination letter and
 * asked for an exit form: How Employee Resigned became "Text message" (the text that caused the termination), Key
 * Returned "returned" (the letter told the employee to return them), and Last Day Worked the final paycheck's
 * "hours worked through" date. On: an Exit field is filled only from what the manager said happened — a termination
 * is not a resignation, an instruction or condition to return is not a return, a pay period is not a last day
 * (`forms/exit-details.ts`, `forms/exit-facts.ts`). Off, as before.
 */
export function exitStatedOnlyEnabled(): boolean {
  return envFlag("EXIT_STATED_ONLY_ENABLED");
}

// coding 2: EXIT_TERMINATION_STATED
/**
 * EXIT_TERMINATION_STATED_ENABLED (QA, 8 Nov 2026, ported from the sibling app's round-5 live tester, item 4; default
 * off; same flag in both apps). A termination letter pasted for an exit form: with EXIT_STATED_ONLY the card invented
 * nothing but also left the stated facts blank. With this flag on, "your employment … is terminated, effective
 * 11/06/2026" ticks the involuntary separation and is the Resignation Date, and the letter's stated reason ("This
 * decision follows …") is the Reason (`forms/exit-facts.ts`, `forms/exit-details.ts`). Keys or property "to return"
 * are still not returned, and "hours worked through" is still no last day. Off, as before.
 */
export function exitTerminationStatedEnabled(): boolean {
  return envFlag("EXIT_TERMINATION_STATED_ENABLED");
}

// coding 2: EXIT_OTHER_PERSON_NOT_SUBJECT
/**
 * EXIT_OTHER_PERSON_NOT_SUBJECT_ENABLED (QA, 8 Nov 2026, ported from the sibling app's round-5 live tester, item 4b;
 * default off; same flag in both apps). A termination letter naming "your General Manager, <B>" was answered "Which of
 * them is this **Resignation/Exit Form** for — **<B>** or **<A>**?". With this flag on, a candidate named only right
 * after a title is not offered as the subject, and a title line echoing that title goes too (`ai/exit-other-person.ts`,
 * one server-ask.ts step). Off, as before.
 */
export function exitOtherPersonNotSubjectEnabled(): boolean {
  return envFlag("EXIT_OTHER_PERSON_NOT_SUBJECT_ENABLED");
}

// coding 2: FIELD_LABEL_NOT_A_QUESTION
/**
 * FIELD_LABEL_NOT_A_QUESTION_ENABLED (QA, the Bubbles live tester, 8 Nov 2026; default off; same flag in both apps).
 * On an open exit card, "how employee resigned - told management" was answered as a policy question with no card:
 * "how" read as a question. With this flag on, a clause that opens with one of the exit form's field labels and gives
 * its value is no question (`ai/question-not-form.ts`); with "?" it still is. Off, as before.
 */
export function fieldLabelNotAQuestionEnabled(): boolean {
  return envFlag("FIELD_LABEL_NOT_A_QUESTION_ENABLED");
}

// coding 2: EXIT_ANSWER_NOT_A_CORRECTION
/**
 * EXIT_ANSWER_NOT_A_CORRECTION_ENABLED (QA, the Bubbles live tester, 8 Nov 2026; pre-existing; default off; same flag
 * in both apps). An exit request whose turn 1 says "store items not returned … not eligible for rehire" lost its
 * address, last day worked, items, key, wage/bonus and rehire from turn 2 on: "not returned" and "not eligible" were
 * read as names negated, so the turn counted as a name correction, its other words ("mo", "drop wage", the street)
 * as people, and the turns about this form started after it. With this flag on, a negated word that is one of the
 * exit form's own terms is no person corrected (`forms/proposal.ts`, `settle`). Off, as before.
 */
export function exitAnswerNotACorrectionEnabled(): boolean {
  return envFlag("EXIT_ANSWER_NOT_A_CORRECTION_ENABLED");
}

/**
 * CA_OFFER_KEEPS_ACCOUNT_ENABLED (QA's MSB case M5, 5 Nov 2026; same flag in
 * the sibling app; default off). "<name> did not follow must see behaviors
 * which violates standards of conduct policy" → the one Corrective Action
 * offer (CA_SALES_POLICY_ENABLED) → "yes": the card read "What happened: The
 * policy is Standards of Conduct", because "yes" was rewritten into the
 * request the offer accepts and the card read that sentence as her account.
 * With the flag on, the accepted yes is the turn the offer answered — her own
 * words — asked for as a Corrective Action Form, so the card's account is read
 * from what she said and never from the rewritten request (`ai/ca-offer.ts`
 * `acceptedCaOfferTurn`). Off, as before.
 */
export function caOfferKeepsAccountEnabled(): boolean {
  return envFlag("CA_OFFER_KEEPS_ACCOUNT_ENABLED");
}

/**
 * REPLY_MATCHES_CARD_EACH_CARD_ENABLED (QA's tester, 5 Nov 2026, item 6 "two forms"; default off). REPLY_MATCHES_CARD
 * read only the first card, so a two-form reply's second section ("I can create a **Corrective Action Form** for
 * **<its person>**") was rewritten to the first card's person. On: with two or more cards each such line gets the
 * person of its own form's card, and the single-card rules do not run (`ai/reply-matches-card.ts`). REPLY_MATCHES_CARD
 * is live in this app, so this has its own flag: off, the step is byte-identical to main.
 */
export function replyMatchesCardEachCardEnabled(): boolean {
  return envFlag("REPLY_MATCHES_CARD_EACH_CARD_ENABLED");
}

/**
 * OFF_ROSTER_CONFIRM_ENABLED (QA, the flip-3 gate, 6 Nov 2026; default off; ships with FORM_NAME_FROM_ROSTER). With
 * the name flags a card's employee comes from the roster only, so a form for somebody not in Woven (an exit form for
 * someone just removed) asked "Who is this form for?" on every answer and never made a card. On: the not-found note
 * offers "reply **use <name>**"; that, "yes", or the same name again puts the typed name on the card, which says it is
 * not from Woven. Another name is looked up as any name is (`forms/off-roster-confirm.ts`). Off, as before.
 */
export function offRosterConfirmEnabled(): boolean {
  return envFlag("OFF_ROSTER_CONFIRM_ENABLED");
}

/**
 * OWN_BRAND_ONLY_ENABLED (Pau, 6 Nov 2026; same flag in both apps; default off). A reply quoting the manual said
 * "This applies company-wide across all brands — <this brand>, <two other brands> — …". Pau: only this company's
 * brand. On: the finished reply names only this company's brand — a list of brands holding it becomes it, a line
 * headed by another brand goes, any other sentence naming one goes; a quotation is kept or dropped whole, never
 * reworded (`ai/own-brand-only.ts`). The brands are config data, not code. Off, as before.
 */
export function ownBrandOnlyEnabled(): boolean {
  return envFlag("OWN_BRAND_ONLY_ENABLED");
}

/**
 * OWN_BRAND_PARENT_ENABLED (QA's live tester, 7 Nov 2026; this app only — the sibling app's parent company is its
 * own; default off). With OWN_BRAND_ONLY on, "cite animals in the workplace policy" still answered "… across all
 * brands (Buff City Soap, and JB & Associates) …". On: the operating company's name (`PARENT_COMPANY_NAMES`) is not
 * shown either, and "across all brands (A, B)" reads "at Buff City Soap" (`ai/own-brand-only.ts`). The manual's
 * title is never touched. Off, as before.
 */
export function ownBrandParentEnabled(): boolean {
  return envFlag("OWN_BRAND_PARENT_ENABLED");
}

// --- coding 4 flags ---

/**
 * COACHING_OBSERVED_KEPT_ENABLED (ported from the sibling app; Pau's scan, sf-s37, 7 Nov 2026; same flag in both apps; default off). Three Coaching
 * Forms for "not hitting her numbers for the month of October" were saved with no "Observed:" section and with
 * Underperformance unticked: the framing guard (`forms/coaching-framing.ts`) did not read the account as a shortfall,
 * so it struck every "did not meet …" sentence and the label left empty. On: a metric named and judged — the reader
 * the progression already uses (`forms/metric-shortfall.ts` statesMetricShortfall) — is a shortfall too, and the
 * guard leaves the draft alone. Off, as before.
 */
export function coachingObservedKeptEnabled(): boolean {
  return envFlag("COACHING_OBSERVED_KEPT_ENABLED");
}

/**
 * EDIT_MAKE_IT_ABOUT_ENABLED (ported from the sibling app; Pau's scan, sf-s34, 7 Nov 2026; Pau-approved 7 Nov; same flag in both apps; default
 * off). On an open Coaching draft, "I need you to make it about showing up late and please list the policy make the
 * date for 10/14/26." was scoped to the date alone, so the Details rewrite was refused and the reply said nothing
 * changed. On: "make it / this / the form … about …" also allows the form's account (Coaching Details, or a CA's
 * Observation) in `forms/revision.ts` scopeRevision. Off, as before.
 */
export function editMakeItAboutEnabled(): boolean {
  return envFlag("EDIT_MAKE_IT_ABOUT_ENABLED");
}

/**
 * POLITE_REQUEST_OWN_TURNS_ENABLED (ported from the sibling app; Pau's scan, sf-s37, 7 Nov 2026; same flag in both apps; default off). Three
 * requests in one chat, each "Can you create me a coaching document for <name> for …": the second card's Observation
 * of Offense read back the first employee's request. A request opened with "can / could / would / will you" was not
 * read as a request, so a card read every earlier turn as its account. On: that lead is set aside before the request
 * is read (`ai/remap-incident.ts` currentRequestStart). Off, as before.
 */
export function politeRequestOwnTurnsEnabled(): boolean {
  return envFlag("POLITE_REQUEST_OWN_TURNS_ENABLED");
}

/**
 * MSB_PHRASE_SOC_ENABLED (ported from the sibling app; Pau via QA, 7 Nov 2026; same flag in both apps; default off). With CA_SALES_POLICY_ENABLED
 * on, "create a ca for MSB for <name>" cites the Standards of Conduct, and "create a ca for must see behaviors for
 * <name>" cited no policy: the glossary term was matched word by word. On: the phrase the approved glossary spells
 * the term out as counts as the term (`forms/ca-policy.ts` withSalesPolicy). Off, as before.
 */
export function msbPhraseSocEnabled(): boolean {
  return envFlag("MSB_PHRASE_SOC_ENABLED");
}

/**
 * CA_REQUEST_NOT_PRIOR_COACHING_ENABLED (ported from the sibling app; Pau's scan, sf-s35, 7 Nov 2026; same flag in both apps; default off). "Can you
 * draw me up a CA for <name> for being late on 10/23/26. <first> has signed a coaching document for being late on
 * 10/14/26. …" opened a Coaching Form: the coaching named as history was read as the form asked for. On: a form named
 * after a Corrective Action request in the same message is a detail of that request, unless the manager switches to
 * it (`forms/template-intent.ts` requestedNaming). Off, as before.
 */
export function caRequestNotPriorCoachingEnabled(): boolean {
  return envFlag("CA_REQUEST_NOT_PRIOR_COACHING_ENABLED");
}

/**
 * LEVEL_ENDS_REQUEST_ENABLED (QA, live tester, 7 Nov 2026; same flag in both apps; default off). "my team member
 * <name> was late on 10-20-26, verbal ca" got no card: the closing "verbal ca" had no request words before it, so the
 * level read as history and the turn as a question. On: a level clause naming the document (ca, corrective action,
 * write-up) as the turn's last clause is the form asked for (`forms/warning-level.ts`). Off, as before.
 */
export function levelEndsRequestEnabled(): boolean {
  return envFlag("LEVEL_ENDS_REQUEST_ENABLED");
}

/**
 * DESCRIBED_ATTENDANCE_CARD_ENABLED (Pau-approved 7 Nov 2026, option A; same flag name in both apps; default off). With
 * no policy named, an attendance account — "for opening store late", "was late on 10-20-26", absent — gave a CA card
 * with no Policy line, though the app reads it as attendance (`describedAttendanceKeys`). On: the card cites the
 * manual's Attendance section for it, as a reading ("from what you described"), never "as you said"
 * (`ai/form-proposal.ts` namedPolicyFor). Off, as before.
 */
export function describedAttendanceCardEnabled(): boolean {
  return envFlag("DESCRIBED_ATTENDANCE_CARD_ENABLED");
}

/**
 * AS_YOU_SAID_APP_READ_ENABLED (ported from the sibling app; QA's gate there, 7 Nov 2026: regressions from
 * AS_YOU_SAID_MANAGER_WORDS; ships with it; same flag in both apps; default off). With AS_YOU_SAID on, a CA whose
 * only Policy line was "<policy>, as you said" (read from the app's own line) lost the line. On: the policy the app's
 * own lines named is kept as its reading and said as one ("**Policy:** Attendance — read from this request …"),
 * never "as you said" and never nothing (`forms/ca-policy.ts` readCaPolicy, caPolicyProposalLine). Off, as before.
 */
export function asYouSaidAppReadEnabled(): boolean {
  return envFlag("AS_YOU_SAID_APP_READ_ENABLED");
}

// --- coding 2 flags ---

// coding 2: SALES_OBSERVATION_ACCOUNT
/**
 * SALES_OBSERVATION_ACCOUNT_ENABLED (port of the sibling app's flip-4 gate finding, QA 7 Nov 2026; default off;
 * acts only with SALES_SHORTFALL_OBJECT_ENABLED). Once "on performance" counts as the account, the request's own
 * words ("written CA for <name> on performance") became the card's Issue. With this flag on, the Issue and the
 * draft's account clause lose the request's head, the employee's name where it leads, the request's reason and a
 * payroll answer (`observationAccount` in `forms/ca-policy.ts`); nothing left, no Issue. Off, as before.
 */
export function salesObservationAccountEnabled(): boolean {
  return envFlag("SALES_OBSERVATION_ACCOUNT_ENABLED");
}

// coding 2: SOURCE_NOTE_GUARD
/**
 * SOURCE_NOTE_GUARD_ENABLED (QA, 5 Nov 2026, item 9; port back from the sibling app's #571, which extends this
 * app's d4ee64d2; default off). A reply reached a manager with the model's own note about a source in it: "[S1
 * doesn't actually cover general tardiness — it only covers failing to open the store…]". The marker stripping
 * removes only a bare marker ("[S1]") or a group of them. With the flag on, every reply's last step removes such a
 * note and any bare marker group left ("[S12, S14]"); a citation with only a page or section after its tag is kept
 * (`ai/source-note.ts`). Off, as before.
 */
export function sourceNoteGuardEnabled(): boolean {
  return envFlag("SOURCE_NOTE_GUARD_ENABLED");
}

/**
 * NO_NOTICE_NO_DATE_ENABLED (QA, flip-3 tester, 6 Nov 2026; default off).
 * "exit form for <X>, resigned 11-3-26 with no notice" printed "Date that
 * notice was given: November 3, 2026": "resigned" is a notice-given cue. With
 * this flag on, a stated "no notice" leaves the notice date empty, and the
 * date stays the resignation's (`forms/exit-facts.ts`). Off, as before.
 */
export function noNoticeNoDateEnabled(): boolean {
  return envFlag("NO_NOTICE_NO_DATE_ENABLED");
}

// coding 2: DENIAL_NO_ACCOUNT
/**
 * DENIAL_NO_ACCOUNT_ENABLED (coding 4's finding via QA, 7 Nov 2026; default off). "create a corrective action
 * for <name>, not late" made a card with "**Issue:** not late" and no "what happened" ask. With this flag on, an
 * Issue that only denies a fault is no Issue (`forms/denial-no-account.ts`, `forms/incident-issue.ts`
 * accountOnly). Off, as before.
 */
export function denialNoAccountEnabled(): boolean {
  return envFlag("DENIAL_NO_ACCOUNT_ENABLED");
}

// coding 2: ISSUE_IS_THE_ACCOUNT
/**
 * ISSUE_IS_THE_ACCOUNT_ENABLED (QA, flip-3 tester, 6 Nov 2026; default off).
 * "…<name>, verbal, she was late on 10-20-26" printed What happened =
 * "verbal", and with a nickname, the typed name: the first clause after the
 * person was taken. With this flag on, a bare level clause or a short clause
 * naming the person is passed over (`forms/incident-issue.ts`). Off, as before.
 */
export function issueIsTheAccountEnabled(): boolean {
  return envFlag("ISSUE_IS_THE_ACCOUNT_ENABLED");
}

// coding 2: PRIOR_STEP_PREVIOUSLY
/**
 * PRIOR_STEP_PREVIOUSLY_ENABLED (A2, one of Pau's 7; QA 6 Nov 2026; default off). "in the previously recieved
 * coaching include that <name> signed the jba policy manual on 10-15-26" listed no Prior actions row. With this
 * flag on, a dated step that "previous(ly) / prior / earlier" leads is an earlier step (`forms/prior-actions.ts`).
 * Off, as before.
 */
export function priorStepPreviouslyEnabled(): boolean {
  return envFlag("PRIOR_STEP_PREVIOUSLY_ENABLED");
}

// coding 2: REMOVE_POLICY_NOT_NAMED
/**
 * REMOVE_POLICY_NOT_NAMED_ENABLED (A1, QA 6 Nov 2026; default off). "take the attendance policy off the form"
 * got "Policy: Attendance, as you said". With this flag on, a policy the turn takes off ("take … off", "drop …")
 * is not the one it names (`forms/ca-policy.ts` statedIn). Off, as before.
 */
export function removePolicyNotNamedEnabled(): boolean {
  return envFlag("REMOVE_POLICY_NOT_NAMED_ENABLED");
}

// --- Coding flags ---

/**
 * METRIC_CHOICE_ONE_QUESTION_ENABLED (QA, 7 Nov 2026; same flag in both apps; default off). The same doubled ask as
 * the FORM_NAME re-flip gate regression, under METRIC_GUARD_ENABLED: a choice question with its own "Tell me and I'll
 * …" after it, every choice a metric, became "Who is this form for? Tell me the employee's full name. Tell me and I'll
 * fill in …". On: the question's tail goes with a choice that is replaced, and stays with one still asked
 * (`forms/roster-only-names.ts` withoutMetricChoices). Off, as before.
 */
export function metricChoiceOneQuestionEnabled(): boolean {
  return envFlag("METRIC_CHOICE_ONE_QUESTION_ENABLED");
}

/**
 * NEAR_MISS_QUESTION_RULES_ENABLED (ported from the sibling app: QA's gate there, 8 Nov 2026; default off; ships with
 * the name set, FORM_NAME_FROM_ROSTER and ROSTER_NEAR_MISS — the latter is live here, so this flag is its own). Two
 * rules for "Is this for **<roster name>**? Tell me if that should change.": (a) a reply that turns it down ("no,
 * verbal warning, …") never gets a card for that name, nor the same question again (`forms/near-miss-question-rules.ts`);
 * (b) a card already on screen is never replaced by the bare question: a near-miss of the card's own employee keeps
 * the card in the roster's spelling, another name keeps the card's details with the question under it
 * (`forms/roster-only-names.ts`). Off, as before.
 */
export function nearMissQuestionRulesEnabled(): boolean {
  return envFlag("NEAR_MISS_QUESTION_RULES_ENABLED");
}

/**
 * STALE_PROMPT_LINES_OFF_ENABLED (QA, 5 Nov 2026; default off). Two lines of
 * the Corrective Action draft's prompt describe boxes the current template no
 * longer has: "name the topic in the matching write-in field" (revision 7 has
 * no write-in beside Other) and "under_performance is for results against a
 * sales or performance target" (revision 7 has no Under Performance box). With
 * the flag on, each line is left out when the version being drafted lacks what
 * it describes, read from the version's own fields and options
 * (`ai/stale-prompt-lines.ts`). A version that still has them keeps the line.
 * Off, the prompt is byte for byte as before.
 */
export function stalePromptLinesOffEnabled(): boolean {
  return envFlag("STALE_PROMPT_LINES_OFF_ENABLED");
}

/**
 * PROPOSAL_MAKE_IT_ABOUT_ENABLED (coding 5, port from the sibling app: QA's flip-9 tester item 9, 8 Nov 2026; same
 * flag in both apps; default off). On a proposal card (no draft yet), "I need you to make it about showing up late
 * and please list the policy make the date for 10/14/26." was read as more account: the drafting model's notes at
 * Create held the instruction word for word. On: a "make it / this / the form … about <X>" sentence makes <X> the
 * account from that turn on in the draft's notes (`forms/instances/[id]/draft/route.ts`), never the instruction,
 * and the account said before it is set aside (`ai/make-it-about.ts`). Off, as before.
 */
export function proposalMakeItAboutEnabled(): boolean {
  return envFlag("PROPOSAL_MAKE_IT_ABOUT_ENABLED");
}

/**
 * PROPOSAL_POLICY_SET_ASIDE_ENABLED (coding 5, port from the sibling app; QA, 8 Nov 2026: live here at 00:20; same
 * flag in both apps; default off). On a proposal card, "take the attendance policy off the form", sent after the
 * manager had named that policy, left "Policy: Attendance, as you said" on the card. REMOVE_POLICY_NOT_NAMED covers
 * only the take-off sentence naming the policy. On: a policy the manager took off (named, or "the policy" for
 * whatever the card cites) is set aside until named again: the card drops its policy row and manual citations and
 * says so (`ai/proposal-edit-rules.ts`), and at Create the take-off sentence is no account and the draft leaves the
 * policy off its policy fields and "Policy reference" lines (`forms/instances/[id]/draft/route.ts`). See
 * `forms/policy-set-aside.ts`. Off, as before.
 */
export function proposalPolicySetAsideEnabled(): boolean {
  return envFlag("PROPOSAL_POLICY_SET_ASIDE_ENABLED");
}

/**
 * STEP_DATES_NOT_FORM_DATE_ENABLED (QA round 5, 8 Nov 2026; default off; this app only). "i need a performance
 * corrective action for <name>, a team member. she is under performance for september. she already received a verbal
 * warning and coaching on 9/8/2026, 9/15/2026 and 9/25/2026. no payroll deduction applies. today's date is fine."
 * With STEP_DATE_NOT_INCIDENT on, every date was a step's, so no incident date was left and the card kept the first
 * date `extractFormDate` read (9/15, a coaching). On: when step dates are all the dates there are, the form is dated
 * today (`forms/incident-dates.ts` decideFormDate). Off, as before.
 */
export function stepDatesNotFormDateEnabled(): boolean {
  return envFlag("STEP_DATES_NOT_FORM_DATE_ENABLED");
}

/**
 * ISSUE_AFTER_REQUEST_REASON_ENABLED (QA's round-5 Bubbles check, 8 Nov 2026; default off). "I need a corrective
 * action for under performance. <A> was below on …" printed "Issue: under performance" — the request's reason, and
 * the account was lost; "… made for under performance. <A> was below on …" printed the whole message. With this flag
 * on, a request whose for-clause (after "made / done / written up …" too) is only a sales reason gives no Issue of
 * its own, and that request sentence is no account: the account sentence after it is the Issue. Alone, the reason
 * stays the Issue (`forms/incident-issue.ts`). Ships only with CA_SALES_POLICY_ENABLED (live in both apps): without
 * it no reason reads as a sales one, and this flag changes nothing. Off, as before.
 */
export function issueAfterRequestReasonEnabled(): boolean {
  return envFlag("ISSUE_AFTER_REQUEST_REASON_ENABLED");
}

/**
 * PRIOR_STEP_DATE_LIST_ENABLED (QA round 5, 8 Nov 2026; same flag in both apps; default off). "she already received a
 * verbal warning and coaching on 9/8/2026, 9/15/2026 and 9/25/2026" listed only "Coaching — 09/08/2026". On: a step
 * told with a list of dates is one row per date, and a step named just before it with "and" is listed with no date,
 * since the manager tied no date to it (`forms/prior-actions.ts`). Off, as before.
 */
export function priorStepDateListEnabled(): boolean {
  return envFlag("PRIOR_STEP_DATE_LIST_ENABLED");
}

/**
 * The turn that asked for the form stays in the bounded manager window when
 * later turns push it out (the coordinator's replays R6/R7, 5 Nov 2026; see
 * `forms/bounded-context.ts`). The window is computed on the server (the
 * card) and in the browser (the draft), so there are two variables:
 * REQUEST_KEPT_IN_WINDOW_ENABLED for the server and
 * NEXT_PUBLIC_REQUEST_KEPT_IN_WINDOW_ENABLED for the browser. FLIP BOTH
 * TOGETHER: with one on and the other off the card and the draft read
 * different turns. NEXT_PUBLIC_ is inlined at build time, so a flip needs a
 * redeploy. Off, the window is exactly as before.
 */
export function requestKeptInWindowEnabled(): boolean {
  if (typeof window === "undefined") return envFlag("REQUEST_KEPT_IN_WINDOW_ENABLED");
  const inlined = process.env.NEXT_PUBLIC_REQUEST_KEPT_IN_WINDOW_ENABLED;
  return typeof inlined === "string" && ON.has(inlined.trim().toLowerCase());
}

/**
 * TAKE_OFF_STAYS_CARD_ENABLED (QA, 8 Nov 2026, relayed by coding 5; default off). With a card open, "take the
 * attendance policy off the form" (a Coaching card) and "take the policy off" (any card) were answered as policy
 * questions with no card, so PROPOSAL_POLICY_SET_ASIDE could not take the policy off. With this flag on, a turn on an
 * open card that only takes a policy off is a card turn: never a question, and the card is proposed again from the
 * manager's last turn (`ai/take-off-stays-card.ts`). Off, as before.
 */
export function takeOffStaysCardEnabled(): boolean {
  return envFlag("TAKE_OFF_STAYS_CARD_ENABLED");
}

/**
 * FORM_DATE_SAID_SETTLES_ENABLED (coding 5, port from the sibling app; QA, 8 Nov 2026; same flag in both apps; default
 * off). "… make the date for 10/14/26." on a card about a meeting missed on 10/10/26 left the card's Date unset and
 * asked "You mentioned more than one date (10/10, 10/14)". On: a date the manager says the form takes ("make / set /
 * change the date to …", "date it …", "the date should be …") is the form's Date, and the question is not asked
 * (`forms/form-date-said.ts`, `forms/incident-dates.ts` decideFormDate). Off, as before.
 */
export function formDateSaidSettlesEnabled(): boolean {
  return envFlag("FORM_DATE_SAID_SETTLES_ENABLED");
}

/**
 * STEP_B_ADD_UNDER_OBSERVED_ENABLED (coding 5; QA's live draft test, Ask Bubbles production, 8 Nov 2026; same flag in
 * both apps; default off). "add to the details that she was reminded about the meeting twice" was appended after
 * "Going Forward" on a Details of Coaching written in sections. On: the one writer puts added text at the end of the
 * Observed section, for an "add" and for a whole-text write that is the old text with new lines after its last
 * section (`forms/outline-sections.ts`, `forms/form-write.ts`). Off, as before.
 */
export function stepBAddUnderObservedEnabled(): boolean {
  return envFlag("STEP_B_ADD_UNDER_OBSERVED_ENABLED");
}

/**
 * STEP_B_SECTION_SPACING_ENABLED (coding 5; QA's live draft test, 8 Nov 2026; same flag in both apps; default off).
 * After an edit, the blank lines between Observed / Expectation / Going Forward became single newlines. On: a write
 * of a field that had them keeps one blank line before each section heading (`forms/outline-sections.ts`). Off, as
 * before.
 */
export function stepBSectionSpacingEnabled(): boolean {
  return envFlag("STEP_B_SECTION_SPACING_ENABLED");
}

/**
 * STEP_B_REPLY_KEEPS_LINES_ENABLED (coding 5; QA's live draft test, 8 Nov 2026; same flag in both apps; default off).
 * Step B's reply quoted a multi-line field on one line joined with "; " ("Observed:; … ; Expectation:; …"). On: it
 * is quoted line by line, as the form shows it (`forms/form-diff-reply.ts` replyFromDiff). Off, as before.
 */
export function stepBReplyKeepsLinesEnabled(): boolean {
  return envFlag("STEP_B_REPLY_KEEPS_LINES_ENABLED");
}

/**
 * CONDUCT_INCIDENT_CITES_PAGE_ENABLED (coding 5, port from the sibling app; QA's live tester there, 8 Nov 2026, the
 * managers' Woven wordings; here too; same flag in both apps; default off). "create a verbal corrective action for <A>
 * for missing the 10-15-26 woven deadline" got "Policy: this reads as Standards of Conduct …" with no section or page;
 * "… a verbal due to not completing her woven courses by the deadline" got no Policy line at all. On: "not completing
 * / not finishing <task>" is unfinished assigned work (`forms/ca-policy.ts`), and the card keeps its "Standards of
 * Conduct Policy, JBA Policy Manual p.N" line: REPLY_MATCHES_CARD's one-policy rule read "this reads as **Standards of
 * Conduct**" as another heading and dropped it (`ai/reply-matches-card.ts`). Off, as before.
 */
export function conductIncidentCitesPageEnabled(): boolean {
  return envFlag("CONDUCT_INCIDENT_CITES_PAGE_ENABLED");
}

/**
 * REOPEN_NOT_OPEN_FORM_ENABLED (QA's round-4 gate in the sibling app, 8 Nov 2026; default off; same flag in both apps).
 * With REOPEN_BY_ANY_OPEN_VERB on, "I need the CA for the Must see behaviors … Make it in the format that I explained
 * above" with that CA open was answered "… is still a draft, so it's open to edit." with no edit ("see" read as a show
 * verb). With this flag on, a reopen of the form already open whose verb is not the request at the start of the turn
 * steps aside (`forms/chat-reopen.ts`); "show me the draft" still shows it. Off, as before.
 */
export function reopenNotOpenFormEnabled(): boolean {
  return envFlag("REOPEN_NOT_OPEN_FORM_ENABLED");
}

/**
 * REQUEST_FROM_NAMES_EMPLOYEE_ENABLED (coding 5; QA, 8 Nov 2026; this app only, see docs/parity-log; default off).
 * "Please create another corrective action from <A>. This would be a verbal …" ("from" typed for "for") named nobody,
 * and the card asked who. On: "<form> from <name>" reads as "<form> for <name>" (`forms/template-intent.ts`
 * canonicalShorthand), never before a word that cannot start a name. Off, as before.
 */
export function requestFromNamesEmployeeEnabled(): boolean {
  return envFlag("REQUEST_FROM_NAMES_EMPLOYEE_ENABLED");
}

/**
 * STEP_B_MAKE_IT_ABOUT_ACCOUNT_ENABLED (coding 5; QA's live draft test, Ask Bubbles production, 8 Nov 2026; same flag
 * in both apps; default off). On a saved Coaching draft, "I need you to make it about showing up late" answered
 * "Changed Other to 'Showing up late'": the live reader set only the Other topic, so Details of Coaching stayed about
 * the missed meeting. Active only with FORM_PATCH_READER_FIXES_ENABLED. On: the reader is told the account is the
 * form's Details / Observation, never the topic (a line added after the approved prompt, `forms/form-patch-
 * prompt.ts`), and a "make it about <X>" turn whose patch does not set the account goes to the old path before
 * anything is written, where EDIT_MAKE_IT_ABOUT's revision rewrites it (`forms/form-patch-turn.ts`). Off, as before.
 */
export function stepBMakeItAboutAccountEnabled(): boolean {
  return envFlag("STEP_B_MAKE_IT_ABOUT_ACCOUNT_ENABLED") && formPatchReaderFixesEnabled();
}

/**
 * COPY_OPEN_FORM_FOR_PERSON_ENABLED (QA, 8 Nov 2026; default off). With <A>'s Coaching Form open, "copy this form for
 * <B>" made no card: the answering model replied and the card stayed A's. With this flag on, a same-form copy request
 * naming one roster person other than the open form's is read as that person's request for the open template, the
 * open draft set aside for the turn (`forms/copy-open-form-for.ts`); Create copies A's form as before. Off, as before.
 */
export function copyOpenFormForPersonEnabled(): boolean {
  return envFlag("COPY_OPEN_FORM_FOR_PERSON_ENABLED");
}

/**
 * LIST_POLICY_IS_EDIT_ENABLED (QA, 8 Nov 2026; default off; works with EDIT_POLICY_ASK_ENABLED; same flag in both
 * apps). With a form open, a turn that was only "please list the policy" read as a question and was answered as a
 * general policy question, so EDIT_POLICY_ASK never saw it. With this flag on, such a turn is not a question and the
 * edit path takes it (`ai/list-policy-ask.ts`); "what policy covers lateness?" is still a question. Off, as before.
 */
export function listPolicyIsEditEnabled(): boolean {
  return envFlag("LIST_POLICY_IS_EDIT_ENABLED");
}

/**
 * COACHING_CARD_POLICY_ENABLED (coding 5; QA's live test, Ask Bubbles production, 8 Nov 2026; port of the sibling app's
 * card citation; default off). "my employee <A> was late on 10-20-26, create a coaching form" gave a Coaching card with
 * no policy line; the sibling app's card cites "Attendance Policy, JBA Policy Manual p.14". On: a Coaching or Follow-Up
 * Coaching card that cites no manual line yet cites the sections its account points at, with the page the manual
 * prints (`forms/coaching-card-policy.ts`, called on the forms path's answer by `ai/coaching-card-policy-answer.ts`).
 * Off, as before.
 */
export function coachingCardPolicyEnabled(): boolean {
  return envFlag("COACHING_CARD_POLICY_ENABLED");
}

/**
 * ACCOUNT_VERB_NOT_A_NAME_ENABLED (ported from the sibling app, QA round 5, sf-s38, 8 Nov 2026; same flag in both apps;
 * default off). "make me CA for <first name> failing to complete shifts" made the card for "<First> Failing". On, with
 * NOT_A_NAME_GUARD: a verb that opens the account ("failing", "missing", "not", "being", …) is never part of a name
 * (`forms/not-a-name.ts`). Off, as before.
 */
export function accountVerbNotANameEnabled(): boolean {
  return envFlag("ACCOUNT_VERB_NOT_A_NAME_ENABLED");
}

/**
 * OUT_OF_DATE_IS_THE_PROPOSAL_ENABLED (ported from the sibling app, QA round 5, sf-s38, 8 Nov 2026; default off).
 * After Create refused a card as "This proposal is out of date: …", "what does out of date mean" was answered from the
 * knowledge base. On: a question about "out of date" in a chat with a proposal card is answered about that card, with
 * no retrieval (`ai/out-of-date-is-the-proposal.ts`). Off, as before.
 */
export function outOfDateIsTheProposalEnabled(): boolean {
  return envFlag("OUT_OF_DATE_IS_THE_PROPOSAL_ENABLED");
}

/**
 * FINAL_REPLY_MARKER_GUARD_ENABLED (ported from the sibling app: QA's live tester there after round 4, 8 Nov 2026; default off; SOURCE_NOTE_GUARD is live here too). With
 * SOURCE_NOTE_GUARD on, a Corrective Action turn answered on the form path ("I need a corrective action for under
 * performance" → "must see behaviors", intent form|no_card) still reached the manager with "…their eyewear [S4][S3]."
 * and "…not an employee name [S1][S2]." — the guard never ran on that answer — and the bare-marker step itself left the
 * first of two side-by-side tags, or a tag followed by a dash ("…context [S1]- don't cover it.", coding 4's sf-s38).
 * With this flag on: the chat route runs the bare-marker step once more on the final reply, as the very last step on
 * every exit, whatever path made it; and the step takes a run of tags side by side as one, a dash after it no bar
 * (`ai/source-note.ts`). Off, as before.
 */
export function finalReplyMarkerGuardEnabled(): boolean {
  return envFlag("FINAL_REPLY_MARKER_GUARD_ENABLED");
}

/**
 * STEP_B_DATE_SAID_ENABLED (coding 5; QA's live test, Ask Bubbles production, 8 Nov 2026; same flag in both apps;
 * default off). On a saved draft, "I need you to make it about showing up late and please list the policy make the
 * date for 10/14/26" set the topic and the policy, and the Date stayed 10/10 with nothing said: Step B's reader is
 * never offered the form's Date. On: a date the manager says the form takes (`forms/form-date-said.ts`) is written on
 * Step B's path as their own statement, after the reader's edits, and the reply says "Changed Date to …"
 * (`forms/form-patch-turn.ts`). Off, as before.
 */
export function stepBDateSaidEnabled(): boolean {
  return envFlag("STEP_B_DATE_SAID_ENABLED");
}

/**
 * FORM_RECORDS_NO_JUDGEMENT_ENABLED (coding 5; QA's live test, Ask Bubbles, 8 Nov 2026; same flag in both apps; default
 * off). Listing someone's forms added "a notable number of Corrective Actions in under two weeks for one person" and
 * "worth reviewing … before deciding what comes next". On: the Forms Register block tells the model to list each form
 * with its date and status only, and `withoutRecordJudgement` drops such sentences from a records answer
 * (`forms/chat-form-records.ts`). Off, as before.
 */
export function formRecordsNoJudgementEnabled(): boolean {
  return envFlag("FORM_RECORDS_NO_JUDGEMENT_ENABLED");
}

/**
 * SIGNED_STEP_NOT_A_REQUEST_ENABLED (QA's Bubbles live tester, round 4, 8 Nov 2026; same flag in both apps; default
 * off). "… <A> has signed a coaching document for being late on 10/14/26. …" beside a CA request made a second,
 * Coaching Form card. On: a clause that tells a step already signed, given or received, and asks for nothing, is no
 * form request (`forms/form-requests.ts`); it stays the CA's Prior actions. Off, as before.
 */
export function signedStepNotARequestEnabled(): boolean {
  return envFlag("SIGNED_STEP_NOT_A_REQUEST_ENABLED");
}

/**
 * CREATE_COMMAND_POINTS_TO_CARD_ENABLED (QA's sf-s38, 8 Nov 2026; default off; same flag in both apps). With only a card
 * open, "create it" was answered as a policy question with no card. With this flag on, the card is kept and one line
 * says to press **Create draft** on it (`ai/card-meta-turn.ts`). Off, as before.
 */
export function createCommandPointsToCardEnabled(): boolean {
  return envFlag("CREATE_COMMAND_POINTS_TO_CARD_ENABLED");
}

/**
 * CARD_COMPLAINT_NOT_ACCOUNT_ENABLED (QA's sf-s38, 8 Nov 2026; default off; same flag in both apps). "this proposal is out
 * od fate" with a card open was answered as a policy question with no card. With this flag on, the card is kept with its
 * account and the reply asks what to change (`ai/card-meta-turn.ts`). Off, as before.
 */
export function cardComplaintNotAccountEnabled(): boolean {
  return envFlag("CARD_COMPLAINT_NOT_ACCOUNT_ENABLED");
}

/**
 * PROPOSAL_NAME_CORRECTION_ENABLED (QA, round 5, 8 Nov 2026; default off; reads with NAME_CORRECTION_WORDS_ENABLED,
 * live). On a card not yet created, "fix her last name <surname>" (and "her last name is …", "it's spelled …") was
 * not applied: the card kept the old name and the reply said nothing had changed. With this flag on, the turn is
 * read as "change her name to <the name>" against the card's employee, and the roster decides as for any typed name
 * (`forms/proposal-name-correction.ts`, called from the chat route). Off, as before.
 */
export function proposalNameCorrectionEnabled(): boolean {
  return envFlag("PROPOSAL_NAME_CORRECTION_ENABLED");
}

/**
 * ACCOUNT_PLACE_LEAD_ENABLED (QA's Bubbles round-5 final gate, 8 Nov 2026; same flag in both apps; default off). With
 * SALES_OBSERVATION_ACCOUNT, "create a written CA for <name> at <store> for missing the 10-15-26 woven deadline" made
 * the Issue "at <store> for missing …". On: once the request is cut, a named place ("at <Place>") that opens what is left, and the request's
 * "for" after it, go (`forms/ca-policy.ts` observationAccount). Off, as before.
 */
export function accountPlaceLeadEnabled(): boolean {
  return envFlag("ACCOUNT_PLACE_LEAD_ENABLED");
}

// coding 2: KEPT_REQUEST_SAME_FORM
/**
 * KEPT_REQUEST_SAME_FORM_ENABLED / NEXT_PUBLIC_KEPT_REQUEST_SAME_FORM_ENABLED (QA's round-6 item, 8 Nov 2026; default
 * off; only with REQUEST_KEPT_IN_WINDOW). "Create a Coaching Form from this conversation", asked well after "create
 * corrective action for <A> for Late Opening …", kept that Corrective Action request in the window, so the Coaching
 * card read <A> from the window and no longer said "I took <A> from earlier in this conversation — if this form is for
 * somebody else, tell me who." With this flag on, an earlier request is kept only when the current turn asks for the
 * same form or for none; a turn that asks for a different form keeps the window as it was without the flag, so the
 * person is carried from earlier turns with its notice (`forms/bounded-context.ts`). Same pair as
 * REQUEST_KEPT_IN_WINDOW: the server (the card) and the browser (the draft) read the window, so FLIP BOTH TOGETHER.
 * Off, as before.
 */
export function keptRequestSameFormEnabled(): boolean {
  if (typeof window === "undefined") return envFlag("KEPT_REQUEST_SAME_FORM_ENABLED");
  const inlined = process.env.NEXT_PUBLIC_KEPT_REQUEST_SAME_FORM_ENABLED;
  return typeof inlined === "string" && ON.has(inlined.trim().toLowerCase());
}

// coding 2: CARRIED_PERSON_NOTICE
/**
 * CARRIED_PERSON_NOTICE_ENABLED (QA's round-6 item, 8 Nov 2026; default off; same flag in both apps). On the route,
 * production's INTENT_EXTRACTION, SLOT_RETENTION and REQUEST_KEPT_IN_WINDOW each made a card that carried a person from
 * earlier turns drop "I took <A> from earlier in this conversation — if this form is for somebody else, tell me who."
 * With this flag on, a performance-form card whose person is not named in the manager's own last six turns, but is
 * named before them, says so (`ai/carried-person-notice.ts`, one server-ask.ts step). Off, as before.
 */
export function carriedPersonNoticeEnabled(): boolean {
  return envFlag("CARRIED_PERSON_NOTICE_ENABLED");
}

/**
 * FIRST_NAME_ANSWER_KEEPS_ACCOUNT_ENABLED (ported from the sibling app: QA's live test there, 8 Nov 2026; default off; same flag in both apps).
 * "make me CA for <first name> failing to complete shifts" → "Is this for **<full name>**?" → "make me CA for <full
 * name> failing to complete shifts 11/7 and 11/8" (or "<full name> 11/7 and 11/8") lost the dates: an answer that
 * named the person in full was read as the name alone. With this flag on, what the answer says besides the name is
 * kept (`ai/first-name-suggest.ts`). Off, as before.
 */
export function firstNameAnswerKeepsAccountEnabled(): boolean {
  return envFlag("FIRST_NAME_ANSWER_KEEPS_ACCOUNT_ENABLED");
}

/**
 * SHIFT_ACCOUNT_IS_INCIDENT_ENABLED (ported from the sibling app: QA's live test there, 8 Nov 2026; default off; same flag in both apps). "make me CA
 * for <name> not showing up to her shifts on 11/7 and 11/8" had no Observation: a shift not shown up to, not completed
 * or missed, told with no subject and no "for", was read as the request alone. With this flag on it is an account
 * (`forms/corrective-action-intake.ts` describesIncident). Off, as before.
 */
export function shiftAccountIsIncidentEnabled(): boolean {
  return envFlag("SHIFT_ACCOUNT_IS_INCIDENT_ENABLED");
}

/**
 * WORK_AREA_ABSENCE_CITES_CONDUCT_ENABLED (Pau's decision, 9 Nov 2026, via QA; default off; same flag in both apps).
 * "leaving the front desk unattended" (the desk, register, counter, work area or floor left unattended during the shift)
 * cites the Standards of Conduct line "Unauthorized absence from the work area during the workday", never Attendance, and
 * only it, whatever else the account says (`forms/specific-policy-topics.ts`). Off, as before.
 */
export function workAreaAbsenceCitesConductEnabled(): boolean {
  return envFlag("WORK_AREA_ABSENCE_CITES_CONDUCT_ENABLED");
}

/**
 * MADE_ABOUT_ALL_OR_NOTHING_ENABLED (QA's live round-7 test, Ask Bubbles, 9 Nov 2026; default off). "make it about leaving
 * the front desk unattended on 11/6/26" on a saved Coaching draft rewrote Details and left Other and the Date: the reader
 * read no this-form edit, the turn went to the old path, and its revision was let drop the old date. With the flag on, the
 * old path may drop it only while Step B writes the Date and the topic with the account, and Step B reads the topic from
 * the manager's words when the reader read none (`forms/form-patch-turn.ts`, `forms/form-write.ts`). Off, as before.
 */
export function madeAboutAllOrNothingEnabled(): boolean {
  return envFlag("MADE_ABOUT_ALL_OR_NOTHING_ENABLED");
}

/**
 * MADE_ABOUT_READER_ACCOUNT_ENABLED (QA's live Bubbles round-9 test, 9 Nov 2026; default off; same flag in both apps).
 * "make it about leaving the front desk unattended on 11/6/26" on a saved Coaching draft changed Other and Details and
 * left the Date: the reader set Details itself (the new incident added under the old one), so the made-about path that
 * writes the Date never ran. With the flag on, a dated made-about turn's own account edit from the reader is set aside, and
 * the account is rewritten with the Date and the topic, all or nothing (`forms/form-patch-turn.ts`). Off, as before.
 */
export function madeAboutReaderAccountEnabled(): boolean {
  return envFlag("MADE_ABOUT_READER_ACCOUNT_ENABLED");
}

/**
 * MADE_ABOUT_REWRITE_FINISHES_ENABLED (ported from the sibling app: QA's live round-13 test there, 9 Nov 2026; default
 * off; same flag in both apps). On a saved Coaching draft, "make it about leaving the front desk unattended on 11/6/26"
 * ran the made-about revision (Details rewritten), then the reader's own edits were refused, the turn left the patch
 * path, and the old path's revision ran a second time: "Updated … Details of Coaching", Other and the Date stayed.
 * With the flag on, once the account is rewritten the turn always finishes there: a refused reader patch falls back to
 * the topic read from the manager's words, the Date is still written, and an error after the rewrite answers from what
 * was saved. Off, as before.
 */
export function madeAboutRewriteFinishesEnabled(): boolean {
  return envFlag("MADE_ABOUT_REWRITE_FINISHES_ENABLED");
}
