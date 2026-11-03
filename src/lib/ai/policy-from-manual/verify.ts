import { findManualSection } from "@/lib/forms/official-policy-manual";

import type { RetrievedChunk } from "./chunks";

/**
 * ============================================================================
 * EVERY QUOTE IS A VERBATIM PART OF A RETRIEVED MANUAL CHUNK
 * (POLICY_CITATION_CHECK_ENABLED)
 * ============================================================================
 *
 * Code checks, no model and no phrase list:
 *
 *   verifyQuote   the chunk was retrieved for this turn, and the quote is a
 *                 verbatim substring of that chunk's text — after whitespace
 *                 runs and curly/straight quotes are made the same, nothing
 *                 else — at least 8 words long and ending a sentence. A quote
 *                 that changes one word, or joins two places, is not in the
 *                 manual and is refused.
 *   verifyLabel   the heading is one of the retrieved chunks' headings, in the
 *                 manual's own spelling, and the page is the manual's page for
 *                 that heading (`findManualSection`). A wrong page is moved to
 *                 the manual's; a heading that was not retrieved is dropped.
 *   checkCitations
 *                 finds the "<Heading>, JBA Policy Manual p.N" labels and the
 *                 quoted passages in a reply, applies both checks, and takes
 *                 out what fails. An unverified quote is never shown.
 *
 * Normalisation is a character loop, like `fold` in `forms/form-reducer.ts`.
 * Nothing imports this module yet.
 */

/** The manual's name as every label in this app prints it (`formatManualCitation`). */
export const MANUAL_LABEL_TITLE = "JBA Policy Manual";
const LABEL_MARK = `, ${MANUAL_LABEL_TITLE} p.`;

export const MIN_QUOTE_WORDS = 8;

/* ------------------------------------------------------------ characters --- */

function isSpace(char: string): boolean {
  return char.trim() === "";
}

function isWordChar(char: string | undefined): boolean {
  if (char === undefined || char === "") return false;
  if (char >= "0" && char <= "9") return true;
  return char.toLowerCase() !== char.toUpperCase();
}

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= "0" && char <= "9";
}

function foldQuoteChar(char: string): string {
  switch (char) {
    case "‘":
    case "’":
    case "‚":
    case "‛":
    case "′":
      return "'";
    case "“":
    case "”":
    case "„":
    case "‟":
    case "″":
      return '"';
    default:
      return char;
  }
}

/**
 * Whitespace runs as one space, curly quotes as straight ones, trimmed. Case
 * and every other character are kept: a quote is verbatim or it is not.
 */
export function normaliseCitationText(text: string): string {
  let out = "";
  let pendingSpace = false;
  for (const char of text) {
    if (isSpace(char)) {
      pendingSpace = out !== "";
      continue;
    }
    if (pendingSpace) out += " ";
    pendingSpace = false;
    out += foldQuoteChar(char);
  }
  return out;
}

function wordCount(normalised: string): number {
  let count = 0;
  let inWord = false;
  for (const char of normalised) {
    if (char === " ") {
      inWord = false;
    } else if (!inWord) {
      inWord = true;
      count += 1;
    }
  }
  return count;
}

const CLOSERS = new Set(['"', "'", ")", "]"]);
const SENTENCE_ENDS = new Set([".", "!", "?"]);

function endsSentence(normalised: string): boolean {
  let at = normalised.length - 1;
  while (at >= 0 && CLOSERS.has(normalised[at]!)) at -= 1;
  return at >= 0 && SENTENCE_ENDS.has(normalised[at]!);
}

/** One pair of quote marks the model wrapped the quote in is not part of it. */
function unwrapped(normalised: string): string {
  if (normalised.length >= 2 && normalised[0] === '"' && normalised[normalised.length - 1] === '"') {
    return normalised.slice(1, -1).trim();
  }
  return normalised;
}

/* ----------------------------------------------------------------- quote --- */

export type QuoteRefusal = "chunk_not_retrieved" | "quote_not_in_manual" | "too_short";

export type QuoteCheck =
  | { readonly ok: true; readonly quote: string; readonly chunk: RetrievedChunk }
  | { readonly ok: false; readonly reason: QuoteRefusal };

export function verifyQuote(
  input: { readonly quote: string; readonly chunkId: string },
  chunks: readonly RetrievedChunk[],
): QuoteCheck {
  const chunk = chunks.find((candidate) => candidate.id === input.chunkId);
  if (!chunk) return { ok: false, reason: "chunk_not_retrieved" };

  const quote = unwrapped(normaliseCitationText(input.quote));
  if (wordCount(quote) < MIN_QUOTE_WORDS) return { ok: false, reason: "too_short" };
  if (!normaliseCitationText(chunk.text).includes(quote)) return { ok: false, reason: "quote_not_in_manual" };
  // A quote cut off mid-sentence is not one of the manual's sentences.
  if (!endsSentence(quote)) return { ok: false, reason: "quote_not_in_manual" };
  return { ok: true, quote, chunk };
}

