/**
 * ============================================================================
 * GROUNDING SHADOW DIAGNOSTIC
 * ============================================================================
 *
 * Reports what a source-aware prompt WOULD withhold from the pinned Framework.
 * It changes nothing: the model receives the unchanged prompt, no draft field
 * is filtered, and nothing is written to the knowledge base or the database.
 *
 * PRIVACY. The report holds counts, row locators (the document's own headings),
 * group ids and concept names. It never holds segment text, form values, the
 * manager's words, an employee name or a draft — and neither does the log line.
 */

import { originForRole, PROVENANCE_REGISTRY_VERSION, type KnowledgeOrigin } from "@/config/company/provenance";
import { headingKey, type KnowledgeDocumentRole } from "@/lib/knowledge/document-roles";
import {
  classifySegments,
  type LegacyConcept,
  type SegmentLabel,
} from "@/lib/knowledge/legacy-segments";
import { groundingMode, type GroundingMode } from "./grounding-mode";

export interface ShadowRow {
  readonly locator: string;
  readonly content: string;
}

export interface ShadowReport {
  readonly registryVersion: number;
  readonly origin: KnowledgeOrigin | null;
  readonly rowCount: number;
  readonly segmentCount: number;
  readonly labels: Readonly<Record<SegmentLabel, number>>;
  readonly concepts: Readonly<Partial<Record<LegacyConcept, number>>>;
  /** Segments an enforcing build would keep out of the prompt. */
  readonly wouldWithhold: number;
  /** Required groups whose every segment would be withheld — would fail closed. */
  readonly legacyOnlyGroups: readonly string[];
}

export function analyzeGroundingShadow(
  rows: readonly ShadowRow[],
  role: KnowledgeDocumentRole,
): ShadowReport {
  const groupOf = new Map<string, string>();
  for (const group of role.ruleGroups) {
    for (const heading of group.headings) groupOf.set(headingKey(heading), group.id);
  }

  const labels: Record<SegmentLabel, number> = { methodology: 0, legacy_specific: 0, ambiguous: 0 };
  const concepts: Partial<Record<LegacyConcept, number>> = {};
  const keptByGroup = new Map<string, number>();
  const seenGroups = new Set<string>();
  let segmentCount = 0;

  for (const row of rows) {
    const groupId = groupOf.get(headingKey(row.locator));
    if (groupId) seenGroups.add(groupId);
    for (const segment of classifySegments(row.content)) {
      segmentCount += 1;
      labels[segment.label] += 1;
      for (const concept of segment.concepts) concepts[concept] = (concepts[concept] ?? 0) + 1;
      if (groupId && segment.label === "methodology") {
        keptByGroup.set(groupId, (keptByGroup.get(groupId) ?? 0) + 1);
      }
    }
  }

  return {
    registryVersion: PROVENANCE_REGISTRY_VERSION,
    origin: originForRole(role.id),
    rowCount: rows.length,
    segmentCount,
    labels,
    concepts,
    wouldWithhold: labels.legacy_specific + labels.ambiguous,
    legacyOnlyGroups: [...seenGroups].filter((id) => !keptByGroup.get(id)),
  };
}

/**
 * Runs the diagnostic when the mode asks for it. NEVER THROWS and never alters
 * its input: a failure here must not reach a manager's draft.
 */
export function runGroundingShadow(input: {
  templateKey: string;
  rows: readonly ShadowRow[];
  role: KnowledgeDocumentRole;
  mode?: GroundingMode;
  log?: (line: string) => void;
}): ShadowReport | null {
  try {
    if ((input.mode ?? groundingMode()) !== "shadow") return null;
    const report = analyzeGroundingShadow(input.rows, input.role);
    (input.log ?? console.info)(
      JSON.stringify({
        event: "forms.grounding.shadow",
        level: "info",
        mode: "shadow",
        templateKey: input.templateKey,
        role: input.role.id,
        ...report,
      }),
    );
    return report;
  } catch {
    return null;
  }
}
