import "server-only";

import { approvedManualConfirmed, manualDisplayTitle } from "@/lib/forms/official-policy-manual";
import { describedAttendanceKeys } from "@/lib/forms/ca-policy";
import { mayDescribeSection } from "@/lib/forms/named-policy-section";

import { NAMED_HANDBOOK, PINNED_KNOWLEDGE_ROLES } from "@/config/company/knowledge";
import { COMPANY_REPORT_LOADERS } from "@/config/company/reports.server";
import { ACTIVE_BRAND } from "@/lib/brand";
import { CLAUDE_MAX_TOKENS, RETRIEVAL } from "@/lib/config/models";
import { MissingConfigurationError, liveReadiness } from "@/lib/config/server-env";
import { DEFAULT_PERMISSION_MATRIX, hasPermission } from "@/lib/permissions";
import { asksOnlyAboutFormsOnFile, isFormRecordsQuestion, loadFormRecords } from "@/lib/forms/chat-form-records";
import { priorFormsReadingForChat } from "@/lib/forms/prior-forms";
import { answersFormClarification } from "@/lib/forms/form-clarification";
import { buildFormInventory, publishedEntries } from "@/lib/forms/inventory";
import { detectInventoryQuestion, type InventoryQuestion } from "@/lib/forms/inventory-question";
import {
  isEllipticalRegisterReference,
  resolveRegisterAnchor,
} from "@/lib/forms/register-anchor";
import { listTemplateSummaries, type TemplateSummary } from "@/lib/forms/repository";
import { asksAboutForms, detectTemplateIntent } from "@/lib/forms/template-intent";
import { PERFORMANCE_MANAGEMENT_FRAMEWORK } from "@/lib/knowledge/document-roles";
import { isFrameworkAvailable } from "@/lib/knowledge/framework-availability";
import { rowToCitation, type MatchedChunkRow } from "@/lib/knowledge/mappers";
import { buildHandbookNote, namesHandbook, selectHandbookCoverage } from "@/lib/knowledge/named-handbook";
import { SupabaseKnowledgeProvider } from "@/lib/knowledge/providers/supabase";
import type { RoleGrounding } from "@/lib/knowledge/role-grounding";
import { recallPeople } from "@/lib/chat/person-memory-store";
import { reportById, routeReportQuestion } from "@/lib/reporting/registry";
import { resolveScopeFor } from "@/lib/reporting/scope/server";
import type { SourceCitation } from "@/types";

import { callClaude } from "./call-claude";
import { loadChatDataBlock } from "./chat-data-tools";
import { factsVisibleInConversation, formatRecalledMemory, memoryCue } from "./chat-memory";
import { deliverFormProposal } from "./grounded-turn";
import { loadFewShotBlock } from "./feedback-examples";
import { applySelfCheck } from "./self-check-repair";
import { applyIntentExtraction } from "./intent-extraction";
import { pinnedManualBlock, printedPageFromRetrieval } from "./policy-citation-fields";
import { recallMemory, rememberFact } from "./chat-memory-store";
import { finishChatTrace, openChatTrace, redactTraceText } from "./chat-trace";
import { updateChatTrace } from "./chat-trace-store";
import {
  chatDataToolsEnabled,
  chatMemoryEnabled,
  chatStyleRulesEnabled,
  chatTraceEnabled,
  fieldAccuracyEnabled,
  formToolsEnabled,
  hybridSearchEnabled,
  longContextEnabled,
  policyCitationEnabled,
  priorCoachingOptionalEnabled,
  queryRewriteEnabled,
  reportBreakdownEnabled,
  intentExtractionEnabled,
  retrievalRecallEnabled,
  slotRetentionEnabled,
  printedPageOnlyEnabled,
  typedNameEnabled,
} from "@/lib/config/chat-quality-flags";
import { gateTexts, searchWithPlan } from "./continuation";
import { fieldsFromManagerText, mergeConfirmed, retainFieldsInReply } from "./form-field-state";
import { loadConversationFormState, saveConversationFormState } from "./form-state-store";
import { formCommandBypassesSearch, routeUnderstoodFormTurn } from "./form-tool-route";
import { understandFormTurn } from "./form-tool-understand";
import { augmentIntakeQuestion } from "./intake-augment";
import { incidentFingerprint } from "@/lib/forms/incident-key";
import { prepareLongContext } from "./long-context-claude";
import { applyOptionalPriorCoaching } from "./prior-coaching-optional";
import { rewriteRetrievalQuery } from "./query-rewrite-claude";
import { matchHybridKnowledge } from "@/lib/knowledge/hybrid-match";
import { matchRecallKnowledge } from "@/lib/knowledge/recall-match";
import { withMappedPolicy } from "./violation-policy";
import { loadScopedRoster } from "@/lib/forms/employee-roster";
import { AiError } from "./errors";
import {
  answerInventoryQuestion,
  answerRegisterClarification,
  buildFormInventoryBlock,
} from "./form-answers";
import { resolveChatEntities } from "./entity-facts";
import { proposeFormForTurn, suggestFormsForTurn, type ChatActor } from "./form-proposal";
import { rowsForQuestion } from "@/lib/knowledge/credential-redaction";
import { assembleGrounding } from "./grounding-assembly";
import {
  buildGroundingBlock,
  buildSystemPrompt,
  extractUsedMarkers,
  stripMarkers,
  type GroundingChunk,
} from "./prompts";
import { retrievalPlanFor } from "./retrieval-query";
import type { AskRequest, AskResponse } from "./types";