/* ----------------------------------------------------------------- label --- */

export type LabelRefusal = "heading_not_retrieved" | "page_not_in_manual";

export type LabelCheck =
  | { readonly action: "keep"; readonly heading: string; readonly page: number }
  | { readonly action: "move"; readonly heading: string; readonly from: number | null; readonly page: number }
  | { readonly action: "drop"; readonly reason: LabelRefusal };

/** The retrieved heading this text names, in the manual's spelling, or null. */
export function retrievedHeading(heading: string, chunks: readonly RetrievedChunk[]): string | null {
  const wanted = normaliseCitationText(heading);
  if (wanted === "") return null;
  for (const chunk of chunks) {
    for (const candidate of chunk.headings) {
      if (normaliseCitationText(candidate) === wanted) return candidate;
    }
  }
  return null;
}

export function verifyLabel(
  input: { readonly heading: string; readonly page: number | null },
  chunks: readonly RetrievedChunk[],
): LabelCheck {
  const heading = retrievedHeading(input.heading, chunks);
  if (!heading) return { action: "drop", reason: "heading_not_retrieved" };

  const section = findManualSection(
    chunks.map((chunk) => chunk.source),
    [heading],
  );
  if (!section) return { action: "drop", reason: "page_not_in_manual" };

  if (input.page === section.page) return { action: "keep", heading, page: section.page };
  return { action: "move", heading, from: input.page, page: section.page };
}

/* ------------------------------------------------------- a whole reply --- */

export interface DroppedCitation {
  readonly kind: "quote" | "label";
  readonly reason: QuoteRefusal | LabelRefusal;
  /** The text that was taken out of the reply. */
  readonly text: string;
}

export interface MovedCitation {
  readonly heading: string;
  readonly from: number | null;
  readonly to: number;
}

export interface CitationCheck {
  readonly text: string;
  readonly dropped: readonly DroppedCitation[];
  readonly moved: readonly MovedCitation[];
}

interface Span {
  readonly start: number;
  readonly end: number;
}

interface Replacement extends Span {
  readonly with: string;
}

const LABEL_BOUNDARIES = new Set(["\n", "*", ":", "(", "[", '"', "“", "”", "—", "–", ";"]);

/** A label's heading: the longest vocabulary heading ending at the mark, else the words back to a boundary. */
function labelHeadingBefore(
  text: string,
  markAt: number,
  vocabulary: readonly string[],
): { heading: string; start: number } | null {
  for (const heading of vocabulary) {
    const forms = heading.toLowerCase().includes("policy") ? [heading] : [`${heading} Policy`, heading];
    for (const form of forms) {
      const start = markAt - form.length;
      if (start < 0) continue;
      if (normaliseCitationText(text.slice(start, markAt)) !== normaliseCitationText(form)) continue;
      if (isWordChar(text[start - 1])) continue;
      return { heading, start };
    }
  }

  let start = markAt;
  while (start > 0) {
    const char = text[start - 1]!;
    if (LABEL_BOUNDARIES.has(char)) break;
    if (SENTENCE_ENDS.has(char) && start < markAt && isSpace(text[start]!)) break;
    start -= 1;
  }
  while (start < markAt && isSpace(text[start]!)) start += 1;
  const heading = text.slice(start, markAt).trim();
  return heading === "" ? null : { heading, start };
}

function quotedSpans(text: string): { open: number; close: number }[] {
  const spans: { open: number; close: number }[] = [];
  let at = 0;
  while (at < text.length) {
    const char = text[at]!;
    const closer = char === "“" ? "”" : char === '"' ? '"' : null;
    if (!closer) {
      at += 1;
      continue;
    }
    const close = text.indexOf(closer, at + 1);
    if (close < 0) break;
    spans.push({ open: at, close });
    at = close + 1;
  }
  return spans;
}

/** The sentence a refused quote sits in: back to the previous sentence or line, on past its parenthetical. */
function sentenceAround(text: string, open: number, close: number, quoteEndsSentence: boolean): Span {
  let start = open;
  while (start > 0) {
    const char = text[start - 1]!;
    if (char === "\n") break;
    if (SENTENCE_ENDS.has(char) && start < open && isSpace(text[start]!)) break;
    start -= 1;
  }

  let end = close + 1;
  let probe = end;
  while (probe < text.length && text[probe] === " ") probe += 1;
  if (text[probe] === "(") {
    const shut = text.indexOf(")", probe);
    const newline = text.indexOf("\n", probe);
    if (shut > 0 && (newline < 0 || shut < newline)) end = shut + 1;
  }
  if (SENTENCE_ENDS.has(text[end] ?? "")) return { start, end: end + 1 };
  if (quoteEndsSentence) return { start, end };

  // A quote in the middle of a sentence: the rest of that sentence goes too.
  while (end < text.length) {
    const char = text[end]!;
    if (char === "\n") break;
    if (SENTENCE_ENDS.has(char) && (end + 1 >= text.length || isSpace(text[end + 1]!))) {
      end += 1;
      break;
    }
    end += 1;
  }
  return { start, end };
}

