import "server-only";

import { CLAUDE_HAIKU_MODEL } from "@/lib/config/models";
import { selfCheckEnabled } from "@/lib/config/chat-quality-flags";
import type { RosterEmployee } from "@/lib/forms/employee-match";

import { callClaudeTool } from "./call-claude";
import { chooseCheckedAnswer, selfCheck, type CheckChunk, type SelfCheckFailure } from "./self-check";

/**
 * One repair when a check fails. A second failure, or a model failure,
 * leaves the answer that was already written. The flag is off: the model
 * is not called and the answer is unchanged.
 */

const SYSTEM = `Rewrite the answer so the failed checks pass.
A citation must name a heading and page from the retrieved sections, and no other.
An action plan must be exactly two sentences.
A person presented as the employee must be on the roster. If the check says they are not, do not present them as the employee.
Change only what a failed check names. Do not add a policy, a page, or a person the retrieved sections and the roster do not contain.
Return only the tool call.`;

export async function applySelfCheck(input: {
  readonly answer: string;
  readonly chunks: readonly CheckChunk[];
  readonly loadRoster: () => Promise<readonly RosterEmployee[]>;
}): Promise<string> {
  if (!selfCheckEnabled()) return input.answer;
  try {
    const roster = await input.loadRoster();
    const failures = selfCheck({ answer: input.answer, chunks: input.chunks, roster });
    if (failures.length === 0) return input.answer;
    const repaired = await repairOnce(input.answer, failures, input.chunks).catch(() => null);
    if (!repaired) return input.answer;
    const again = selfCheck({ answer: repaired, chunks: input.chunks, roster });
    return chooseCheckedAnswer(input.answer, repaired, again);
  } catch {
    return input.answer;
  }
}

async function repairOnce(
  answer: string,
  failures: readonly SelfCheckFailure[],
  chunks: readonly CheckChunk[],
): Promise<string | null> {
  const sections = chunks
    .map((chunk) => {
      const heading = chunk.section?.trim();
      if (!heading) return null;
      const page = chunk.printedPage ?? chunk.page;
      return page && page > 0 ? `${heading} p.${page}` : heading;
    })
    .filter((line): line is string => Boolean(line))
    .slice(0, 20);
  const raw = await callClaudeTool({
    model: CLAUDE_HAIKU_MODEL,
    system: SYSTEM,
    maxTokens: 700,
    tool: {
      name: "repair_answer",
      description: "The answer with the failed checks corrected.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["answer"],
        properties: { answer: { type: "string" } },
      },
    },
    messages: [
      {
        role: "user",
        content: `Failed checks:\n${failures.map((failure) => `- ${failure.detail}`).join("\n")}\n\nRetrieved sections:\n${sections.join("\n") || "(none)"}\n\nAnswer:\n${answer}`,
      },
    ],
  });
  if (!raw || typeof raw !== "object" || !("answer" in raw)) return null;
  const next = (raw as { answer?: unknown }).answer;
  return typeof next === "string" && next.trim() ? next.trim() : null;
}