/**
 * ============================================================================
 * THE GROUNDED ANSWER PATH — server-side, and only server-side
 * ============================================================================
 *
 *   question
 *     -> answer from the FORMS LIBRARY  (inventory / proposal gates, first)
 *     -> embed + retrieve top-k chunks  (match_knowledge_chunks / pgvector;
 *                                        a follow-up that finds nothing is
 *                                        retried with its anchor)
 *     -> pin required rule documents    (company knowledge config; a
 *                                        follow-up keeps its anchor's)
 *     -> pin a named handbook           (by identity, when the question
 *                                        names it; degrades)
 *     -> REFUSE if a required one is unhealthy      <- no model call at all
 *     -> attach report figures          (company report registry, when routed)
 *     -> merge into one ordered set     (assembleGrounding)
 *     -> Claude                         (Anthropic SDK, server-side)
 *     -> AskResponse + SourceCitation[] (built from RETRIEVED ROWS)
 *
 * Two properties this function is written to guarantee:
 *
 *   1. Citations are built from RETRIEVED ROWS, never from model output. The
 *      model chooses which of the numbered sources it used; the server decides
 *      what those numbers mean. A fabricated title or page number has no path
 *      into a SourceCitation.
 *
 *   2. Nothing here falls back to MockAIProvider. If configuration is missing
 *      or a service fails, this throws AiError and the route says so.
 *
 * @param actor The AUTHORIZED caller — role and scope, from the route's
 *   `authorizeRequest` context. A separate parameter from `request`, which is
 *   parsed from the request body: a caller must never be able to assert its own
 *   role or its own location assignment.
 * @param memory Whose earlier conversations may be recalled — the validated
 *   session's subject, from the route. Omitted, nothing is recalled.
 */
export async function answerQuestion(
  request: AskRequest,
  actor: ChatActor,
  memory: { memoryOwnerId?: string } = {},
): Promise<AskResponse> {
  if (!chatTraceEnabled()) return answerQuestionBody(request, actor, memory);
  const draft = openChatTrace({
    conversationId: request.conversationId,
    messageId: request.questionMessageId,
    userId: actor.subject,
    originalQuery: request.question,
    formInProgress: Boolean(request.continueProposalTemplateKey || request.openForm || request.activeFormInstanceId),
  });
  return finishChatTrace(draft, () => answerQuestionBody(request, actor, memory));
}

