import { callPolicyPickModel } from "./call";
import type { RetrievedChunk } from "./chunks";
import { buildPolicyPickUserMessage, POLICY_PICK_SYSTEM_PROMPT, renderManualForPick, type PolicyPickInput } from "./prompt";
import { PolicyPick, policyPickJsonSchema } from "./schema";
import { normaliseCitationText, verifyLabel, verifyQuote, type LabelRefusal, type QuoteRefusal } from "./verify";

/**
 * ============================================================================
 * ONE POLICY, PICKED BY THE MODEL AND CHECKED BY CODE (POLICY_CITATION_CHECK_ENABLED)
 * ============================================================================
 *
 * call → parse (zod) → verifyQuote / verifyLabel → one of:
 *
 *   resolved     the pick's quote is a verbatim sentence of a retrieved chunk
 *                inside its section, its heading was retrieved, and the page
 *                is the manual's own; confidence at least 0.6.
 *   choose       the pick failed, but 1–3 sections pass the label check (the
 *                pick's own heading when only its quote failed, then the
 *                model's alternatives): the manager is asked which applies.
 *   unavailable  nothing passes, or the call timed out, failed, or returned
 *                an object the schema refuses. The old path runs.
 *
 * An unverified quote is never returned. Nothing imports this module yet.
 */

export const MIN_CONFIDENCE = 0.6;
export const MAX_CHOICES = 3;

export interface PolicyChoice {
  readonly heading: string;
  readonly page: number;
}

export type PickRefusal = QuoteRefusal | LabelRefusal | "quote_outside_section" | "low_confidence";

export type PolicyResolution =
  | {
      readonly status: "resolved";
      readonly heading: string;
      readonly page: number;
      readonly quote: string;
      readonly chunkId: string;
      readonly asksAboutPolicy: boolean;
    }
  | {
      readonly status: "choose";
      readonly options: readonly PolicyChoice[];
      readonly reason: PickRefusal;
      readonly asksAboutPolicy: boolean;
    }
  | {
      readonly status: "unavailable";
      readonly reason: PickRefusal | "timeout" | "error" | "invalid" | "no_manual";
      readonly asksAboutPolicy: boolean;
    };

export interface ResolvePolicyInput extends PolicyPickInput {
  readonly chunks: readonly RetrievedChunk[];
}

/**
 * The headings in force in a chunk: its own, and the last heading printed
 * before it (a section's text runs on into the chunks that follow it).
 */
function headingsInForce(chunk: RetrievedChunk, chunks: readonly RetrievedChunk[]): string[] {
  const own = [...chunk.headings];
  const before = chunks.filter((candidate) => candidate.chunkIndex < chunk.chunkIndex && candidate.headings.length > 0);
  const carried = before.length > 0 ? before[before.length - 1]!.headings : [];
  const last = carried[carried.length - 1];
  return last ? [last, ...own] : own;
}

function inSection(heading: string, chunk: RetrievedChunk, chunks: readonly RetrievedChunk[]): boolean {
  const wanted = normaliseCitationText(heading);
  return headingsInForce(chunk, chunks).some((candidate) => normaliseCitationText(candidate) === wanted);
}

function choicesFrom(
  refs: readonly { readonly section_title: string; readonly page: number }[],
  chunks: readonly RetrievedChunk[],
): PolicyChoice[] {
  const choices: PolicyChoice[] = [];
  for (const ref of refs) {
    const label = verifyLabel({ heading: ref.section_title, page: ref.page }, chunks);
    if (label.action === "drop") continue;
    const key = normaliseCitationText(label.heading);
    if (choices.some((choice) => normaliseCitationText(choice.heading) === key)) continue;
    choices.push({ heading: label.heading, page: label.page });
    if (choices.length === MAX_CHOICES) break;
  }
  return choices;
}

export async function resolvePolicy(input: ResolvePolicyInput): Promise<PolicyResolution> {
  if (input.chunks.length === 0) return { status: "unavailable", reason: "no_manual", asksAboutPolicy: false };

  const called = await callPolicyPickModel({
    system: POLICY_PICK_SYSTEM_PROMPT,
    manual: renderManualForPick(input.chunks),
    prompt: buildPolicyPickUserMessage(input),
    schema: policyPickJsonSchema(),
  });
  if (!("ok" in called)) return { status: "unavailable", reason: called.fallback, asksAboutPolicy: false };

  const parsed = PolicyPick.safeParse(called.output);
  if (!parsed.success) return { status: "unavailable", reason: "invalid", asksAboutPolicy: false };
  const pick = parsed.data;
  const asksAboutPolicy = pick.asks_about_policy;

  const label = verifyLabel({ heading: pick.section_title, page: pick.page }, input.chunks);
  const quote = verifyQuote({ quote: pick.quote, chunkId: pick.chunk_id }, input.chunks);
  const confident = Number.isFinite(pick.confidence) && pick.confidence >= MIN_CONFIDENCE && pick.confidence <= 1;

  let reason: PickRefusal;
  if (label.action === "drop") reason = label.reason;
  else if (!quote.ok) reason = quote.reason;
  else if (!inSection(label.heading, quote.chunk, input.chunks)) reason = "quote_outside_section";
  else if (!confident) reason = "low_confidence";
  else {
    return {
      status: "resolved",
      heading: label.heading,
      page: label.page,
      quote: quote.quote,
      chunkId: quote.chunk.id,
      asksAboutPolicy,
    };
  }

  // The pick's own heading stays a choice when only its quote (or confidence) failed.
  const refs = [...(label.action === "drop" ? [] : [{ section_title: pick.section_title, page: pick.page }]), ...pick.alternatives];
  const options = choicesFrom(refs, input.chunks);
  if (options.length === 0) return { status: "unavailable", reason, asksAboutPolicy };
  return { status: "choose", options, reason, asksAboutPolicy };
}
