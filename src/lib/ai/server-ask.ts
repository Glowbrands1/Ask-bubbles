import "server-only";

import { PINNED_KNOWLEDGE_ROLES } from "@/config/company/knowledge";
import { COMPANY_REPORT_LOADERS } from "@/config/company/reports.server";
import { ACTIVE_BRAND } from "@/lib/brand";
import { CLAUDE_MAX_TOKENS, RETRIEVAL } from "@/lib/config/models";
import { MissingConfigurationError, liveReadiness } from "@/lib/config/server-env";
import { buildFormInventory, publishedEntries } from "@/lib/forms/inventory";
import { detectInventoryQuestion, type InventoryQuestion } from "@/lib/forms/inventory-question";
import {
  isEllipticalRegisterReference,
  resolveRegisterAnchor,
} from "@/lib/forms/register-anchor";
import { listTemplateSummaries, type TemplateSummary } from "@/lib/forms/repository";
import { detectTemplateIntent } from "@/lib/forms/template-intent";
import { rowToCitation, type MatchedChunkRow } from "@/lib/knowledge/mappers";
import { SupabaseKnowledgeProvider } from "@/lib/knowledge/providers/supabase";
import type { RoleGrounding } from "@/lib/knowledge/role-grounding";
import { reportById, routeReportQuestion } from "@/lib/reporting/registry";
import { resolveScopeFor } from "@/lib/reporting/scope/server";
import type { SourceCitation } from "@/types";

import { callClaude } from "./call-claude";
import { AiError } from "./errors";
import {
  answerInventoryQuestion,
  answerRegisterClarification,
  buildFormInventoryBlock,
} from "./form-answers";
import { proposeFormForTurn, suggestFormsForTurn, type ChatActor } from "./form-proposal";
import { assembleGrounding } from "./grounding-assembly";
import {
  buildGroundingBlock,
  buildSystemPrompt,
  extractUsedMarkers,
  stripMarkers,
  type GroundingChunk,
} from "./prompts";
import type { AskRequest, AskResponse } from "./types";

/**
 * ============================================================================
 * THE GROUNDED ANSWER PATH — server-side, and only server-side
 * ============================================================================
 *
 *   question
 *     -> answer from the FORMS LIBRARY  (inventory / proposal gates, first)
 *     -> embed + retrieve top-k chunks  (match_knowledge_chunks / pgvector)
 *     -> pin required rule documents    (company knowledge config)
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
 */
export async function answerQuestion(
  request: AskRequest,
  actor: ChatActor,
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

  /* ---------------------------------------------------------- forms -- */
  /*
   * THE LIBRARY IS THE AUTHORITY FOR ANYTHING ABOUT FORMS. A question about
   * the library is answered from the library; only a request for a form
   * proposes one. Both detectors are pure and run before anything is read.
   */
  const detected = detectInventoryQuestion(request.question);
  const spokenIntent = detectTemplateIntent(request.question);
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
    Boolean(request.continueProposalTemplateKey);

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

    const proposal = await proposeFormForTurn({
      history: request.history,
      question: request.question,
      questionMessageId: request.questionMessageId,
      actor,
      continueTemplateKey: request.continueProposalTemplateKey,
      summaries,
      today: request.context.todayIso,
    });
    if (proposal) return proposal;
  }

  /* ------------------------------------------------------- retrieve -- */
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
   */
  const pinnedWanted = PINNED_KNOWLEDGE_ROLES.filter((entry) =>
    entry.triggers.some((trigger) => trigger.test(request.question)),
  );
  const pinnedPromise = Promise.all(
    pinnedWanted.map(async (entry) => ({
      entry,
      result: await knowledge.fetchRoleGrounding(entry.role, request.scopeId),
    })),
  );

  let rows: MatchedChunkRow[];
  try {
    rows = await knowledge.match({
      query: request.question,
      scopeId: request.scopeId,
      limit: pinnedWanted.length > 0 ? RETRIEVAL.roleAugmentedTopK : RETRIEVAL.topK,
    });
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

  /*
   * A MANDATORY SOURCE THAT CANNOT BE GUARANTEED STOPS THE TURN. An answer
   * that needed a rule document and does not have it would be
   * indistinguishable from a good one.
   */
  const refused = pinnedResults.find(
    ({ entry, result }) => entry.onUnavailable === "refuse" && !result.ok,
  );
  if (refused) {
    return {
      content: refused.entry.unavailableMessage,
      citations: [],
      coverage: "insufficient",
    };
  }

  const pinned: RoleGrounding[] = pinnedResults.flatMap(({ result }) =>
    result.ok ? [result.grounding] : [],
  );

  const assembled = assembleGrounding({
    mandatory: pinned.flatMap((entry) => entry.rows),
    retrieved: rows,
    roleDocumentIds: pinned.map((entry) => entry.documentId),
    evidenceBudget: RETRIEVAL.contextChunks,
  });

  const used = assembled.rows;
  const grounding: GroundingChunk[] = used.map((row, index) => ({
    marker: index + 1,
    documentTitle: row.document_title,
    locator: row.locator,
    content: row.content,
  }));

  const briefing = await briefingPromise;

  const settledSummaries = await summariesPromise;
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
    pinnedDocumentTitles: pinnedTitles,
  });

  const answer = await callClaude({
    system,
    grounding: buildGroundingBlock(grounding),
    reportData: briefing?.text ?? null,
    formsLibrary: formInventoryBlock,
    history: request.history,
    question: request.question,
    maxTokens: CLAUDE_MAX_TOKENS[request.mode],
  });

  const markers = extractUsedMarkers(answer, grounding.map((chunk) => chunk.marker));
  const citations: SourceCitation[] = markers
    .map((marker) => used[marker - 1])
    .filter((row): row is MatchedChunkRow => Boolean(row))
    .map(rowToCitation);

  const suggested = await suggestedFormsFor({ summariesPromise, request, actor });

  return {
    content: suggested ? `${stripMarkers(answer)}\n\n${suggested.lead}` : stripMarkers(answer),
    formSelection: suggested?.selection,
    citations,
    coverage:
      grounding.length === 0 && (briefing?.present.length ?? 0) === 0 ? "insufficient" : "grounded",
  };
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