async function answerQuestionBody(
  request: AskRequest,
  actor: ChatActor,
  memory: { memoryOwnerId?: string } = {},
): Promise<AskResponse> {
  const readiness = liveReadiness();

  if (readiness.missing.length > 0) {
    throw new AiError(
      "not_configured",
      `${ACTIVE_BRAND.productName} is running in live mode but is not fully configured. Missing: ${readiness.missing.join(", ")}.`,
      503,
      readiness.missing,
    );
  }
  if (readiness.problems.length > 0) {
    throw new AiError("not_configured", readiness.problems.join(" "), 503);
  }

  if (intentExtractionEnabled()) {
    const prepared = await applyIntentExtraction({ request, actor });
    if (prepared.clarification) return prepared.clarification;
    request = prepared.request;
  }

  /* ---------------------------------------------------------- forms -- */
  /*
   * THE LIBRARY IS THE AUTHORITY FOR ANYTHING ABOUT FORMS. A question about
   * the library is answered from the library; only a request for a form
   * proposes one. Both detectors are pure and run before anything is read.
   */
  const detected = detectInventoryQuestion(request.question);
  /*
   * A QUESTION ABOUT FORMS ALREADY ON FILE NAMES A FORM WITHOUT ASKING FOR ONE.
   * "Does Dana have a previous CA form?" reads as naming the Corrective Action
   * Form, and "past corrective action form for Marcus" as asking for one for
   * Marcus; either would get a proposal card nobody asked for. Unless the
   * sentence also says to make one, it is answered from the Forms Register
   * below. See `chat-form-records.ts`.
   */
  const spokenIntent: ReturnType<typeof detectTemplateIntent> = asksOnlyAboutFormsOnFile(request.question)
    ? { kind: "none" }
    : detectTemplateIntent(request.question);
  const elliptical = isEllipticalRegisterReference(request.question);

  /*
   * ONE READ OF THE LIBRARY PER TURN, SETTLED RATHER THAN AWAITED: on a forms
   * turn a failure is fatal (the question IS about the library); on any other
   * turn it is survivable and the forms block is simply omitted.
   */
  const summariesPromise = listTemplateSummaries().then(
    (rows) => ({ ok: true as const, rows }),
    (error: unknown) => ({ ok: false as const, error }),
  );

  const knowledge = new SupabaseKnowledgeProvider();

  let inventoryQuestion: InventoryQuestion = detected;
  if (elliptical) {
    const settled = await summariesPromise;
    if (settled.ok) {
      const anchor = resolveRegisterAnchor({
        history: request.history,
        templateNames: publishedEntries(buildFormInventory(settled.rows, actor)).map(
          (entry) => entry.name,
        ),
      });
      if (anchor.ambiguous) {
        return answerRegisterClarification({ named: anchor.named, role: actor.role });
      }
      if (anchor.register === "knowledge") {
        inventoryQuestion = { kind: "none" };
      } else if (anchor.register === "forms" && inventoryQuestion.kind === "none") {
        inventoryQuestion = { kind: "location" };
      }
    }
  }

  const formsTurn =
    inventoryQuestion.kind !== "none" ||
    spokenIntent.kind !== "none" ||
    Boolean(request.continueProposalTemplateKey) ||
    // "The form", answering "guidance, or a … Form?".
    answersFormClarification(request.history, request.question);

  if (formsTurn) {
    const settled = await summariesPromise;
    if (!settled.ok) {
      throw new AiError(
        "retrieval_failed",
        "The form library could not be read, so nothing was said about which forms exist. Nothing was answered from memory.",
        502,
      );
    }
    const summaries = settled.rows;

    const inventoryAnswer = answerInventoryQuestion({
      question: inventoryQuestion,
      inventory: buildFormInventory(summaries, actor),
      role: actor.role,
      namedTemplateKey: spokenIntent.kind === "explicit" ? spokenIntent.templateKey : null,
    });
    if (inventoryAnswer) return inventoryAnswer;

    let manualRead: ReturnType<SupabaseKnowledgeProvider["fetchOfficialPolicyManual"]> | null = null;
    const readManual = () =>
      (manualRead ??= new SupabaseKnowledgeProvider().fetchOfficialPolicyManual(ACTIVE_BRAND.knowledgeScopeId));
    const proposalQuestion = await questionForProposal(request, actor);
    const proposal = await deliverFormProposal({
      request,
      actor,
      question: proposalQuestion,
      decorate: (response) => decorateFormAnswer(request, actor, response),
      propose: (question) => proposeFormForTurn({
      history: request.history,
      question,
      questionMessageId: request.questionMessageId,
      actor,
      continueTemplateKey: request.continueProposalTemplateKey,
      summaries,
      today: request.context.todayIso,
      /*
       * WHETHER THE CORRECTIVE-ACTION LADDER CAN BE SHOWN, asked only when a
       * turn needs it (a metric on its own, "what comes after coaching?").
       * Read from the Performance Management Framework's own identity, as the
       * reference platform does; without the document the ladder is not
       * described from general knowledge.
       */
      progressionAvailable: () =>
        isFrameworkAvailable(
          new SupabaseKnowledgeProvider(),
          PERFORMANCE_MANAGEMENT_FRAMEWORK,
          ACTIVE_BRAND.knowledgeScopeId,
        ),
      /*
       * THE PINNED POLICY MANUAL, read only when a Corrective Action request
       * names a policy by a name the forms do not know ("violating visitors at
       * work policy"), so the reply can name the manual's own section.
       */
      policyManual: async () => {
        const manual = await readManual();
        return manual.ok ? manual.chunks : null;
      },
      /*
       * The JBA Policy Manual is the approved source whether it was tagged or
       * found by its name (Pau, 23 Oct 2026). The citation is still the
       * section and the printed page. One read serves both.
       */
      policyManualIdentity: async () => {
        const manual = await readManual();
        return manual.ok
          ? { title: manualDisplayTitle(manual.documentTitle), confirmed: approvedManualConfirmed(manual) }
          : null;
      },
      /*
       * THE EMPLOYEE'S FORMS ALREADY ON FILE, read only for a Corrective
       * Action so its history is read back before the form is created. See
       * `prior-forms.ts`.
       */
      priorFormsOnFile: (employeeName, locationId) => priorFormsReadingForChat(actor, employeeName, locationId),
    }),
    });
    // Flags off: decoration returns the same proposal, and the forms-library
    // answer returns here, before retrieval.
    if (proposal) return proposal;
  }

  /*
   * FORM COMMANDS THE PHRASE LIST MISSED. Off unless FORM_TOOLS_ENABLED.
   * A turn the existing detectors already claimed is left on that path.
   * A tool failure returns null and this falls through to retrieval.
   */
  if (formToolsEnabled() && !formsTurn) {
    const roster = slotRetentionEnabled() ? await loadRosterQuiet(actor) : [];
    const stored = await storedFields(request, actor);
    const understood = await understandFormTurn({
      question: request.question,
      history: request.history,
      today: request.context.todayIso,
      openTemplateKey: request.continueProposalTemplateKey ?? null,
    });
    if (understood && formCommandBypassesSearch(understood)) {
      const settled = await summariesPromise;
      if (!settled.ok) {
        throw new AiError(
          "retrieval_failed",
          "The form library could not be read, so nothing was said about which forms exist. Nothing was answered from memory.",
          502,
        );
      }
      const summaries = settled.rows;
      let manualRead: ReturnType<SupabaseKnowledgeProvider["fetchOfficialPolicyManual"]> | null = null;
      const readManual = () =>
        (manualRead ??= new SupabaseKnowledgeProvider().fetchOfficialPolicyManual(ACTIVE_BRAND.knowledgeScopeId));
      const routed = await routeUnderstoodFormTurn({
        reading: understood,
        question: request.question,
        history: request.history,
        today: request.context.todayIso,
        openTemplateKey: request.continueProposalTemplateKey ?? null,
        previous: stored ?? undefined,
        roster,
        propose: async (adjusted) =>
          deliverFormProposal({
            request,
            actor,
            question: await questionForProposal({ ...request, question: adjusted.question }, actor),
            decorate: (response) => decorateFormAnswer(request, actor, response),
            propose: (question) => proposeFormForTurn({
            history: request.history,
            question,
            questionMessageId: request.questionMessageId,
            actor,
            continueTemplateKey: adjusted.continueTemplateKey,
            summaries,
            today: request.context.todayIso,
            progressionAvailable: () =>
              isFrameworkAvailable(
                new SupabaseKnowledgeProvider(),
                PERFORMANCE_MANAGEMENT_FRAMEWORK,
                ACTIVE_BRAND.knowledgeScopeId,
              ),
            policyManual: async () => {
              const manual = await readManual();
              return manual.ok ? manual.chunks : null;
            },
            policyManualIdentity: async () => {
              const manual = await readManual();
              return manual.ok
                ? { title: manualDisplayTitle(manual.documentTitle), confirmed: approvedManualConfirmed(manual) }
                : null;
            },
            priorFormsOnFile: (employeeName, locationId) => priorFormsReadingForChat(actor, employeeName, locationId),
          }),
          }),
      });
      if (routed) {
        await persistFields(request, actor, routed.fields);
        return routed.response;
      }
    }
  }

  /*
   * WHO AND WHICH STORE THE QUESTION NAMES — answered outright when the question
   * is only a lookup, otherwise attached as verified records. Deterministic and
   * read-only; see `entity-facts.ts`.
   */
  const entities = await resolveChatEntities({ question: request.question, history: request.history, actor });
  if (entities.direct) return entities.direct;

  /* ------------------------------------------------------- retrieve -- */
  /*
   * WHAT THIS MANAGER TOLD BUBBLES BEFORE about the people this conversation
   * names — their own earlier conversations and the forms they filed, nobody
   * else's. Started here, after every forms branch and the direct lookup have
   * had their chance to return, so neither pays for it; it runs alongside
   * retrieval and never rejects. See `chat/person-memory-store.ts`.
   */
  const memoryPromise = memory.memoryOwnerId
    ? recallPeople({
        userId: memory.memoryOwnerId,
        question: request.question,
        history: request.history,
        conversationId: request.conversationId,
        userName: request.context.userName,
      })
    : Promise.resolve(null);

  /*
   * FORMS ALREADY ON FILE. "Does Wren have previous coachings?" used to be
   * answered with "I can't look that up — check the Forms Register", when the
   * register is this app's own table. A question about existing forms now
   * reads it, as the AUTHORIZED actor and under exactly the visibility that
   * screen applies — see `chat-form-records.ts`. Never rejects: a failed read
   * becomes a block that says so.
   */
  const formRecordsPromise = isFormRecordsQuestion(request.question)
    ? loadFormRecords({
        actor,
        question: request.question,
        previousQuestion: previousManagerTurn(request),
        today: request.context.todayIso,
      })
    : Promise.resolve(null);

  /*
   * THE RETRIEVALS RUN TOGETHER. None depends on another.
   *
   * WHICH REPORTS THIS QUESTION NEEDS: the question's own words route through
   * the company report registry, and a report context ("ask about this
   * report") always adds its own report. The scope passed to every loader is
   * the AUTHORIZED actor's — never anything from the request.
   */
  const routedReports = routeReportQuestion(request.question);
  const contextReport = request.reportContext?.reportId ?? null;
  const reportIds = [...new Set([...(contextReport ? [contextReport] : []), ...routedReports])].filter(
    (id) => reportById(id) !== undefined,
  );

  const briefingPromise =
    reportIds.length > 0 ? loadBriefings(reportIds, request, actor) : Promise.resolve(null);

  /*
   * PINNED RULE DOCUMENTS. Configured per company; each names the questions
   * that need it and whether its absence refuses the turn or degrades it.
   *
   * A FOLLOW-UP KEEPS ITS ANCHOR'S DOCUMENTS. "And for part-timers?" after a
   * question that pinned a rule document needs the same rules, so a fragment
   * is tested together with the nearest standalone manager turn — the
   * reference platform's continuation walk, bounded and never reading an
   * assistant turn. See `continuation.ts`.
   */
  const texts = gateTexts(request.question, request.history);
  const pinnedWanted = PINNED_KNOWLEDGE_ROLES.filter((entry) =>
    entry.isWanted
      ? entry.isWanted({ question: request.question, history: request.history })
      : entry.triggers.some((trigger) => texts.some((text) => trigger.test(text))),
  );
  const pinnedPromise = Promise.all(
    pinnedWanted.map(async (entry) => ({
      entry,
      result: await knowledge.fetchRoleGrounding(entry.role, request.scopeId),
    })),
  );

  /*
   * A HANDBOOK THE QUESTION NAMES, read by identity. Degrades: a failed lookup
   * leaves ordinary retrieval standing and adds no note. Off unless the
   * company configures `NAMED_HANDBOOK`.
   */
  const handbookPromise = namesHandbook(request.question, NAMED_HANDBOOK)
    ? knowledge.fetchNamedHandbook(NAMED_HANDBOOK!.identity, request.scopeId)
    : Promise.resolve(null);

  /*
   * Only the query changes: the model is still given the question as typed.
   * When the flag is on, a short follow-up is anchored to the earlier turn
   * and the query is then phrased in the manual's terms. SKIP keeps a form
   * command as typed. See `retrievalPlan` and `retrieval-query.ts`.
   */
  const retrievalQuestion = queryRewriteEnabled()
    ? await rewriteRetrievalQuery({
        question: request.question,
        history: request.history,
        fallback: request.question,
      })
    : request.question;
  updateChatTrace({ rewrittenQuery: retrievalQuestion === request.question ? null : retrievalQuestion });
  const plan = retrievalPlanFor({
    question: retrievalQuestion,
    history: request.history,
    openForm: request.openForm ?? null,
  });
  const limit = pinnedWanted.length > 0 ? RETRIEVAL.roleAugmentedTopK : RETRIEVAL.topK;

  let rows: MatchedChunkRow[];
  try {
    rows = await searchWithPlan(
      plan,
      (query) =>
        retrievalRecallEnabled()
          ? matchRecallKnowledge({ query, scopeId: request.scopeId, limit })
          : hybridSearchEnabled()
            ? matchHybridKnowledge({ query, scopeId: request.scopeId, limit })
            : knowledge.match({ query, scopeId: request.scopeId, limit }),
      limit,
    );
  } catch (error) {
    if (error instanceof MissingConfigurationError) {
      throw new AiError("not_configured", error.message, 503, error.missing);
    }
    throw new AiError(
      "retrieval_failed",
      "The company knowledge base could not be searched, so no answer was produced. Nothing was answered from memory.",
      502,
    );
  }

  const pinnedResults = await pinnedPromise;
  const handbook = await handbookPromise;

  /*
   * A MANDATORY SOURCE THAT CANNOT BE GUARANTEED STOPS THE TURN. An answer
   * that needed a rule document and does not have it would be
   * indistinguishable from a good one.
   */
  const refused = pinnedResults.find(
    ({ entry, result }) => entry.onUnavailable === "refuse" && !result.ok,
  );
  if (refused) {
    /*
     * A QUERY THAT FAILED IS NOT A DOCUMENT THAT IS MISSING. A momentary
     * database error used to answer "this document is unavailable — ask an
     * administrator", with no Retry, on a turn that would have worked a
     * second later. A failed lookup is now the same retryable failure as a
     * failed search; a document that is genuinely absent, ambiguous or
     * incomplete still refuses with the configured wording, and in neither
     * case is anything answered from memory.
     */
    const failure = refused.result.ok ? null : refused.result.failure;
    if (failure && (failure.code === "role_document_query_failed" || failure.code === "role_chunk_query_failed")) {
      throw new AiError(
        "retrieval_failed",
        "A company document this answer depends on could not be read just now, so no answer was produced. Nothing was answered from memory.",
        502,
      );
    }
    return {
      content: refused.entry.unavailableMessage,
      citations: [],
      coverage: "insufficient",
    };
  }

  const pinned: RoleGrounding[] = pinnedResults.flatMap(({ result }) =>
    result.ok ? [result.grounding] : [],
  );

  const handbookCoverage = handbook?.ok
    ? selectHandbookCoverage({
        question: request.question,
        documentId: handbook.documentId,
        documentTitle: handbook.documentTitle,
        documentCategory: handbook.documentCategory,
        chunks: handbook.chunks,
        notATopic: NAMED_HANDBOOK?.notATopic ?? [],
      })
    : null;

  const assembled = assembleGrounding({
    /* The handbook AFTER the rule documents, and not a role document itself. */
    mandatory: [...pinned.flatMap((entry) => entry.rows), ...(handbookCoverage?.rows ?? [])],
    retrieved: rows,
    roleDocumentIds: pinned.map((entry) => entry.documentId),
    evidenceBudget: RETRIEVAL.contextChunks,
  });

  /*
   * Default account passwords withheld unless the question is about them —
   * from the grounding and the source cards alike, since both derive from
   * these rows. Ported from the reference platform; see
   * `knowledge/credential-redaction.ts`.
   */
  const used = rowsForQuestion(request.question, assembled.rows);

  /* Where the pinned handbook rows landed, so the note names real markers only. */
  const handbookChunkIds = new Set((handbookCoverage?.rows ?? []).map((row) => row.chunk_id));
  const handbookNote = handbookCoverage
    ? buildHandbookNote(
        handbookCoverage,
        used.flatMap((row, index) => (handbookChunkIds.has(row.chunk_id) ? [index + 1] : [])),
      )
    : null;
  const grounding: GroundingChunk[] = used.map((row, index) => ({
    marker: index + 1,
    documentTitle: row.document_title,
    locator: row.locator,
    content: row.content,
  }));

  const briefing = await briefingPromise;

  const settledSummaries = await summariesPromise;
  const personMemory = await memoryPromise;
  const formRecords = await formRecordsPromise;
  const formInventoryBlock = settledSummaries.ok
    ? buildFormInventoryBlock(buildFormInventory(settledSummaries.rows, actor))
    : null;

  const pinnedIds = new Set(assembled.pinnedDocumentIds);
  const pinnedTitles = pinned
    .filter((entry) => pinnedIds.has(entry.documentId))
    .map((entry) => entry.documentTitle);

  const system = buildSystemPrompt({
    assistantName: ACTIVE_BRAND.assistantName,
    brandName: ACTIVE_BRAND.brandName,
    productName: ACTIVE_BRAND.productName,
    locationNoun: ACTIVE_BRAND.vocabulary.locationNoun,
    context: request.context,
    mode: request.mode,
    hasContext: grounding.length > 0,
    hasReportData: (briefing?.present.length ?? 0) > 0,
    hasMissingReports: (briefing?.missing.length ?? 0) > 0,
    hasFormsLibrary: formInventoryBlock !== null,
    hasVerifiedRecords: entities.block !== null,
    /* Read from whether the block exists, like the forms library above. */
    hasPersonMemory: personMemory !== null,
    hasFormRecords: formRecords !== null,
    pinnedDocumentTitles: pinnedTitles,
    handbookNote,
    /*
     * From the AUTHORIZED actor, the same matrix the report pages' guard
     * reads, so the assistant only sends somebody to Reports when the sidebar
     * would show it to them and the page would let them in.
     */
    canViewReports:
      actor.role !== null &&
      hasPermission(DEFAULT_PERMISSION_MATRIX, actor.role, "view_reports"),
    /* Read from the instance by the route, never from the body. */
    openForm: request.openForm ?? null,
    styleRules: chatStyleRulesEnabled(),
    priorCoachingOptional: priorCoachingOptionalEnabled(),
    recalledMemory: await recalledMemoryBlock(request, actor),
    fewShotExamples: await loadFewShotBlock(request.question),
    typedName: typedNameEnabled(),
    policyCitation: policyCitationEnabled(),
  });

  const longContext = longContextEnabled()
    ? await prepareLongContext({
        history: request.history,
        userId: actor.subject ?? null,
        conversationId: request.conversationId ?? null,
      })
    : null;
  const dataAddition = await loadChatDataBlock({
    enabled: chatDataToolsEnabled(),
    question: request.question,
    role: actor.role,
    breakdown: reportBreakdownEnabled(),
  });
  const pinnedPolicy = await citedManualGrounding(request, knowledge);
  const groundingText = [buildGroundingBlock(grounding), pinnedPolicy]
    .filter((part) => part && part.length > 0)
    .join("\n\n");
  updateChatTrace({
    retrievalCount: rows.length,
    retrieved: rows.slice(0, 20).map((row) => ({
      id: row.chunk_id,
      title: row.document_title,
      section: row.section,
      score: row.similarity,
    })),
    prompt: redactTraceText(system),
  });
  const answer = await callClaude({
    system,
    grounding: dataAddition.help ? `${groundingText}\n\n${dataAddition.help}` : groundingText,
    reportData: [briefing?.text ?? null, dataAddition.data].filter((part) => part && part.length > 0).join("\n\n") || null,
    formsLibrary: formInventoryBlock,
    verifiedRecords: entities.block,
    personMemory,
    formRecords: formRecords?.block ?? null,
    history: request.history,
    ...(longContext ? { historyPolicy: "budget" as const, priorSummary: longContext.summary } : {}),
    question: request.question,
    maxTokens: CLAUDE_MAX_TOKENS[request.mode],
  });

  const markers = extractUsedMarkers(answer, grounding.map((chunk) => chunk.marker));
  const citations: SourceCitation[] = markers
    .map((marker) => used[marker - 1])
    .filter((row): row is MatchedChunkRow => Boolean(row))
    .map(rowToCitation);

  const suggested = await suggestedFormsFor({ summariesPromise, request, actor });

  const prose = suggested ? `${stripMarkers(answer)}\n\n${suggested.lead}` : stripMarkers(answer);
  const manualChunks = rows.map((row, index) => ({
    chunkIndex: index,
    page: row.page,
    printedPage: printedPageOnlyEnabled() ? printedPageFromRetrieval(row) : row.page,
    section: row.section,
    content: row.content,
  }));
  const cited = policyCitationEnabled()
    ? withMappedPolicy(
        prose,
        [...request.history.filter((turn) => turn.role === "user").map((turn) => turn.content), request.question],
        manualChunks,
        true,
      )
    : prose;
  const checked = await applySelfCheck({
    answer: cited,
    chunks: manualChunks,
    loadRoster: () => loadRosterQuiet(actor),
  });
  return {
    content: checked,
    formSelection: suggested?.selection,
    citations,
    coverage: answerCoverage({
      retrieved: grounding.length,
      cited: citations.length,
      reportBacked: (briefing?.present.length ?? 0) > 0,
      recordBacked: formRecords !== null,
      aboutForms: asksAboutForms(request.question),
    }),
  };
}

