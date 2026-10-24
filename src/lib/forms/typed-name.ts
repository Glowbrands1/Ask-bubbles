import { isPolicySourceSpan } from "@/lib/ai/employee-candidate-grounding";
import { manualDisplayTitle, OFFICIAL_POLICY_MANUAL } from "@/lib/forms/official-policy-manual";
import { COMPANY_LOCATIONS } from "@/lib/locations";

/**
 * A typed name stays a name. A state abbreviation from this company's
 * stores, and a span of the JBA manual's own title, are not people.
 *
 * Used only when TYPED_NAME_ENABLED is on. The caller decides that.
 */

export type TypedNameResolution =
  | { kind: "resolved"; employeeName: string }
  | { kind: "missing" }
  | { kind: "ambiguous"; candidates: string[] };

const STATE_CODES = new Set(
  COMPANY_LOCATIONS.map((location) => location.state?.toUpperCase()).filter((state): state is string => Boolean(state)),
);

function policyTitles(): string[] {
  return [
    ...new Set(OFFICIAL_POLICY_MANUAL.fallbackTitles.flatMap((title) => [title, manualDisplayTitle(title)])),
  ];
}

/** A candidate that is a store's state code, or the policy manual's title. */
export function isNotAPersonCandidate(candidate: string): boolean {
  const trimmed = candidate.trim().replace(/[.,]+$/g, "");
  if (/^[A-Za-z]{2}$/.test(trimmed) && STATE_CODES.has(trimmed.toUpperCase())) return true;
  return isPolicySourceSpan(trimmed, policyTitles());
}

/**
 * One remaining person is that person. Two real names stay a question.
 * Dropping every candidate leaves the original list, so nothing is invented.
 */
export function keepTypedPerson(resolution: TypedNameResolution): TypedNameResolution {
  if (resolution.kind !== "ambiguous") return resolution;
  const kept = resolution.candidates.filter((candidate) => !isNotAPersonCandidate(candidate));
  if (kept.length === 1) return { kind: "resolved", employeeName: kept[0]! };
  if (kept.length > 1 && kept.length !== resolution.candidates.length) {
    return { kind: "ambiguous", candidates: kept };
  }
  return resolution;
}
