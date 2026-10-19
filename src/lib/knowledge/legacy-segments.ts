/**
 * ============================================================================
 * SEGMENT CLASSIFIER — SHADOW MODE ONLY
 * ============================================================================
 *
 * The Performance Management Framework is a legacy Sun Tan City document that
 * was adopted verbatim. Most of it teaches HOW to coach, document and escalate
 * (methodology). Some sentences assert a Sun Tan City FACT — an employer name,
 * a role code, a sales metric, a tool, a service line — that is not Buff City
 * Soap policy.
 *
 * This module only LABELS sentences. Nothing in the drafting path reads the
 * labels: they feed a diagnostic and the golden file Buff HR and Operations
 * review. No label here is business-approved.
 *
 * Three labels, deliberately conservative:
 *   methodology      teaches how, asserts no legacy fact
 *   legacy_specific  asserts a legacy fact
 *   ambiguous        mixes both, or uses a word that may be legacy wording
 *                    rather than a legacy fact — held for a human decision
 *
 * "client" is NOT a legacy concept here: it is a terminology question handled
 * by the guest-terminology work, not an assertion about Sun Tan City.
 */

export type SegmentLabel = "methodology" | "legacy_specific" | "ambiguous";

export type LegacyConcept =
  | "stc_org"
  | "stc_role_codes"
  | "stc_titles"
  | "stc_sales_metrics"
  | "stc_tools"
  | "stc_services"
  | "stc_terminology";

export interface ConceptPattern {
  readonly concept: LegacyConcept;
  /** Strong concepts assert a fact; weak ones may be wording only. */
  readonly strength: "strong" | "weak";
  readonly pattern: RegExp;
}

/** Contextual patterns, not bare keywords. DMIT is Buff-confirmed and absent. */
export const LEGACY_CONCEPTS: readonly ConceptPattern[] = [
  { concept: "stc_org", strength: "strong", pattern: /\bSun Tan City\b/ },
  { concept: "stc_role_codes", strength: "strong", pattern: /\b(?:SDIT|TSD|ASD|FTTC)\b/ },
  { concept: "stc_titles", strength: "strong", pattern: /\bSalon (?:Directors?|Managers?|Leaders?)\b/ },
  {
    concept: "stc_sales_metrics",
    strength: "strong",
    pattern: /\b(?:PPTA|LPSVA|UPTA|OTC|ASTC)\b|\bClub Close\b|\bSpa %/,
  },
  {
    concept: "stc_tools",
    strength: "strong",
    pattern: /\b(?:Bonus Viewer|Comp Report|Routine Mat)\b/,
  },
  {
    concept: "stc_services",
    strength: "strong",
    pattern: /\b(?:tanning|sunless|spray tan|UV bed)s?\b/i,
  },
  { concept: "stc_terminology", strength: "weak", pattern: /\bsalons?\b/i },
];

/** Verbs that mark a sentence as teaching method — used to spot mixed sentences. */
const METHOD_CUE =
  /\b(?:should|must|never|always|document|coach(?:ing)?|escalat\w*|follow(?:-| )?up|expectation|observe|verify|confirm)\b/i;

export interface Segment {
  readonly index: number;
  readonly label: SegmentLabel;
  readonly concepts: readonly LegacyConcept[];
  /** Verbatim text. Held in memory and in the review fixture, never logged. */
  readonly text: string;
}

/** Splits on sentence ends and on list/line breaks, keeping text verbatim. */
export function splitSegments(content: string): string[] {
  return content
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function classifySegment(text: string): {
  label: SegmentLabel;
  concepts: LegacyConcept[];
} {
  const hits = LEGACY_CONCEPTS.filter((entry) => entry.pattern.test(text));
  if (hits.length === 0) return { label: "methodology", concepts: [] };
  const concepts = hits.map((entry) => entry.concept);
  const strong = hits.some((entry) => entry.strength === "strong");
  if (!strong) return { label: "ambiguous", concepts };
  return { label: METHOD_CUE.test(text) ? "ambiguous" : "legacy_specific", concepts };
}

export function classifySegments(content: string): Segment[] {
  return splitSegments(content).map((text, index) => ({
    index,
    text,
    ...classifySegment(text),
  }));
}