/**
 * ============================================================================
 * AN ANSWER THAT CITES NOTHING IS NOT GROUNDED, WHATEVER WAS RETRIEVED
 * ============================================================================
 *
 * Coverage used to be "was anything retrieved?". A tangential chunk just over
 * the similarity floor — the Break Policy for "how much PTO do I get?" — made
 * the turn "grounded", the model answered from memory with no marker, and the
 * manager saw a confident entitlement with no sources AND no "not covered"
 * notice. Nothing on screen said it was not company policy.
 *
 * So a turn is grounded only when the answer actually cites a retrieved row,
 * or stands on report figures (which carry their period, not a marker) or
 * on the forms on file read from the Forms Register (a record, unmarked too).
 * Questions about the forms library are the one exception: forms-library
 * facts are deliberately unmarked (see the prompt's taxonomy), and the
 * library is exhaustive, so an uncited answer about a form is not general
 * guidance.
 */
export function answerCoverage(input: {
  retrieved: number;
  cited: number;
  reportBacked: boolean;
  /**
   * The answer stands on the FORMS ON FILE block: a record, read for this
   * question, which carries no marker either. Optional so the older callers
   * read as before.
   */
  recordBacked?: boolean;
  aboutForms: boolean;
}): "grounded" | "insufficient" {
  if (input.reportBacked || input.recordBacked) return "grounded";
  if (input.retrieved === 0) return "insufficient";
  return input.cited > 0 || input.aboutForms ? "grounded" : "insufficient";
}

