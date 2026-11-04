/**
 * ============================================================================
 * APPROVED REMOVALS — questions the business has explicitly approved removing
 * ============================================================================
 *
 * The parity and QA tests compare each migrated template with the Ask Sunny
 * published snapshot BLOCK BY BLOCK (paths carry block indexes). Removing a
 * question shifts every later index, so a removal cannot be expressed as one
 * approved difference. This list is the narrow way in: one entry per approved
 * removal, naming the template, the exact field key and the exact label that
 * must be present in the snapshot. The tests delete exactly that block from the
 * SNAPSHOT before comparing, and assert that
 *   - the block really exists in the snapshot with that label,
 *   - it is absent from the Buff City Soap template,
 *   - every other block, in the same order, is still compared as before.
 * Nothing else is exempt, and the Ask Sunny snapshot file itself is never edited.
 */
export interface ApprovedRemoval {
  /** The Ask Bubbles template key. */
  readonly templateKey: string;
  /** The key of the field block that was removed. */
  readonly fieldKey: string;
  /** The label as the Ask Sunny snapshot has it (exact). */
  readonly snapshotLabel: string;
  readonly decision: string;
}

export const APPROVED_REMOVALS: readonly ApprovedRemoval[] = [
  {
    templateKey: "prescreen-phone-interview",
    fieldKey: "uniform_services",
    snapshotLabel:
      "Are you willing to use our services as part of your Sun Tan City uniform? (Must agree to UV, Sunless and Spa usage to proceed with employment)",
    decision: "D14, Option A — Phase 2B (approved 2026-10-19): remove the Sun Tan City product-use/uniform question",
  },
  {
    templateKey: "dpoa",
    fieldKey: "other_offense",
    snapshotLabel: "Other",
    decision: "Corrective Action revision 7 (client request, template approved 4 Nov 2026): Other is a box in Type of Offense; its write-in line is removed",
  },
];

/**
 * THE APPROVED CHECKBOX-OPTION CHANGES, applied to the snapshot the same way
 * as a removal: the group's options are replaced by exactly these, and every
 * other part of the document is still compared. Corrective Action revision 7
 * (client request, template approved 4 Nov 2026).
 */
export const APPROVED_OPTION_CHANGES: readonly {
  readonly templateKey: string;
  readonly groupKey: string;
  readonly before: readonly { key: string; label: string }[];
  readonly after: readonly { key: string; label: string }[];
  readonly decision: string;
}[] = [
  {
    templateKey: "dpoa",
    groupKey: "offense_type",
    before: [
      { key: "tardiness", label: "Tardiness/Leaving Early" },
      { key: "absenteeism", label: "Absenteeism" },
      { key: "standards_of_conduct", label: "Standards of Conduct" },
      { key: "under_performance", label: "Under Performance" },
      { key: "dress_code", label: "Dress Code Violation" },
      { key: "company_policies", label: "Violation of Company Policies" },
    ],
    after: [
      { key: "attendance_policy", label: "Attendance Policy" },
      { key: "standards_of_conduct", label: "Standards of Conduct" },
      { key: "dress_code", label: "Dress Code Violation" },
      { key: "other", label: "Other" },
    ],
    decision: "Corrective Action revision 7: Attendance Policy added; Tardiness/Leaving Early, Absenteeism, Under Performance and Violation of Company Policies removed; Other is a box",
  },
];

interface DocumentLike {
  blocks?: { kind?: string; field?: { key?: string; label?: string } }[];
  [key: string]: unknown;
}

/** The snapshot document with the approved removals for this template applied (a copy). */
export function withApprovedRemovals<T>(templateKey: string, document: T): T {
  const removals = APPROVED_REMOVALS.filter((entry) => entry.templateKey === templateKey);
  const optionChanges = APPROVED_OPTION_CHANGES.filter((entry) => entry.templateKey === templateKey);
  if (removals.length === 0 && optionChanges.length === 0) return document;
  const copy = JSON.parse(JSON.stringify(document)) as DocumentLike;
  copy.blocks = (copy.blocks ?? []).filter(
    (block) => !(block.kind === "field" && removals.some((entry) => entry.fieldKey === block.field?.key)),
  );
  for (const change of optionChanges) {
    const group = (copy.blocks as { kind?: string; key?: string; options?: unknown }[]).find(
      (block) => block.kind === "checkbox_group" && block.key === change.groupKey,
    );
    // Only where the snapshot holds exactly the options the change was approved against.
    if (group && JSON.stringify(group.options) === JSON.stringify(change.before)) group.options = change.after.map((option) => ({ ...option }));
  }
  return copy as T;
}

/** A reference PDF's text with each approved option change applied: the old labels, in order, become the new ones. */
export function withApprovedOptionText(templateKey: string, text: string): string {
  return APPROVED_OPTION_CHANGES.filter((entry) => entry.templateKey === templateKey).reduce(
    (current, change) =>
      current.split(change.before.map((option) => option.label).join(" ")).join(change.after.map((option) => option.label).join(" ")),
    text,
  );
}

/** The sample line a reference PDF printed for a removed field ("Sample uniform services"). */
export function removedFieldReferenceText(templateKey: string, labelFor: (label: string) => string): string[] {
  return APPROVED_REMOVALS.filter((entry) => entry.templateKey === templateKey).map(
    (entry) => `${labelFor(entry.snapshotLabel)} Sample ${entry.fieldKey.replace(/_/g, " ")}`,
  );
}

/**
 * The one description change that accompanies the removal: "uniform agreement"
 * leaves the prescreen's description. An exact pair, accepted by the parity test
 * and nothing else.
 */
export const APPROVED_REMOVAL_DESCRIPTION_CHANGES: readonly { templateKey: string; from: string; to: string }[] = [
  {
    templateKey: "prescreen-phone-interview",
    from: "The prescreening call, before anyone is booked for an interview. Age, interest, uniform agreement, experience and availability, signed off by the interviewer.",
    to: "The prescreening call, before anyone is booked for an interview. Age, interest, experience and availability, signed off by the interviewer.",
  },
];
