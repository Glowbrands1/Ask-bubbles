import { COMPANY_METRIC_PHRASES } from "@/config/company/metric-words";
import { salesShortfallObjectEnabled } from "@/lib/config/chat-quality-flags";

/**
 * ============================================================================
 * A SALES OR PERFORMANCE SHORTFALL THE MANAGER STATED
 * ============================================================================
 *
 * A metric named AND a judgement of it — "their Club Close is low", "his sales
 * are low". Read by `correctiveActionBasis` (corrective-action-intake.ts),
 * where it is the progression's metric-only case, and by
 * CA_SALES_POLICY_ENABLED's reading (`ca-policy.ts`), which cites the
 * Standards of Conduct for it. "The sales floor" names no shortfall.
 *
 * A leaf module, so both readers can use it without importing each other.
 * The two lists moved here unchanged from corrective-action-intake.ts.
 */

const METRIC_NAMED: readonly RegExp[] = [
  /\bclub close\b/,
  /\b(?:close|closing) rate\b/,
  /\bconversion(?:s| rate)?\b/,
  /\bupgrade(?:s| rate|%| percentage)?\b/,
  /\befts?\b/,
  /\bmembership (?:%|percentage|rate|sales)\b/,
  /\bsales per hour\b/,
  /\b(?:sph|atv|kpis?)\b/,
  /\baverage ticket\b/,
  /\bred (?:%|percentage)\b/,
  /\b(?:her|his|their|the) (?:numbers|stats|metrics|scorecard|percentages)\b/,
  /\bdaily stats\b/,
  /\b(?:sales|revenue|units|packages) (?:are|is|have been|has been)\b/,
];

const METRIC_JUDGED: readonly RegExp[] = [
  /\b(?:low|lowest|down|below|behind|weak|weakest|poor|under|dropping|declining|slipping|worst|bottom|last)\b/,
  /\b(?:not hitting|missing|misses|failing to hit|under target|off target|below target|not meeting)\b/,
  /\bneeds? (?:to )?improve\b/,
];

/**
 * SALES_SHORTFALL_OBJECT_ENABLED: "sales" governed by a shortfall verb — the
 * judged list's own verbs ("not meeting", "missing", "misses", "not hitting",
 * "failing to hit"), or "below" directly before it — is a named metric: "not
 * meeting sales requirements", "not meeting her sales goals", "below sales
 * expectations". Only determiners or possessives may stand between, so a
 * preposition breaks it: "missing from the sales floor" is absence, and "below
 * the sales counter" a place. No new words: "sales" and the verbs are the
 * lists' own.
 */
const DETERMINER = String.raw`(?:the|a|an|her|his|their|its|my|our|your|this|that|these|those|[a-z]+'s)`;
const SALES_GOVERNED = new RegExp(
  String.raw`\b(?:not meeting|missing|misses|not hitting|failing to hit)\s+(?:${DETERMINER}\s+){0,3}sales\b|\bbelow\s+sales\b`,
);

/** The same reading `correctiveActionBasis` makes: lower case, runs of spaces as one. */
function normalize(text: string): string {
  return (text ?? "").toLowerCase().replace(/[^\S\n]+/g, " ");
}

/** Whether the manager stated a shortfall: a metric named and judged. */
export function statesMetricShortfall(text: string): boolean {
  const normalized = normalize(text);
  if (salesShortfallObjectEnabled() && SALES_GOVERNED.test(normalized.replace(/[‘’]/g, "'"))) return true;
  return METRIC_NAMED.some((pattern) => pattern.test(normalized)) && METRIC_JUDGED.some((pattern) => pattern.test(normalized));
}

/*
 * COMPANY_METRICS_SHORTFALL_ENABLED (QA's ruling (a) on CA_NO_POLICY_ASKS_WHICH, 13 Nov 2026): "She was below goal in
 * IPT, AOV and Comp Sales % for October" and "… below in IPT, AOV, and Discount Rate" made Corrective Action cards with
 * no Policy line: this company's own KPIs were not among the metrics named above. The company's metric phrases
 * (`config/company/metric-words.ts`, the same list COMPANY_METRIC_WORDS_NOT_NAMES reads), with a judgement of them, are a
 * stated shortfall. The bare "comp" is left out: alone it is too many other words. Read only by the card's policy reader.
 */
const COMPANY_METRIC_NAMED = new RegExp(
  String.raw`(?:^|[^a-z0-9])(?:${COMPANY_METRIC_PHRASES.filter((phrase) => phrase.toLowerCase() !== "comp")
    .map((phrase) => phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"))
    .join("|")})(?![a-z0-9])`,
);

/** A company metric (IPT, AOV, Comp Sales %, Discount Rate …) named and judged. */
export function statesCompanyMetricShortfall(text: string): boolean {
  const normalized = normalize(text);
  return COMPANY_METRIC_NAMED.test(normalized) && METRIC_JUDGED.some((pattern) => pattern.test(normalized));
}