interface ReportBriefings {
  readonly text: string;
  readonly present: readonly string[];
  readonly missing: readonly string[];
}

/**
 * Each routed report's loader, under the actor's resolved scope. A report the
 * question needed and that has no delivery is NAMED in the block: an answer
 * assembled from the reports that loaded, silent about the one that did not,
 * is the most confident wrong answer this pipeline could produce.
 */
async function loadBriefings(
  reportIds: readonly string[],
  request: AskRequest,
  actor: ChatActor,
): Promise<ReportBriefings> {
  const scope = await resolveScopeFor(actor.scope);
  const present: string[] = [];
  const missing: string[] = [];
  const blocks: string[] = [];

  for (const id of reportIds) {
    const definition = reportById(id)!;
    const loader = COMPANY_REPORT_LOADERS[id];
    let text: string | null = null;
    if (loader) {
      try {
        text = await loader({
          question: request.question,
          today: request.context.todayIso,
          scope,
          context: request.reportContext?.reportId === id ? request.reportContext : null,
        });
      } catch {
        text = null;
      }
    }
    if (text && text.trim()) {
      present.push(id);
      blocks.push(text.trim());
    } else {
      missing.push(id);
      blocks.push(
        `${definition.label}: NOT LOADED — there is no current delivery of this report for the question asked.`,
      );
    }
  }

  return { text: `REPORT DATA\n\n${blocks.join("\n\n")}`, present, missing };
}

