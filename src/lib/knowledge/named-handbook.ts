import type { MatchedChunkRow } from "./mappers";

/**
 * ============================================================================
 * A HANDBOOK THE QUESTION NAMES, READ BY IDENTITY RATHER THAN SIMILARITY
 * ============================================================================
 *
 * Ported from the reference platform's policy-manual coverage
 * (`policy-manual-coverage.ts` with the identity half of
 * `official-policy-manual.ts`), with the one company's manual names moved to
 * configuration (`NAMED_HANDBOOK` in `src/config/company/knowledge.ts`).
 *
 * WHY IT EXISTS. A dozen similarity slots cannot cover a hundred-chunk
 * handbook. "What policies are in the handbook?" retrieves one of the chunks
 * its table of contents spans, and naming the handbook pulls "what does the
 * attendance policy say" toward its title page instead of its Attendance
 * section. So a question that NAMES the handbook reads it by identity and pins
 * the part the question needs: the whole table of contents, or the sections
 * whose printed headings match.
 *
 * IT DEGRADES RATHER THAN REFUSING. The handbook is evidence, not a reasoning
 * contract: a lookup that fails leaves ordinary retrieval standing and adds no
 * note, so the prompt never claims a table of contents it was not given.
 */

export interface HandbookIdentity {
  /** A tag on the document that marks it, preferred over any name. */
  readonly tag: string;
  /** File-name prefixes that identify it when no document carries the tag. */
  readonly fallbackFilenames: readonly string[];
  /** Title prefixes, consulted only when no file name matched. */
  readonly fallbackTitles: readonly string[];
}

export interface NamedHandbookConfig {
  readonly identity: HandbookIdentity;
  /** A question names the handbook when EVERY one of these matches it. */
  readonly namedBy: readonly RegExp[];
  /** The company's own words that are never a topic ("bcs", the brand name). */
  readonly notATopic: readonly string[];
}

/* ------------------------------------------------------------ identity --- */

export interface HandbookCandidateDocument {
  readonly id: string;
  readonly title: string;
  readonly original_filename: string;
  readonly tags: readonly string[] | null;
  readonly source?: string | null;
}

export type HandbookResolution =
  | { readonly ok: true; readonly document: HandbookCandidateDocument; readonly matchedBy: "tag" | "fallback" }
  | { readonly ok: false; readonly problem: "not_found" | "ambiguous" };

function normalize(value: string): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Which document IS the handbook: the tag first, then a file name, then a
 * title. More than one candidate is ambiguous and resolves to nothing — never
 * to whichever came first — unless exactly one of them came from a synced
 * source (the synced copy is the system of record).
 */
export function resolveHandbook(
  documents: readonly HandbookCandidateDocument[],
  identity: HandbookIdentity,
): HandbookResolution {
  const tag = normalize(identity.tag);
  const tagged = documents.filter((document) => (document.tags ?? []).some((value) => normalize(value) === tag));
  if (tagged.length > 0) return settle(tagged, "tag");

  const byFilename = identity.fallbackFilenames.map(normalize).filter((prefix) => prefix !== "");
  const byTitle = identity.fallbackTitles.map(normalize).filter((prefix) => prefix !== "");
  const filenameMatches = documents.filter((document) =>
    byFilename.some((prefix) => normalize(document.original_filename).startsWith(prefix)),
  );
  if (filenameMatches.length > 0) return settle(filenameMatches, "fallback");
  const titleMatches = documents.filter((document) =>
    byTitle.some((prefix) => normalize(document.title).startsWith(prefix)),
  );
  if (titleMatches.length > 0) return settle(titleMatches, "fallback");

  return { ok: false, problem: "not_found" };
}

function settle(candidates: readonly HandbookCandidateDocument[], matchedBy: "tag" | "fallback"): HandbookResolution {
  if (candidates.length === 1) return { ok: true, document: candidates[0]!, matchedBy };
  const synced = candidates.filter((document) => (document.source ?? "upload") !== "upload");
  if (synced.length === 1) return { ok: true, document: synced[0]!, matchedBy };
  return { ok: false, problem: "ambiguous" };
}

const REVISION_WORD = /^(?:edited|revised|updated|revision|version|final|draft|rev|v)$/i;
const REVISION_NUMBER = /^v?\d[\d.\-_/]*$/i;

/** "Team Handbook Revised 2026" → "Team Handbook", for the note's heading. */
export function handbookDisplayTitle(documentTitle: string): string {
  const words = documentTitle.trim().split(/\s+/).filter(Boolean);
  while (
    words.length > 2 &&
    (REVISION_NUMBER.test(words[words.length - 1]!) || REVISION_WORD.test(words[words.length - 1]!))
  ) {
    words.pop();
  }
  return words.join(" ") || documentTitle.trim();
}

