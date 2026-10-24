/**
 * Corrective-action retrieval: the current JBA Policy Manual, and the
 * section a plain-language cue names.
 *
 * Vector search ranks the Performance Framework above Standards of Conduct
 * for "insubordination / did not acknowledge". This reorder runs only when
 * CA_POLICY_RETRIEVAL_ENABLED is on. It does not drop a framework chunk and
 * it does not call the embedder.
 */

export const CA_POLICY_TOPK_MULTIPLIER = 3;

const JBA_MANUAL = /jba policy manual/i;
const PERFORMANCE_FRAMEWORK = /performance framework/i;

const CA_QUESTION = /\b(?:ca|caf|corrective actions?|write[- ]?ups?)\b/i;

/**
 * Cue → the JBA section heading. Late Opening is listed before Attendance
 * so "opened late" is not read as tardiness.
 */
export const CA_POLICY_SYNONYMS: readonly { readonly cues: readonly string[]; readonly section: string }[] = [
  {
    cues: [
      "policy acknowledgements",
      "policy acknowledgments",
      "insubordination",
      "acknowledgment",
      "acknowledgement",
      "acknowledgements",
      "acknowledgments",
      "acknowledge",
      "acknowledged",
      "refusal",
      "refused",
    ],
    section: "Standards of Conduct",
  },
  {
    cues: ["uniform", "slippers", "shoes"],
    section: "Dress Code for The Company",
  },
  {
    cues: [
      "store opened late",
      "opened late",
      "opening the store late",
      "late opening",
      "opening late",
      "opening store late",
    ],
    section: "Late Opening",
  },
  {
    cues: ["tardy", "tardiness"],
    section: "Attendance",
  },
];

export function isJbaPolicyManual(title: string): boolean {
  return JBA_MANUAL.test(title);
}

export function caPolicyTargetSection(query: string): string | null {
  const text = query.toLowerCase();
  for (const row of CA_POLICY_SYNONYMS) {
    if (row.cues.some((cue) => hasCue(text, cue))) return row.section;
  }
  return null;
}

function hasCue(text: string, cue: string): boolean {
  const escaped = cue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\b)${escaped}\\b`, "i").test(text);
}

function sectionIs(section: string | null, target: string): boolean {
  if (!section) return false;
  const heading = section.trim().toLowerCase();
  const wanted = target.toLowerCase();
  return heading === wanted || heading.startsWith(`${wanted} `) || heading.startsWith(`${wanted}:`);
}

export interface CaPolicyChunk {
  readonly document_title: string;
  readonly section: string | null;
}

/**
 * How many rows to ask the index for. Off, the caller's limit is unchanged.
 * On, a wider window is fetched so a section sitting just outside the top
 * 14 can be moved up, then cut back to `limit`.
 */
export function caPolicyMatchCount(limit: number, enabled: boolean): number {
  const size = Math.max(1, limit);
  return enabled ? size * CA_POLICY_TOPK_MULTIPLIER : size;
}

/**
 * Stable reorder. A synonym's JBA section leads. Other JBA Policy Manual
 * chunks outrank the Performance Framework. Everything else keeps its order.
 * A question with no cue and no corrective-action wording is returned as it
 * arrived, cut to `limit`.
 */
export function rerankCaPolicyChunks<T extends CaPolicyChunk>(
  rows: readonly T[],
  query: string,
  limit: number,
): T[] {
  const capped = Math.max(1, limit);
  const target = caPolicyTargetSection(query);
  const policyQuestion = target !== null || CA_QUESTION.test(query);
  if (!policyQuestion) return rows.slice(0, capped);

  const ranked = rows.map((row, index) => {
    const manual = isJbaPolicyManual(row.document_title);
    const framework = PERFORMANCE_FRAMEWORK.test(row.document_title);
    let boost = 0;
    if (manual && target && sectionIs(row.section, target)) boost += 100;
    if (manual) boost += 10;
    if (framework) boost -= 1;
    return { row, index, boost };
  });
  ranked.sort((left, right) => right.boost - left.boost || left.index - right.index);
  return ranked.slice(0, capped).map((item) => item.row);
}
