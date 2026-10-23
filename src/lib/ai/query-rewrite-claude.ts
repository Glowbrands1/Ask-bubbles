import "server-only";

import { CLAUDE_HAIKU_MODEL } from "@/lib/config/models";

import { callClaudeTool } from "./call-claude";
import { queryAfterRewrite, shouldRewriteFollowUp } from "./query-rewrite";

/**
 * Rewrite a short follow-up into a standalone search query.
 *
 * Failure keeps the query the existing retrieval path already built. The
 * model is asked to use the earlier turn, not a fixed list of topics.
 */

const SYSTEM = `Rewrite the manager's latest turn into one standalone knowledge-base search query.
If the turn is a form confirmation or command (yes, go ahead, create the form, do the paperwork), set query to SKIP.
Otherwise name the policy or topic the follow-up refers to, using the earlier turn for words the follow-up leaves out.
Do not invent a policy name that the earlier turn did not suggest.
Return only the tool call. Do not answer the question.`;

const MANUAL_SYSTEM = `Rewrite the manager's question into one knowledge-base search query in the terms a policy manual would use.
Use words from the question and the earlier turns. Do not add a policy, a person, or a store the conversation did not mention.
If the turn is a form confirmation or command (yes, go ahead, create the form, do the paperwork), set query to SKIP.
Return only the tool call. Do not answer the question.`;

function readQuery(input: unknown): string | null {
  if (!input || typeof input !== "object" || !("query" in input)) return null;
  const query = (input as { query?: unknown }).query;
  return typeof query === "string" ? query : null;
}

export async function rewriteFollowUpQuery(input: {
  readonly question: string;
  readonly history: readonly { role: string; content: string }[];
  readonly fallback: string;
}): Promise<string> {
  if (!shouldRewriteFollowUp(input.question, input.history)) return input.fallback;
  const prior = [...input.history].reverse().find((turn) => turn.role === "user" && turn.content.trim() !== "");
  try {
    const raw = await callClaudeTool({
      model: CLAUDE_HAIKU_MODEL,
      system: SYSTEM,
      maxTokens: 200,
      tool: {
        name: "rewrite_search_query",
        description: "One standalone search query, or SKIP.",
        input_schema: {
          type: "object",
          additionalProperties: false,
          required: ["query"],
          properties: { query: { type: "string" } },
        },
      },
      messages: [
        {
          role: "user",
          content: `Earlier turn:\n${prior?.content ?? ""}\n\nLatest turn:\n${input.question}`,
        },
      ],
    });
    return queryAfterRewrite(input.fallback, readQuery(raw));
  } catch {
    return input.fallback;
  }
}

/**
 * The retrieval query when QUERY_REWRITE_ENABLED is on.
 *
 * A short follow-up is still anchored to the earlier turn. The query is
 * then phrased in manual terms. SKIP, an empty rewrite, or a model failure
 * keeps the query the caller already had. The model that answers still
 * sees the question as typed; only this string is searched.
 */
export async function rewriteRetrievalQuery(input: {
  readonly question: string;
  readonly history: readonly { role: string; content: string }[];
  readonly fallback: string;
}): Promise<string> {
  const anchored = await rewriteFollowUpQuery(input);
  const basis = anchored.trim() ? anchored : input.fallback;
  const prior = [...input.history].reverse().find((turn) => turn.role === "user" && turn.content.trim() !== "");
  try {
    const raw = await callClaudeTool({
      model: CLAUDE_HAIKU_MODEL,
      system: MANUAL_SYSTEM,
      maxTokens: 200,
      tool: {
        name: "rewrite_search_query",
        description: "One search query in the manual's terms, or SKIP.",
        input_schema: {
          type: "object",
          additionalProperties: false,
          required: ["query"],
          properties: { query: { type: "string" } },
        },
      },
      messages: [
        {
          role: "user",
          content: `Earlier turn:\n${prior?.content ?? ""}\n\nQuestion:\n${basis}`,
        },
      ],
    });
    return queryAfterRewrite(basis, readQuery(raw));
  } catch {
    return basis;
  }
}