/* -------------------------------------------------------------- chunks --- */

export interface HandbookChunk {
  readonly chunkIndex: number;
  readonly chunkId: string;
  readonly locator: string;
  readonly page: number | null;
  readonly content: string;
  readonly section: string | null;
  /** Every section whose heading is printed inside this chunk, with its page. */
  readonly sections: readonly { readonly heading: string; readonly page: number }[] | null;
}

/**
 * A chunk that is the handbook's table of contents: headed so, or rows of dot
 * leaders. Several rows are required so a stray "......" does not qualify.
 */
export function isTableOfContents(content: string): boolean {
  if (/table of contents/i.test(content.slice(0, 400))) return true;
  return (content.match(/\.{4,}/g) ?? []).length >= 3;
}

/* ------------------------------------------------------------ coverage --- */

/** Whether the question names the configured handbook. */
export function namesHandbook(question: string, config: NamedHandbookConfig | null): boolean {
  if (!config || config.namedBy.length === 0) return false;
  return config.namedBy.every((pattern) => pattern.test(question));
}

const OVERVIEW_CUES: readonly RegExp[] = [
  /\b(?:overview|outline|table of contents|contents)\b/i,
  /\b(?:what|which)\s+(?:policies|topics|sections|subjects|chapters)\b/i,
  /\b(?:all|main|major|every|list)\s+(?:of\s+)?(?:the\s+|its\s+)?(?:policies|topics|sections|chapters)\b/i,
  /\bwhat(?:'s|\s+is)?\s+(?:in|inside|covered\s+in)\s+(?:the|our)\s+(?:\w+\s+){0,2}(?:handbook|manual)\b/i,
  /\bwhat\s+does\s+(?:the|our)\s+(?:\w+\s+){0,2}(?:handbook|manual)\b[^?]*\b(?:cover|include|contain)\b/i,
];

export function isHandbookOverviewQuestion(question: string): boolean {
  return OVERVIEW_CUES.some((cue) => cue.test(question));
}

const NOT_A_TOPIC = new Set([
  "a", "about", "all", "an", "and", "any", "are", "as", "at", "be", "can", "cite",
  "company", "could", "do", "does", "edited", "employee", "employment", "for",
  "from", "general", "give", "handbook", "have", "how", "i", "in", "is", "it",
  "its", "manual", "me", "my", "of", "on", "or", "our", "page", "please",
  "policies", "policy", "regulations", "rule", "rules", "say", "says", "section",
  "sections", "should", "team", "tell", "that", "the", "their", "there", "this",
  "to", "us", "we", "what", "whats", "when", "where", "which", "who", "with",
  "work", "would", "you", "your", "revised", "version",
]);

function topicWords(text: string, extra: ReadonlySet<string>): string[] {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !/^\d+$/.test(word))
    .map((word) =>
      word.endsWith("ies") && word.length > 4
        ? `${word.slice(0, -3)}y`
        : word.endsWith("s") && !word.endsWith("ss") && word.length > 3
          ? word.slice(0, -1)
          : word,
    )
    .filter((word) => !NOT_A_TOPIC.has(word) && !extra.has(word));
}

const MAX_SECTION_CHUNKS = 8;
const MAX_CONTINUATION_CHUNKS = 2;

export interface HandbookSectionRef {
  readonly heading: string;
  readonly page: number;
}

export type HandbookCoverage =
  | {
      readonly kind: "contents";
      readonly documentTitle: string;
      readonly rows: MatchedChunkRow[];
      /** True when the question named a topic no heading matched. */
      readonly unmatchedTopic: boolean;
    }
  | {
      readonly kind: "sections";
      readonly documentTitle: string;
      readonly rows: MatchedChunkRow[];
      readonly sections: readonly HandbookSectionRef[];
    };

function toRow(document: { id: string; title: string; category: string }, chunk: HandbookChunk): MatchedChunkRow {
  return {
    chunk_id: chunk.chunkId,
    document_id: document.id,
    document_title: document.title,
    category: document.category,
    locator: chunk.locator,
    page: chunk.page,
    section: chunk.section ?? null,
    content: chunk.content,
    similarity: 0,
  };
}

/**
 * The handbook rows this question needs: its table of contents for an
 * overview question, else the sections whose PRINTED HEADINGS match the
 * question's topic words — never its prose, which mentions every topic
 * somewhere. A topic no heading matches falls back to the contents, with a
 * flag the note uses to say so.
 */