async function suggestedFormsFor(input: {
  summariesPromise: Promise<{ ok: true; rows: TemplateSummary[] } | { ok: false; error: unknown }>;
  request: AskRequest;
  actor: ChatActor;
}): Promise<ReturnType<typeof suggestFormsForTurn>> {
  try {
    const settled = await input.summariesPromise;
    if (!settled.ok) return null;
    return suggestFormsForTurn({
      history: input.request.history,
      question: input.request.question,
      questionMessageId: input.request.questionMessageId,
      actor: input.actor,
      summaries: settled.rows,
    });
  } catch {
    return null;
  }
}

async function decorateFormAnswer(request: AskRequest, actor: ChatActor, response: AskResponse): Promise<AskResponse> {
  const coachingOn = priorCoachingOptionalEnabled();
  const policyOn = policyCitationEnabled();
  const slotsOn = slotRetentionEnabled();
  if (!coachingOn && !policyOn && !slotsOn) return response;
  const turns = [...request.history.filter((turn) => turn.role === "user").map((turn) => turn.content), request.question];
  let content = response.content;
  if (coachingOn) {
    content = applyOptionalPriorCoaching(content, { enabled: true, records: [], managerText: turns.join("\n") });
  }
  if (slotsOn) {
    const roster = await loadRosterQuiet(actor);
    const stored = await storedFields(request, actor);
    const fields = mergeConfirmed(
      stored ?? {
        employeeName: null,
        employeeId: null,
        jobTitle: null,
        store: null,
        locationId: null,
        incidentDateIso: null,
        useToday: false,
        payrollDeduct: null,
        payrollAmount: null,
        warningLevel: null,
        policySection: null,
        whatHappened: false,
        deadline: null,
        pendingChoice: [],
      },
      fieldsFromManagerText(turns.join("\n"), request.context.todayIso, roster),
      false,
    );
    content = retainFieldsInReply(content, fields);
    await persistFields(request, actor, fields);
  }
  if (policyOn) {
    try {
      const manual = await new SupabaseKnowledgeProvider().fetchOfficialPolicyManual(ACTIVE_BRAND.knowledgeScopeId);
      if (manual.ok) content = withMappedPolicy(content, turns, manual.chunks, true);
    } catch {
      // A manual read that fails leaves the proposal as the forms path wrote it.
    }
  }
  return content === response.content ? response : { ...response, content };
}

