import { printedPageOnlyEnabled } from "@/lib/config/chat-quality-flags";
import { actionPlanSentenceCount } from "@/lib/forms/action-plan-sentences";
import { matchEmployeeName, type RosterEmployee } from "@/lib/forms/employee-match";
import { headingKey } from "@/lib/forms/official-policy-manual";
import { readEmployeeMentions } from "@/lib/forms/proposal";

/**
 * Checks on an answer, against the chunks and the roster this turn already
 * loaded.
 *
 * A citation has to be a heading and page those chunks carry. An action
 * plan, when the answer has one, is two sentences. A person the answer
 * names has to be on the roster. Nothing here is a list of policies or
 * of people: the chunks and the roster are the whole authority.
 */

export interface CheckChunk {
  readonly section?: string | null;
  readonly page?: number | null;
  readonly printedPage?: number | null;
  readonly content?: string | null;
}

export interface SelfCheckFailure {
  readonly kind: "citation" | "action_plan" | "employee";
  readonly detail: string;
}

export function selfCheck(input: {
  readonly answer: string;
  readonly chunks: readonly CheckChunk[];
  readonly roster: readonly RosterEmployee[];
}): SelfCheckFailure[] {
  return [
    ...citationFailures(input.answer, input.chunks),
    ...actionPlanFailures(input.answer),
    ...employeeFailures(input.answer, input.roster),
  ];
}

/** One repair is kept only when the repaired answer passes. Otherwise the original stands. */
export function chooseCheckedAnswer(
  original: string,
  repaired: string | null,
  repairedFailures: readonly SelfCheckFailure[],
): string {
  if (!repaired || repaired.trim() === "") return original;
  return repairedFailures.length === 0 ? repaired : original;
}

export function citationsInAnswer(answer: string): { heading: string; page: number | null }[] {
  const found: { heading: string; page: number | null }[] = [];
  for (const match of answer.matchAll(/, JBA Policy Manual(?: p\.(\d+))?/g)) {
    const before = answer.slice(Math.max(0, (match.index ?? 0) - 80), match.index ?? 0);
    const heading = longestTitle(before);
    if (heading) found.push({ heading, page: match[1] ? Number(match[1]) : null });
  }
  for (const match of answer.matchAll(/JBA Policy Manual\s+[—–-]\s+([^,\n]+?),\s+p\.\s*(\d+)/g)) {
    found.push({ heading: match[1]!.trim(), page: Number(match[2]) });
  }
  return found;
}

function citationFailures(answer: string, chunks: readonly CheckChunk[]): SelfCheckFailure[] {
  const failures: SelfCheckFailure[] = [];
  for (const match of answer.matchAll(/, JBA Policy Manual(?: p\.(\d+))?/g)) {
    const before = answer.slice(Math.max(0, (match.index ?? 0) - 80), match.index ?? 0);
    const page = match[1] ? Number(match[1]) : null;
    const candidates = titleCandidates(before);
    if (candidates.length === 0) continue;
    const grounded = candidates.some((heading) => citationIsInChunks({ heading, page }, chunks));
    if (!grounded) {
      failures.push({
        kind: "citation",
        detail: `${candidates[0]}${page ? ` p.${page}` : ""} is not in the retrieved JBA sections`,
      });
    }
  }
  for (const match of answer.matchAll(/JBA Policy Manual\s+[—–-]\s+([^,\n]+?),\s+p\.\s*(\d+)/g)) {
    const citation = { heading: match[1]!.trim(), page: Number(match[2]) };
    if (!citationIsInChunks(citation, chunks)) {
      failures.push({
        kind: "citation",
        detail: `${citation.heading} p.${citation.page} is not in the retrieved JBA sections`,
      });
    }
  }
  return failures;
}

function titleCandidates(before: string): string[] {
  const words = trailingCapitalWords(before);
  const candidates: string[] = [];
  for (let start = 0; start < words.length; start += 1) {
    const heading = stripPolicySuffix(words.slice(start).join(" "));
    if (heading) candidates.push(heading);
  }
  return candidates;
}

function longestTitle(before: string): string | null {
  return titleCandidates(before)[0] ?? null;
}

function trailingCapitalWords(before: string): string[] {
  const words = before.replace(/\*+/g, " ").trim().split(/\s+/).filter(Boolean);
  const title: string[] = [];
  for (let index = words.length - 1; index >= 0; index -= 1) {
    const word = words[index]!.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9/&'’-]+$/g, "");
    if (!word || !/^[A-Z0-9]/.test(word)) break;
    title.unshift(word);
  }
  return title;
}

function citationIsInChunks(
  citation: { heading: string; page: number | null },
  chunks: readonly CheckChunk[],
): boolean {
  const key = headingKey(stripPolicySuffix(citation.heading));
  if (!key) return false;
  return chunks.some((chunk) => {
    const printedOnly = printedPageOnlyEnabled();
    const pages = (printedOnly ? [chunk.printedPage] : [chunk.page, chunk.printedPage]).filter(
      (page): page is number => typeof page === "number" && page > 0,
    );
    if (citation.page !== null && (printedOnly || pages.length > 0) && !pages.includes(citation.page)) return false;
    const section = chunk.section ? headingKey(stripPolicySuffix(chunk.section)) : "";
    if (section === key) return true;
    const content = (chunk.content ?? "").toLowerCase();
    const named = stripPolicySuffix(citation.heading).toLowerCase();
    return named.length > 0 && content.includes(named);
  });
}

function actionPlanFailures(answer: string): SelfCheckFailure[] {
  const plan = actionPlanText(answer);
  if (!plan) return [];
  const count = actionPlanSentenceCount(plan);
  if (count === 2) return [];
  return [{ kind: "action_plan", detail: `The action plan is ${count} sentence${count === 1 ? "" : "s"}; it must be two.` }];
}

function actionPlanText(answer: string): string | null {
  const labeled = /(?:^|\n)\s*(?:\*\*)?action plan(?:\*\*)?:\s*([\s\S]+?)(?:\n\s*\n|$)/i.exec(answer);
  if (labeled) return labeled[1]!.trim() || null;
  const start = answer.search(/Management will review\b/);
  if (start < 0) return null;
  const rest = answer.slice(start);
  const end = rest.search(/\n\s*\n/);
  const block = (end === -1 ? rest : rest.slice(0, end)).trim();
  return block || null;
}

function employeeFailures(answer: string, roster: readonly RosterEmployee[]): SelfCheckFailure[] {
  if (roster.length === 0) return [];
  const names = [...new Set(readEmployeeMentions(answer).names.map((name) => name.trim()).filter(Boolean))];
  const failures: SelfCheckFailure[] = [];
  for (const name of names) {
    const match = matchEmployeeName(name, roster);
    if (match.kind === "none") {
      failures.push({ kind: "employee", detail: `${name} is not in the Woven roster` });
    }
  }
  return failures;
}

function stripPolicySuffix(heading: string): string {
  return heading.replace(/\*+/g, "").replace(/\s+policy$/i, "").trim();
}