export function selectHandbookCoverage(input: {
  readonly question: string;
  readonly documentId: string;
  readonly documentTitle: string;
  readonly documentCategory?: string;
  readonly chunks: readonly HandbookChunk[];
  readonly notATopic?: readonly string[];
}): HandbookCoverage | null {
  const document = { id: input.documentId, title: input.documentTitle, category: input.documentCategory ?? "other" };
  const extra = new Set((input.notATopic ?? []).map((word) => word.toLowerCase()));
  const ordered = [...input.chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
  const contents = ordered.filter((chunk) => isTableOfContents(chunk.content));

  const contentsCoverage = (unmatchedTopic: boolean): HandbookCoverage | null => {
    const rows = contents.map((chunk) => toRow(document, chunk));
    return rows.length > 0 ? { kind: "contents", documentTitle: document.title, rows, unmatchedTopic } : null;
  };

  if (isHandbookOverviewQuestion(input.question)) return contentsCoverage(false);

  const wanted = new Set(topicWords(input.question, extra));
  if (wanted.size === 0) return null;

  const picked: HandbookChunk[] = [];
  const sections: HandbookSectionRef[] = [];
  const pickedIndexes = new Set<number>();

  for (let position = 0; position < ordered.length; position += 1) {
    const chunk = ordered[position]!;
    if (isTableOfContents(chunk.content)) continue;
    const matched = (chunk.sections ?? []).filter((entry) =>
      topicWords(entry.heading, extra).some((word) => wanted.has(word)),
    );
    if (matched.length === 0) continue;

    for (const entry of matched) {
      if (!sections.some((seen) => seen.heading === entry.heading && seen.page === entry.page)) {
        sections.push({ heading: entry.heading, page: entry.page });
      }
    }

    /* The chunk that prints the heading, then any that only continue it. */
    const run = [chunk];
    for (let next = position + 1; next < ordered.length; next += 1) {
      const following = ordered[next]!;
      if (run.length > MAX_CONTINUATION_CHUNKS) break;
      if ((following.sections ?? []).length > 0) break;
      if (isTableOfContents(following.content)) break;
      run.push(following);
    }
    for (const member of run) {
      if (pickedIndexes.has(member.chunkIndex)) continue;
      pickedIndexes.add(member.chunkIndex);
      picked.push(member);
    }
  }

  if (picked.length === 0) return contentsCoverage(true);

  const rows = picked.slice(0, MAX_SECTION_CHUNKS).map((chunk) => toRow(document, chunk));
  return { kind: "sections", documentTitle: document.title, rows, sections };
}

/**
 * What the prompt is told about the handbook rows it holds, naming only the
 * markers those rows actually landed on. Null when none landed.
 */
export function buildHandbookNote(coverage: HandbookCoverage, markers: readonly number[]): string | null {
  if (markers.length === 0) return null;

  const title = handbookDisplayTitle(coverage.documentTitle);
  const list = markers.map((marker) => `[S${marker}]`).join(", ");

  if (coverage.kind === "contents") {
    return `THE ${title.toUpperCase()} — ITS COMPLETE TABLE OF CONTENTS IS INCLUDED

- Sources ${list} are the complete table of contents of ${coverage.documentTitle}, taken from the handbook itself: every section heading, with the page number it prints for it.
- To say what the handbook covers, work from those contents pages and cite them. Name sections and pages exactly as the contents give them.
- The full text of most sections is NOT among your sources. A section listed in the contents IS in the handbook: never call it missing, unavailable or not covered. Say instead that you can look up any section's wording if asked.
- Do not state what a section requires unless that section's own text is among the sources.${
      coverage.unmatchedTopic
        ? "\n- The handbook's section headings were searched for the topic of this question and none matched it. If the contents list no section for it, say the table of contents does not list one — and point to the nearest section the contents DO list, if any — rather than saying the handbook is silent."
        : ""
    }`;
  }

  const found = coverage.sections.map((section) => `${section.heading} (page ${section.page})`).join("; ");

  return `THE ${title.toUpperCase()} — SECTIONS READ FOR THIS QUESTION

- The handbook's own section headings were searched for this question, and these sections were taken from it directly: ${found}. They are sources ${list}.
- Answer what the handbook says from those sources, and cite the section heading and page exactly as each source's locator gives them.
- If they do not answer part of the question, say these sections do not address it. Do not say the handbook as a whole is silent: only the matching sections are included.
- If another document among the sources speaks to the same topic, keep it clearly separate from what the handbook says, and never present it as the handbook's policy.`;
}