async function questionForProposal(request: AskRequest, actor: ChatActor): Promise<string> {
  if (!slotRetentionEnabled() && !fieldAccuracyEnabled()) return request.question;
  const roster = slotRetentionEnabled() ? await loadRosterQuiet(actor) : [];
  const stored = slotRetentionEnabled() ? await storedFields(request, actor) : null;
  const question = augmentIntakeQuestion({
    slots: slotRetentionEnabled(),
    fields: fieldAccuracyEnabled(),
    question: request.question,
    history: request.history,
    today: request.context.todayIso,
    roster,
    stored: stored,
  });
  if (slotRetentionEnabled() && actor.subject && request.conversationId) {
    const fields = mergeConfirmed(
      stored ?? {
        employeeName: null,
        employeeId: null,
        jobTitle: null,
        store: null,
        locationId: null,
        incidentDateIso: null,
        useToday: false,
        payrollDeduct: null,
        payrollAmount: null,
        warningLevel: null,
        policySection: null,
        whatHappened: false,
        deadline: null,
        pendingChoice: [],
      },
      fieldsFromManagerText(
        [...request.history.filter((turn) => turn.role === "user").map((turn) => turn.content), request.question].join("\n"),
        request.context.todayIso,
        roster,
      ),
      false,
    );
    const incidentKey = fields.employeeName
      ? incidentFingerprint({
          employeeName: fields.employeeName,
          formDate: fields.incidentDateIso,
          text: request.question,
        })
      : null;
    await saveConversationFormState({
      userId: actor.subject,
      conversationId: request.conversationId,
      fields,
      incidentKey,
    });
  }
  return question;
}