/** Spaces left by a removal: runs collapsed, none before punctuation, no empty brackets, no trailing ones. */
function tidy(text: string): string {
  let out = "";
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at]!;
    if (char === " " || char === "\t") {
      const next = text[at + 1];
      if (out === "" || out.endsWith(" ") || out.endsWith("\n")) continue;
      if (next === undefined || next === "\n" || next === " " || next === "\t") continue;
      if (next === "," || next === "." || next === ";" || next === ":" || next === ")") continue;
      out += " ";
      continue;
    }
    if (char === ")" && out.endsWith("(")) {
      out = out.slice(0, -1).trimEnd();
      continue;
    }
    out += char;
  }
  return out.trim();
}

function overlaps(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Check every manual label and quoted passage in a reply against the retrieved
 * chunks. `vocabulary` is the manual's own heading list (data, not a phrase
 * list) used to find where a label's heading starts; it defaults to the
 * retrieved headings.
 */
export function checkCitations(
  answerText: string,
  chunks: readonly RetrievedChunk[],
  options: { readonly vocabulary?: readonly string[] } = {},
): CitationCheck {
  const vocabulary = [
    ...new Set([...(options.vocabulary ?? []), ...chunks.flatMap((chunk) => chunk.headings)]),
  ].sort((a, b) => b.length - a.length);

  const removals: Span[] = [];
  const replacements: Replacement[] = [];
  const dropped: DroppedCitation[] = [];
  const moved: MovedCitation[] = [];

  let from = 0;
  while (from < answerText.length) {
    const markAt = answerText.indexOf(LABEL_MARK, from);
    if (markAt < 0) break;
    from = markAt + LABEL_MARK.length;

    let digitsAt = from;
    if (answerText[digitsAt] === " ") digitsAt += 1;
    let digitsEnd = digitsAt;
    while (isDigit(answerText[digitsEnd])) digitsEnd += 1;
    if (digitsEnd === digitsAt) continue;

    const found = labelHeadingBefore(answerText, markAt, vocabulary);
    if (!found) continue;
    const page = Number(answerText.slice(digitsAt, digitsEnd));
    const check = verifyLabel({ heading: found.heading, page }, chunks);
    if (check.action === "drop") {
      removals.push({ start: found.start, end: digitsEnd });
      dropped.push({ kind: "label", reason: check.reason, text: answerText.slice(found.start, digitsEnd) });
    } else if (check.action === "move") {
      replacements.push({ start: digitsAt, end: digitsEnd, with: String(check.page) });
      moved.push({ heading: check.heading, from: check.from, to: check.page });
    }
    from = digitsEnd;
  }

  for (const { open, close } of quotedSpans(answerText)) {
    const inner = answerText.slice(open + 1, close);
    if (normaliseCitationText(inner) === "") continue;
    let reason: QuoteRefusal = "chunk_not_retrieved";
    let ok = false;
    for (const chunk of chunks) {
      const check = verifyQuote({ quote: inner, chunkId: chunk.id }, chunks);
      if (check.ok) {
        ok = true;
        break;
      }
      if (check.reason === "too_short" || reason === "chunk_not_retrieved") reason = check.reason;
    }
    if (ok) continue;
    const span = sentenceAround(answerText, open, close, endsSentence(normaliseCitationText(inner)));
    removals.push(span);
    dropped.push({ kind: "quote", reason, text: answerText.slice(open, close + 1) });
  }

  if (removals.length === 0 && replacements.length === 0) {
    return { text: answerText, dropped, moved };
  }

  const merged: Span[] = [];
  for (const span of [...removals].sort((a, b) => a.start - b.start)) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end) merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, span.end) };
    else merged.push(span);
  }
  const edits: Replacement[] = [
    ...merged.map((span) => ({ ...span, with: "" })),
    ...replacements.filter((edit) => !merged.some((span) => overlaps(span, edit))),
  ].sort((a, b) => b.start - a.start);

  let text = answerText;
  for (const edit of edits) text = text.slice(0, edit.start) + edit.with + text.slice(edit.end);
  return { text: merged.length > 0 ? tidy(text) : text, dropped, moved };
}
