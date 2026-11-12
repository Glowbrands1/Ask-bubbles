import type { ManualChunk } from "@/lib/forms/official-policy-manual";

import { accountManualSections } from "./account-manual-sections";
import { formatManualCitation } from "./policy-citation-fields";

/**
 * The manual section a turn is about, from the same readers a Corrective
 * Action uses. The page is the chunk's own printed page. Nothing here
 * prefers one heading over another by overlap.
 */

export interface CitedSection {
  readonly section: string;
  readonly page: number | null;
}

export function citedSections(turns: readonly string[], chunks: readonly ManualChunk[]): CitedSection[] {
  const text = turns.filter((turn) => turn.trim() !== "").join("\n");
  return accountManualSections(text, chunks).map((section) => ({
    section: section.heading,
    page: section.page > 0 ? section.page : null,
  }));
}

function passage(section: CitedSection, chunks: readonly ManualChunk[]): string {
  const heading = formatManualCitation(section.section, section.page);
  const key = section.section.toLowerCase();
  const chunk =
    chunks.find((item) => (item.section ?? "").toLowerCase() === key) ??
    chunks.find((item) => item.content.toLowerCase().includes(key)) ??
    null;
  if (!chunk) return heading;
  return `${heading}\n${quoted(chunk.content)}`;
}

const QUOTE_LIMIT = 500;

/*
 * POLICY_CITATION_ENABLED (Gate-Bubbles-2, 12 Nov 2026): the quote was cut at 500 characters mid-word ("… does not count
 * as calling i") and kept the manual's markdown, so a section could end on a stray "*". The quote ends at the last
 * sentence (or, failing that, the last whole word) inside the limit, with "…" when it was shortened, and carries no
 * emphasis markers.
 */
function quoted(content: string): string {
  const plain = content.replace(/\*+/g, "").replace(/[ \t]+\n/g, "\n").trim();
  if (plain.length <= QUOTE_LIMIT) return plain;
  const head = plain.slice(0, QUOTE_LIMIT);
  const sentence = Math.max(head.lastIndexOf(". "), head.lastIndexOf(".\n"), head.lastIndexOf("? "), head.lastIndexOf("! "));
  if (sentence >= QUOTE_LIMIT / 2) return `${head.slice(0, sentence + 1).trimEnd()} …`;
  const word = head.search(/\s\S*$/);
  return `${(word > 0 ? head.slice(0, word) : head).trimEnd()} …`;
}

/** The citation block's heading: what follows it is the quoted manual, never the card's own wording. */
export const CITED_BLOCK_HEADING = "**Policy cited from the JBA Policy Manual**";

/*
 * POLICY_CITATION_ENABLED on a card (Gate-Bubbles-2, 12 Nov 2026): the block re-read the manager's turns, so a Coaching
 * card made about leaving the front desk unattended quoted Attendance from the missed meeting before the "make it about"
 * (WORK_AREA_ABSENCE_CITES_CONDUCT says the Standards of Conduct). On a card, the block quotes the sections the card
 * itself cites — its "<Heading> Policy, JBA Policy Manual p.N" lines and its "**Policy:** <Heading>" line — and nothing
 * else; a card that cites no section gets no block (so "please list the policy" keeps its "listed on the draft at
 * Create" sentence).
 */
const CARD_CITATION = /([A-Z][A-Za-z&'/ -]*?)(?: Policy)?, JBA Policy Manual(?: p\.\s?(\d+))?/g;
const CARD_POLICY_LINE = /^\*\*Policy:\*\*\s*([^,\n(]+?)\s*(?:,|\(|$)[^\n]*/m;

export function cardCitedSections(content: string, chunks: readonly ManualChunk[]): CitedSection[] {
  const card = content.split(CITED_BLOCK_HEADING)[0]!;
  const headings = new Map<string, number | null>();
  for (const match of card.matchAll(CARD_CITATION)) headings.set(match[1]!.trim(), match[2] ? Number(match[2]) : null);
  const line = CARD_POLICY_LINE.exec(card);
  if (line) {
    const page = /\bpage\s+(\d+)\b/i.exec(line[0])?.[1];
    const name = line[1]!.trim();
    if (!headings.has(name)) headings.set(name, page ? Number(page) : null);
  }
  const known = new Set(chunks.map((chunk) => (chunk.section ?? "").trim().toLowerCase()).filter(Boolean));
  return [...headings]
    .map(([heading, page]) => ({ section: heading.replace(/\s+Policy$/i, ""), page }))
    .filter((section) => known.has(section.section.toLowerCase()) || known.has(`${section.section} policy`.toLowerCase()));
}

/**
 * The cited block without the passages whose heading `drop` says to leave out; with none left, without its heading
 * too, so the block is never a heading with no quote (Gate-Bubbles-3, Rpcf, 12 Nov 2026). A passage starts at its
 * citation line ("Attendance Policy, JBA Policy Manual p.14") and runs to the next one; the block ends at the next bold
 * paragraph. No block: unchanged.
 */
export function withoutCitedPassages(content: string, drop: (heading: string) => boolean): string {
  const at = content.indexOf(CITED_BLOCK_HEADING);
  if (at < 0) return content;
  const before = content.slice(0, at).trimEnd();
  const paragraphs = content.slice(at + CITED_BLOCK_HEADING.length).split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const end = paragraphs.findIndex((part) => part.startsWith("**"));
  const block = end < 0 ? paragraphs : paragraphs.slice(0, end);
  const after = end < 0 ? [] : paragraphs.slice(end);
  const passages: string[][] = [];
  for (const part of block) {
    if (/, JBA Policy Manual\b/.test(part.split("\n")[0]!) || passages.length === 0) passages.push([part]);
    else passages.at(-1)!.push(part);
  }
  const kept = passages.filter((passage) => !drop(passage[0]!.split("\n")[0]!)).map((passage) => passage.join("\n\n"));
  const rebuilt = kept.length > 0 ? [`${CITED_BLOCK_HEADING}`, ...kept] : [];
  return [before, ...rebuilt, ...after].filter(Boolean).join("\n\n");
}

/** On a card, the quoted block of the sections the card cites (see above). Off, or nothing cited, unchanged. */
export function withCardPolicyQuoted(content: string, chunks: readonly ManualChunk[], enabled: boolean): string {
  if (!enabled || content.includes(CITED_BLOCK_HEADING)) return content;
  const sections = cardCitedSections(content, chunks);
  if (sections.length === 0) return content;
  return `${content.trim()}\n\n${CITED_BLOCK_HEADING}\n\n${sections.map((section) => passage(section, chunks)).join("\n\n")}`;
}

/** Append the retrieved section. Off, or with nothing resolved, the text is unchanged. */
export function withMappedPolicy(
  content: string,
  turns: readonly string[],
  chunks: readonly ManualChunk[],
  enabled: boolean,
): string {
  if (!enabled) return content;
  const sections = citedSections(turns, chunks).filter(
    (section) => !content.toLowerCase().includes(formatManualCitation(section.section, section.page).toLowerCase()),
  );
  if (sections.length === 0) return content;
  const block = sections.map((section) => passage(section, chunks)).join("\n\n");
  return `${content.trim()}\n\n${CITED_BLOCK_HEADING}\n\n${block}`;
}