async function storedFields(request: AskRequest, actor: ChatActor) {
  if (!slotRetentionEnabled() || !actor.subject || !request.conversationId) return null;
  const stored = await loadConversationFormState({ userId: actor.subject, conversationId: request.conversationId });
  return stored?.fields ?? null;
}

async function persistFields(
  request: AskRequest,
  actor: { subject?: string },
  fields: Parameters<typeof saveConversationFormState>[0]["fields"],
): Promise<void> {
  if (!slotRetentionEnabled() || !actor.subject || !request.conversationId) return;
  await saveConversationFormState({
    userId: actor.subject,
    conversationId: request.conversationId,
    fields,
    incidentKey: fields.employeeName
      ? incidentFingerprint({ employeeName: fields.employeeName, formDate: fields.incidentDateIso, text: request.question })
      : null,
  });
}

async function loadRosterQuiet(actor: ChatActor) {
  try {
    return await loadScopedRoster(actor.scope);
  } catch {
    return [];
  }
}

async function recalledMemoryBlock(request: AskRequest, actor: ChatActor): Promise<string | null> {
  if (!chatMemoryEnabled() || !actor.subject) return null;
  try {
    const cue = memoryCue(request.question);
    if (cue) {
      await rememberFact({ userId: actor.subject, ...cue, sourceConversationId: request.conversationId ?? null });
    }
    return formatRecalledMemory(
      factsVisibleInConversation(await recallMemory(actor.subject), request.conversationId ?? null),
    );
  } catch {
    return null;
  }
}

async function citedManualGrounding(
  request: AskRequest,
  knowledge: { fetchOfficialPolicyManual(scopeId: string): Promise<{ ok: true; chunks: readonly import("@/lib/forms/official-policy-manual").ManualChunk[] } | { ok: false }> },
): Promise<string | null> {
  if (!policyCitationEnabled()) return null;
  const notes = [
    request.question,
    ...request.history.filter((turn) => turn.role === "user").slice(-3).map((turn) => turn.content),
  ].join("\n");
  if (describedAttendanceKeys(notes) === null && !mayDescribeSection(notes)) return null;
  try {
    const manual = await knowledge.fetchOfficialPolicyManual(ACTIVE_BRAND.knowledgeScopeId);
    if (!manual.ok) return null;
    return pinnedManualBlock(notes, manual.chunks);
  } catch {
    return null;
  }
}

/** The manager's turn before this one, for a question that names nobody. */
function previousManagerTurn(request: AskRequest): string | null {
  for (let index = request.history.length - 1; index >= 0; index -= 1) {
    const message = request.history[index]!;
    if (message.role === "user" && message.content.trim() !== request.question.trim()) {
      return message.content;
    }
  }
  return null;
}
