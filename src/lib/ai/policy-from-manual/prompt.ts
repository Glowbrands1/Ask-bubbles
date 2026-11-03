import type { RetrievedChunk } from "./chunks";

/**
 * The policy pick's prompt (POLICY_CITATION_CHECK_ENABLED): the approved
 * Step A system text (STEP_A_PROPOSAL section 3), with "or picked a number
 * from the choices offered" added as in design v2. The manual follows it in
 * the system message, one `<chunk id="…" headings="Heading (p.N); …">…</chunk>`
 * per retrieved chunk. Nothing imports this module yet.
 */

export const POLICY_PICK_SYSTEM_PROMPT = [
  "You choose the one section of the company policy manual that an HR form's incident falls under. Use only the manual below.",
  "section_title: copy one heading exactly as listed for the chunk you choose. Never invent or reword a heading.",
  "page: the p.N listed with that heading.",
  "chunk_id: the id of the chunk your quote is copied from.",
  "quote: one or two consecutive sentences from that chunk, character for character, stating the rule the employee broke; at least 8 words; no paraphrase, no cuts, no joining of two places.",
  "If the manager named or chose a section, or picked a number from the choices offered, choose it when the manual has it. If a policy is already on the card, keep it unless the manager's later words describe a different incident or reject it. Prefer the most specific section that describes the incident over a general one, unless the manager named the general one.",
  "confidence: 0 to 1. alternatives: up to 3 other sections that could apply, most likely first, copied the same way; empty if none.",
  "asks_about_policy: true only when the manager's latest message asks which policy applies, what policy was violated, or what to write in a policy field of the form.",
].join("\n");

function attribute(value: string): string {
  let out = "";
  for (const char of value) {
    if (char === "&") out += "&amp;";
    else if (char === '"') out += "&quot;";
    else if (char === "<") out += "&lt;";
    else out += char;
  }
  return out;
}

/** The manual block that follows the system text: each retrieved chunk with its id and headings. */
export function renderManualForPick(chunks: readonly RetrievedChunk[]): string {
  return chunks
    .map((chunk) => {
      const headings = chunk.headings
        .map((heading) => {
          const page = chunk.source.sections?.find((entry) => entry.heading.trim() === heading)?.page ?? chunk.page;
          return page !== null ? `${heading} (p.${page})` : heading;
        })
        .join("; ");
      return `<chunk id="${attribute(chunk.id)}" headings="${attribute(headings)}">\n${chunk.text}\n</chunk>`;
    })
    .join("\n");
}

export interface PolicyPickInput {
  readonly templateName: string;
  readonly todayIso: string;
  /** The `**Policy:**` line on the card now, if any. */
  readonly cardLine: string | null;
  /** The manager's words for this form, oldest first. */
  readonly managerTurns: readonly string[];
}

export function buildPolicyPickUserMessage(input: PolicyPickInput): string {
  return [
    `Form: ${input.templateName}`,
    `Today: ${input.todayIso}`,
    `Policy on the card now: ${input.cardLine && input.cardLine.trim() !== "" ? input.cardLine.trim() : "none"}`,
    "",
    "Manager's words for this form, oldest first:",
    ...input.managerTurns.map((turn) => `Manager: ${turn}`),
  ].join("\n");
}
