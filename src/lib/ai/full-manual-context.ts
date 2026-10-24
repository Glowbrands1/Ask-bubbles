import { MULTI_BRAND_MANUAL_TITLES, POLICY_MANUAL_BRAND_SCOPE } from "@/config/company/knowledge";
import { isTableOfContents } from "@/lib/forms/official-policy-manual";
import { readManualForBrand, isMultiBrandManual, type ManualBrandScope } from "@/lib/knowledge/brand-sections";
import { estimateTokens } from "@/lib/ingestion/chunking";
import { isPageFooter, printedPageOf } from "@/lib/ingestion/extract/pdf-sections";
import type { KnowledgeCategory } from "@/types";

import { normalizeMarkers } from "./prompts";

/**
 * The whole current brand manual, for a policy question.
 *
 * One manual is about 26k–46k tokens. The whole library is not. 120k is the
 * ceiling for the block this module will put in the prompt. Over that, the
 * caller keeps ordinary retrieval.
 */
export const FULL_MANUAL_TOKEN_BUDGET = 120_000;

const CATEGORIES = new Set<KnowledgeCategory>([
  "policies_compliance",
  "operations",
  "training",
  "leadership_coaching",
  "sales_client_experience",
  "reports_analytics",
  "bonuses_compensation",
  "safety",
  "equipment_procedures",
  "other",
]);

export interface FullManualChunk {
  readonly chunkIndex: number;
  readonly content: string;
  readonly locator?: string | null;
  /** PDF sheet index. Not the number the manual prints. */
  readonly page?: number | null;
  readonly printedPage?: number | null;
  readonly section?: string | null;
  readonly headings?: readonly string[];
  /**
   * Heading and the page the manual prints it on. A chunk can open on one
   * printed page and continue onto the next; the footer at the top is only
   * the first of those.
   */
  readonly sections?: readonly { readonly heading: string; readonly page: number }[];
}

export interface FullManualDocument {
  readonly id: string;
  readonly title: string;
  readonly category?: string | null;
  readonly status: string;
  readonly indexed: boolean;
  readonly chunks: readonly FullManualChunk[];
}

export type ManualBrandChoice = "all" | "bcs" | "crunch" | "stc";

export interface ManualCitationIndex {
  readonly pages: ReadonlySet<number>;
  /** Lower-cased heading, without a trailing colon, on that printed page. */
  readonly headings: ReadonlyMap<number, ReadonlySet<string>>;
}

export interface FullManualSource {
  readonly marker: number;
  readonly documentId: string;
  readonly documentTitle: string;
  readonly locator: string;
  readonly excerpt: string;
  readonly category: KnowledgeCategory;
  /** Printed page this source was built from. Absent on older callers. */
  readonly printedPage?: number;
}

/** One section of the loaded manual, on the page the manual prints. */
export interface ManualPassage {
  readonly documentId: string;
  readonly documentTitle: string;
  readonly category: KnowledgeCategory;
  readonly printedPage: number;
  readonly heading: string | null;
  /** Headings the chunk text names, including one packed onto a body line. */
  readonly knownHeadings: readonly string[];
  readonly excerpt: string;
  readonly text: string;
}

/**
 * Printed pages 3–6 of the JBA Policy Manual are the table of contents.
 * Those chunks were removed from the database; a re-upload must still leave
 * them out of the prompt, or the model cites the contents sheet.
 */
export const JBA_CONTENTS_PRINTED_PAGES: ReadonlySet<number> = new Set([3, 4, 5, 6]);

export interface FullManualPlan {
  readonly ready: boolean;
  readonly reason: "ready" | "over_budget" | "no_manual" | "not_policy";
  readonly tokens: number;
  readonly choice: ManualBrandChoice;
  readonly cachedBlock: string | null;
  readonly sources: readonly FullManualSource[];
  readonly passages: readonly ManualPassage[];
  readonly index: ManualCitationIndex | null;
  /** Brand names whose rules are in the block. */
  readonly brands: readonly string[];
}

const POLICY_QUESTION =
  /\b(?:dress(?:\s*|-)?codes?|uniforms?|pto|paid\s+time\s+off|vacation(?:\s+time)?|sick(?:\s+(?:day|days|leave|time))?|polic(?:y|ies)|handbooks?|manuals?|attendance|time\s*off|holidays?|bereavement|benefits?|cell\s*phones?|smart\s*watch(?:es)?)\b/i;

/** A policy question, including the dress-code and PTO wordings managers used. */
export function isPolicyQuestion(text: string): boolean {
  return POLICY_QUESTION.test(text);
}

/**
 * One named brand selects that brand's manual. None, or more than one,
 * selects every brand. "what's the dress code?" names none.
 */
export function brandChoice(question: string): ManualBrandChoice {
  const named = new Set<ManualBrandChoice>();
  if (/\bbuff\s+city\s+soap\b|\bbcs\b/i.test(question)) named.add("bcs");
  if (/\bcrunch(?:\s+fitness)?\b/i.test(question)) named.add("crunch");
  if (/\bsun\s+tan\s+city\b|\bstc\b/i.test(question)) named.add("stc");
  if (named.size !== 1) return "all";
  return [...named][0]!;
}

const OTHER_TANNING_BRAND = ["Sun", "Tan", "City"].join(" ");

export function brandsCovered(text: string): string[] {
  const found: string[] = [];
  if (/buff city soap/i.test(text)) found.push("Buff City Soap");
  if (/\bcrunch\b/i.test(text)) found.push("Crunch");
  if (new RegExp(String.raw`sun\s+tan\s+city`, "i").test(text)) found.push(OTHER_TANNING_BRAND);
  return found;
}

function categoryOf(value: string | null | undefined): KnowledgeCategory {
  if (value && CATEGORIES.has(value as KnowledgeCategory)) return value as KnowledgeCategory;
  return "policies_compliance";
}

/** Indexed, and not retired or superseded. Any other status stays out. */
export function isCurrentManual(document: FullManualDocument): boolean {
  if (!document.indexed) return false;
  const status = document.status.trim().toLowerCase();
  if (status !== "indexed") return false;
  return isMultiBrandManual(document.title, MULTI_BRAND_MANUAL_TITLES);
}

function scopeFor(choice: Exclude<ManualBrandChoice, "all">): ManualBrandScope {
  if (choice === "bcs") return POLICY_MANUAL_BRAND_SCOPE;
  const office = [
    String.raw`Corporate\s+Office`,
    String.raw`JB\s+&\s+Associates\s+Office`,
    String.raw`All\s+Locations(?:\s+Dress\s+Code)?`,
  ];
  const subHeadings = [/^Tanning$/i, /^Shirts$/i, /^Pants$/i];
  if (choice === "crunch") {
    return {
      otherBrands: [String.raw`Sun\s+Tan\s+City`, String.raw`STC`, String.raw`Buff\s+City\s+Soap`, String.raw`BCS`],
      keptLabels: [String.raw`Crunch(?:\s+Fitness)?`, ...office],
      excludedSections: [/^Buddy Passes \(.*\bONLY\)$/i],
      subHeadings,
      otherBrandPassages: [],
    };
  }
  return {
    otherBrands: [String.raw`Buff\s+City\s+Soap`, String.raw`BCS`, String.raw`Crunch(?:\s+Fitness)?`],
    keptLabels: [String.raw`Sun\s+Tan\s+City`, String.raw`STC`, ...office],
    excludedSections: [],
    subHeadings,
    otherBrandPassages: [],
  };
}

function footerPrintedPage(content: string): number | null {
  for (const line of content.split("\n")) {
    const printed = printedPageOf(line);
    if (printed) return printed;
  }
  return null;
}

function positivePage(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

/** Distinct printed pages recorded for headings in this chunk, in first-seen order. */
function recordedSectionPages(chunk: FullManualChunk): number[] {
  const pages: number[] = [];
  for (const entry of chunk.sections ?? []) {
    const page = positivePage(entry.page);
    if (page && !pages.includes(page)) pages.push(page);
  }
  return pages;
}

/**
 * The page number printed on the sheet.
 *
 * The footer ("15 | P a g e") wins, unless that footer repeats the PDF sheet
 * index and the headings on the chunk all record a different page. Company
 * dress code and Hair are printed 15; the sheet index 16 is not a citation.
 * A locator that repeats `chunk.page` is the PDF sheet and is not used.
 */
export function resolvePrintedPage(chunk: FullManualChunk): number | null {
  const footer = footerPrintedPage(chunk.content);
  const stored = positivePage(chunk.printedPage);
  const pdf = positivePage(chunk.page);
  const recorded = recordedSectionPages(chunk);
  const footerIsPdf = footer !== null && pdf !== null && footer === pdf;
  const storedIsPdf = footer === null && stored !== null && pdf !== null && stored === pdf;
  if (recorded.length === 1 && recorded[0] !== (footer ?? stored) && (footerIsPdf || storedIsPdf)) {
    return recorded[0]!;
  }
  if (footer) return footer;
  if (stored) return stored;
  const locator = chunk.locator?.match(/\bpage\s+(\d{1,3})\b/i);
  if (!locator) return null;
  const parsed = Number(locator[1]);
  if (pdf !== null && parsed === pdf) return null;
  return parsed;
}

/** The printed page ingestion recorded for this heading, if it recorded one. */
function recordedHeadingPage(chunk: FullManualChunk, heading: string): number | null {
  const key = normalizeHeading(heading);
  for (const entry of chunk.sections ?? []) {
    if (normalizeHeading(entry.heading) !== key) continue;
    const page = positivePage(entry.page);
    if (page) return page;
  }
  return null;
}

function skipContentsPage(chunk: FullManualChunk, page: number | null): boolean {
  if (isTableOfContents(chunk.content)) return true;
  return page !== null && JBA_CONTENTS_PRINTED_PAGES.has(page);
}

function trimOverlap(previous: string, next: string): string {
  const prior = previous.trim();
  const body = next.trim();
  if (!prior || !body) return body;
  const max = Math.min(prior.length, body.length, 600);
  for (let size = max; size >= 40; size -= 1) {
    if (prior.endsWith(body.slice(0, size))) return body.slice(size).trim();
  }
  return body;
}

function normalizeHeading(value: string): string {
  return value.replace(/:+$/, "").replace(/\s+/g, " ").trim().toLowerCase();
}

const BRAND_HEADING =
  /^(?:buff city soap|bcs|crunch(?: fitness)?|sun\s+tan\s+city|stc|corporate office|jb & associates office|all locations(?: dress code)?)(?: specific dress code)?$/i;

/**
 * "…on the shirt. Pants" is a heading glued to the end of the previous
 * sentence. The heading is only recognized when it stands as its own line,
 * so peel that trailing title off before the line is read.
 */
function trailingHeading(line: string, known: readonly string[]): { before: string; heading: string } | null {
  const match = line.match(/^(.*[.!?])\s+(\S.*)$/u);
  if (!match?.[1] || !match[2]) return null;
  const words = match[2].replace(/:+$/, "").trim().split(/\s+/);
  if (words.length === 0 || words.length > 8) return null;
  for (let start = 0; start < words.length; start += 1) {
    const candidate = words.slice(start).join(" ").replace(/:+$/, "").trim();
    if (!candidate || candidate.length > 80) continue;
    const heading = headingOf(candidate, known);
    if (!heading || !isSectionTitle(heading, known)) continue;
    const prefix = words.slice(0, start);
    const before = prefix.length > 0 ? `${match[1]} ${prefix.join(" ")}` : match[1];
    return { before, heading };
  }
  return null;
}

/** A trailing title, not an ordinary capitalized word such as "The". */
function isSectionTitle(heading: string, known: readonly string[]): boolean {
  if (known.some((item) => normalizeHeading(item) === normalizeHeading(heading))) return true;
  if (BRAND_HEADING.test(heading)) return true;
  const words = heading.split(/\s+/);
  if (words.length !== 1 || words[0]!.length < 4) return false;
  return !/^(?:the|and|for|with|this|that|from|when|they|their|also|only|each|such|into|over|under|after|before|will|must|have|been|any|all|not|our|you|your)$/i.test(
    heading,
  );
}

function headingOf(line: string, known: readonly string[]): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 80) return null;
  if (/^\d+\s*\|\s*p\s*a\s*g\s*e$/i.test(trimmed)) return null;
  if (/^o\s/i.test(trimmed)) return null;
  const bare = trimmed.replace(/:+$/, "").trim();
  if (!bare) return null;
  if (known.some((heading) => normalizeHeading(heading) === normalizeHeading(bare))) return bare;
  if (BRAND_HEADING.test(bare)) return bare;
  if (/^[A-Z][\p{L}\p{N}&'’/-]*(?:\s+[A-Z][\p{L}\p{N}&'’/-]*){0,6}$/u.test(bare) && bare.length <= 40) {
    return bare;
  }
  return null;
}

interface MutableIndex {
  pages: Set<number>;
  headings: Map<number, Set<string>>;
}

function readingsFor(chunks: readonly FullManualChunk[], choice: ManualBrandChoice): string[] {
  const ordered = [...chunks].sort((left, right) => left.chunkIndex - right.chunkIndex);
  if (choice === "all") return ordered.map((chunk) => chunk.content);
  const read = readManualForBrand(
    ordered.map((chunk) => ({
      content: chunk.content,
      headings: chunk.headings ?? (chunk.section ? [chunk.section] : []),
    })),
    scopeFor(choice),
  );
  return read;
}

/**
 * Chunks in chunk_index order, with a [p.N] marker when the printed page
 * changes. Headings are the ones printed in the chunk, not a stored locator
 * that named a heading the brand filter has already removed.
 */
interface RawPassage {
  readonly printedPage: number;
  readonly heading: string | null;
  readonly text: string;
  readonly knownHeadings: readonly string[];
}

export function rebuildManualText(
  chunks: readonly FullManualChunk[],
  choice: ManualBrandChoice,
): { text: string; index: ManualCitationIndex; passages: RawPassage[] } {
  const ordered = [...chunks].sort((left, right) => left.chunkIndex - right.chunkIndex);
  const readings = readingsFor(ordered, choice);
  const index: MutableIndex = { pages: new Set(), headings: new Map() };
  const blocks: string[] = [];
  const passages: RawPassage[] = [];
  let previous = "";
  let currentPage: number | null = null;
  let passageHeading: string | null = null;
  let passageLines: string[] = [];
  let passageKnown: string[] = [];

  const noteKnown = (line: string, known: readonly string[]) => {
    for (const heading of known) {
      const bare = heading.trim();
      if (bare.length < 4) continue;
      if (!line.toLowerCase().includes(bare.toLowerCase())) continue;
      if (passageKnown.some((item) => normalizeHeading(item) === normalizeHeading(bare))) continue;
      passageKnown.push(bare);
    }
  };

  const flush = () => {
    const text = passageLines.join("\n").trim();
    const knownHeadings = passageKnown;
    passageLines = [];
    passageKnown = [];
    if (!currentPage || !text) return;
    passages.push({ printedPage: currentPage, heading: passageHeading, text, knownHeadings });
  };

  let shown: string[] = [];
  const flushShown = () => {
    const text = shown.join("\n").trim();
    shown = [];
    if (text) blocks.push(text);
  };
  const moveTo = (page: number) => {
    if (page === currentPage) return;
    flush();
    flushShown();
    /*
     * A heading belongs to the page it was printed on. Carrying the previous
     * heading onto the next sheet labeled a later rule with the earlier section.
     */
    passageHeading = null;
    blocks.push(`[p.${page}]`);
    currentPage = page;
    index.pages.add(page);
  };

  for (let position = 0; position < ordered.length; position += 1) {
    const chunk = ordered[position]!;
    const page = resolvePrintedPage(chunk);
    if (skipContentsPage(chunk, page)) continue;
    const body = trimOverlap(previous, readings[position] ?? "");
    if (!body) continue;
    if (page) moveTo(page);
    if (!page && !currentPage) {
      blocks.push(body);
      previous = body;
      continue;
    }
    for (const rawLine of body.split("\n")) {
      if (isPageFooter(rawLine)) {
        shown.push(rawLine);
        continue;
      }
      const peeled = trailingHeading(rawLine, chunk.headings ?? []);
      const pieces = peeled ? [peeled.before, peeled.heading] : [rawLine];
      for (const line of pieces) {
        const heading = headingOf(line, chunk.headings ?? []);
        if (!heading) continue;
        const recorded = recordedHeadingPage(chunk, heading);
        if (recorded) moveTo(recorded);
      }
      shown.push(rawLine);
      for (const line of pieces) {
        if (!line.trim()) continue;
        const heading = headingOf(line, chunk.headings ?? []);
        if (heading && normalizeHeading(heading) !== normalizeHeading(passageHeading ?? "")) {
          flush();
          passageHeading = heading;
          if (currentPage) {
            index.pages.add(currentPage);
            const set = index.headings.get(currentPage) ?? new Set<string>();
            set.add(normalizeHeading(heading));
            index.headings.set(currentPage, set);
          }
        }
        noteKnown(line, chunk.headings ?? []);
        passageLines.push(line);
      }
    }
    flushShown();
    previous = body;
  }
  flush();
  return { text: blocks.join("\n\n"), index, passages };
}

function headerFor(choice: ManualBrandChoice): string {
  const coverage =
    choice === "all"
      ? "The question did not name one brand, so this text includes every brand in the manual. Cover Buff City Soap and Crunch, not only one brand."
      : "This text is that brand's manual plus the company-wide sections.";
  return `FULL POLICY MANUAL

This is the current manual. Retired and superseded editions are not included. Each page is marked [p.N] with the page number printed in the manual, not the PDF sheet. Cite a statement with the [p.N] marker above that passage. Do not cite a page that has no marker. Do not write an [S#] marker. Name a heading only when it is printed on that page. ${coverage}`;
}

function excerptOf(heading: string | null, text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!heading) return flat.slice(0, 220).trim();
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bare = flat.replace(new RegExp(`^${escaped}\\s*`, "i"), "").trim();
  return (bare || flat).slice(0, 220).trim();
}

export function planFullManualContext(input: {
  readonly question: string;
  readonly policyText?: string;
  readonly documents: readonly FullManualDocument[];
  readonly budget?: number;
}): FullManualPlan {
  const choice = brandChoice(input.question);
  const empty: FullManualPlan = {
    ready: false,
    reason: "not_policy",
    tokens: 0,
    choice,
    cachedBlock: null,
    sources: [],
    passages: [],
    index: null,
    brands: [],
  };
  if (!isPolicyQuestion(input.policyText ?? input.question)) return empty;

  const documents = input.documents.filter(isCurrentManual);
  if (documents.length === 0) return { ...empty, reason: "no_manual" };

  const pages: Set<number> = new Set();
  const headings: Map<number, Set<string>> = new Map();
  const parts: string[] = [];
  const passages: ManualPassage[] = [];

  for (const document of documents) {
    const rebuilt = rebuildManualText(document.chunks, choice);
    for (const page of rebuilt.index.pages) pages.add(page);
    for (const [page, set] of rebuilt.index.headings) {
      const existing = headings.get(page) ?? new Set<string>();
      for (const heading of set) existing.add(heading);
      headings.set(page, existing);
    }
    const category = categoryOf(document.category);
    for (const passage of rebuilt.passages) {
      passages.push({
        documentId: document.id,
        documentTitle: document.title,
        category,
        printedPage: passage.printedPage,
        heading: passage.heading,
        knownHeadings: passage.knownHeadings,
        excerpt: excerptOf(passage.heading, passage.text),
        text: passage.text,
      });
    }
    parts.push(rebuilt.text);
  }

  const body = parts.filter((part) => part.trim().length > 0).join("\n\n");
  const cachedBlock = `${headerFor(choice)}\n\n${body}`.trim();
  const tokens = estimateTokens(cachedBlock);
  const index = { pages, headings };
  const brands = brandsCovered(body);
  const budget = input.budget ?? FULL_MANUAL_TOKEN_BUDGET;
  if (tokens > budget || !body) {
    return {
      ready: false,
      reason: body ? "over_budget" : "no_manual",
      tokens,
      choice,
      cachedBlock: null,
      sources: [],
      passages,
      index,
      brands,
    };
  }
  return {
    ready: true,
    reason: "ready",
    tokens,
    choice,
    cachedBlock,
    sources: [],
    passages,
    index,
    brands,
  };
}

export function fullManualGroundingNote(plan: Pick<FullManualPlan, "choice">): string {
  const coverage =
    plan.choice === "all"
      ? "The question does not name one brand. Cover every brand this manual states, including Buff City Soap and Crunch."
      : "The question names one brand. Answer from that brand's manual and the company-wide sections.";
  return `COMPANY KNOWLEDGE

The full current policy manual is in the system prefix. Each page is marked [p.N] with the page number printed in the manual. Cite each policy statement with that marker. Do not cite a page that is not marked. Do not write an [S#] marker for the manual. A heading may be named only when it is printed on that page. ${coverage}`;
}

function pagesWithHeading(index: ManualCitationIndex, heading: string): number[] {
  const key = normalizeHeading(heading);
  if (!key) return [];
  const pages: number[] = [];
  for (const [page, headings] of index.headings) {
    if (headings.has(key)) pages.push(page);
  }
  return pages.sort((left, right) => left - right);
}

/**
 * A "Page N — Heading" citation stays when that heading is on that page.
 * One known page for the heading replaces a wrong page. Anything else is
 * removed. A bare page that is not in the manual is removed.
 */
export function fixPageCitations(answer: string, index: ManualCitationIndex): string {
  const headed = answer.replace(
    /\b((?:[Pp]age|[Pp])\.?)\s*(\d{1,3})\s*([—–-])\s*(\p{Lu}[\p{L}\p{N}&'’/-]*(?:\s+\p{Lu}[\p{L}\p{N}&'’/-]*){0,6})/gu,
    (full, _label: string, digits: string, dash: string, rawHeading: string) => {
      const page = Number(digits);
      const heading = rawHeading.trim();
      const onPage = index.headings.get(page)?.has(normalizeHeading(heading)) ?? false;
      if (index.pages.has(page) && onPage) return full;
      const known = pagesWithHeading(index, heading);
      if (known.length === 1) return `Page ${known[0]} ${dash} ${heading}`;
      return "";
    },
  );
  const marked = headed.replace(/\[p\.(\d{1,3})\]/gi, (full, digits: string) =>
    index.pages.has(Number(digits)) ? full : "",
  );
  return marked.replace(/(^|[^\w[])((?:page|p)\.?\s*)(\d{1,3})\b/gi, (full, prefix: string, _label: string, digits: string) => {
    if (!index.pages.has(Number(digits))) return prefix;
    return full;
  });
}

/**
 * Markers in `shownMarkers` are the grounding ids in the order of the source
 * cards. The first becomes [S1]. A marker that is not in that list is removed,
 * including [S11] when eight sources are shown and [S10] or [S8] when seven are.
 */
export function alignSourceMarkers(answer: string, shownMarkers: readonly number[]): string {
  const display = new Map<number, number>();
  for (const marker of shownMarkers) {
    if (!Number.isInteger(marker) || marker <= 0 || display.has(marker)) continue;
    display.set(marker, display.size + 1);
  }
  const aligned = normalizeMarkers(answer).replace(/\[S(\d{1,2})\]/g, (_full, digits: string) => {
    const next = display.get(Number(digits));
    return next ? `[S${next}]` : "";
  });
  return aligned
    .replace(/[^\S\n]{2,}/g, " ")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]+\)/g, ")")
    .replace(/\(\s*\)/g, "")
    .trim();
}

export function validateManualCitations(
  answer: string,
  input: { readonly shownMarkers: readonly number[]; readonly index: ManualCitationIndex | null },
): string {
  const normalized = normalizeMarkers(answer);
  const paged = input.index ? fixPageCitations(normalized, input.index) : normalized;
  return alignSourceMarkers(paged, input.shownMarkers);
}

export interface CitedManualAnswer {
  readonly text: string;
  readonly sources: readonly FullManualSource[];
  /**
   * False when the answer still names no printed page that this manual
   * contains. The caller then uses ordinary retrieval.
   */
  readonly ok: boolean;
}

const HEADING_STOP = new Set([
  "dress",
  "code",
  "specific",
  "policy",
  "policies",
  "section",
  "manual",
  "company",
  "locations",
  "location",
  "employees",
  "employee",
  "about",
  "other",
  "workplace",
  "safety",
  "security",
  "customer",
  "customers",
  "management",
  "holiday",
  "holidays",
  "benefits",
  "records",
  "office",
  "corporate",
  "acceptable",
  "required",
  "permitted",
  "personal",
  "phone",
  "phones",
]);

const OVERLAP_STOP = new Set([
  ...HEADING_STOP,
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "been",
  "being",
  "does",
  "each",
  "from",
  "have",
  "into",
  "more",
  "must",
  "only",
  "should",
  "some",
  "such",
  "than",
  "that",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "under",
  "very",
  "what",
  "when",
  "where",
  "which",
  "while",
  "will",
  "with",
  "your",
]);

function wordsOf(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mentionsHeading(answer: string, heading: string): boolean {
  const hay = ` ${wordsOf(answer)} `;
  const phrase = wordsOf(heading);
  if (!phrase) return false;
  if (phrase.length >= 8 && hay.includes(` ${phrase} `)) return true;
  const words = phrase.split(" ");
  /*
   * "Tattoos" and "Jewelry/Accessories" are named by one distinctive word.
   * A longer heading is not named by one shared noun: "workplace" is not
   * the Safety in the Workplace section.
   */
  if (words.length > 3) return false;
  return words.some((word) => word.length >= 6 && !HEADING_STOP.has(word) && hay.includes(` ${word} `));
}

function overlapScore(answer: string, passage: string): number {
  const hay = new Set(wordsOf(answer).split(" ").filter((word) => word.length >= 5 && !OVERLAP_STOP.has(word)));
  const seen = new Set<string>();
  let score = 0;
  for (const word of wordsOf(passage).split(" ")) {
    if (word.length < 5 || OVERLAP_STOP.has(word) || !hay.has(word) || seen.has(word)) continue;
    seen.add(word);
    score += 1;
  }
  return score;
}

function namedHeadings(passage: ManualPassage, answer: string): string[] {
  const names = [passage.heading, ...passage.knownHeadings].filter((heading): heading is string => Boolean(heading));
  const unique: string[] = [];
  for (const heading of names) {
    if (!mentionsHeading(answer, heading)) continue;
    if (unique.some((item) => normalizeHeading(item) === normalizeHeading(heading))) continue;
    unique.push(heading);
  }
  return unique;
}

function sectionLocator(page: number, heading: string | null): string {
  return heading ? `Page ${page} — ${heading}` : `Page ${page}`;
}

function excerptForHit(heading: string | null, passage: ManualPassage): string {
  if (!heading) return passage.excerpt || passage.documentTitle;
  const at = passage.text.toLowerCase().indexOf(heading.toLowerCase());
  const slice = at >= 0 ? passage.text.slice(at) : passage.text;
  return excerptOf(heading, slice) || heading;
}

/**
 * The longest phrase a stretch shares with a passage that carries two
 * distinctive words, or one in five words or more ("are at the company's
 * discretion"). "employees are responsible for" is on the Lost and
 * Found page and "must be clean and" is every brand's shirt rule; neither
 * says which page a cell-phone or facial-hair sentence restates.
 */
const passageWords = new Map<string, string[]>();

/** A passage's words, read once per passage text. */
function wordsList(text: string): string[] {
  const cached = passageWords.get(text);
  if (cached) return cached;
  const words = wordsOf(text).split(" ").filter(Boolean);
  if (passageWords.size > 5000) passageWords.clear();
  passageWords.set(text, words);
  return words;
}

/** Whether a shared run of words is a phrase that says which page it came from. */
function restates(slice: readonly string[]): boolean {
  if (slice.join(" ").length < 16) return false;
  const distinctive = slice.filter((word) => word.length >= 5 && !OVERLAP_STOP.has(word));
  return distinctive.length >= 2 || (slice.length >= 5 && distinctive.length >= 1);
}

function restatedPhraseLength(answer: string, passage: string): number {
  const said = wordsList(answer);
  const words = wordsList(passage);
  if (said.length < 4 || words.length < 4) return 0;
  const starts = new Map<string, number[]>();
  for (let at = 0; at + 4 <= said.length; at += 1) {
    const key = said.slice(at, at + 4).join(" ");
    const list = starts.get(key);
    if (list) list.push(at);
    else starts.set(key, [at]);
  }
  let best = 0;
  for (let index = 0; index + 4 <= words.length; index += 1) {
    const hits = starts.get(words.slice(index, index + 4).join(" "));
    if (!hits) continue;
    for (const from of hits) {
      let run = 4;
      while (index + run < words.length && from + run < said.length && words[index + run] === said[from + run]) run += 1;
      /*
       * Every window inside a shared run is shared too. Take the longest
       * window (at most 14 words) that names its page.
       */
      for (let size = Math.min(14, run); size > best && size >= 4; size -= 1) {
        let found = false;
        for (let offset = 0; offset + size <= run; offset += 1) {
          if (restates(words.slice(index + offset, index + offset + size))) {
            found = true;
            break;
          }
        }
        if (found) {
          best = size;
          break;
        }
      }
    }
  }
  return best;
}

/** The best manual passages a stretch of the answer restates, by longest shared phrase. */
function restatedPassages(text: string, passages: readonly ManualPassage[]): ManualPassage[] {
  let best = 0;
  let chosen: ManualPassage[] = [];
  for (const passage of passages) {
    const phrase = restatedPhraseLength(text, passage.text);
    /*
     * "yoga pants, joggers or sweats are" is also the never-worn rule on the
     * next sheet. The stretch that continues "approved for instructors only"
     * restates the longer phrase, so the shorter copy is not a second page.
     */
    if (phrase < 4 || phrase < best) continue;
    if (phrase > best) {
      best = phrase;
      chosen = [];
    }
    chosen.push(passage);
  }
  return chosen;
}

/**
 * A page the model wrote is kept, when no passage shares a phrase with the
 * stretch, only if a passage on that page shares at least four distinctive
 * words with it. A shared noun ("employee", "management") is not enough.
 */
function confirmedModelPages(
  text: string,
  pages: readonly number[],
  passages: readonly ManualPassage[],
): ManualPassage[] {
  const kept: ManualPassage[] = [];
  for (const page of pages) {
    let best: ManualPassage | null = null;
    let bestScore = 0;
    for (const passage of passages) {
      if (passage.printedPage !== page) continue;
      const score = overlapScore(text, passage.text);
      if (score > bestScore) {
        best = passage;
        bestScore = score;
      }
    }
    if (best && bestScore >= 4) kept.push(best);
  }
  return kept;
}

/**
 * With no shared phrase and no confirmed model page, one passage that shares
 * five or more distinctive words, on a page no other passage ties, is the
 * section ("no dangling earrings/chains" is Jewelry/Accessories). A tie
 * between pages is not a citation.
 */
function closestPassage(text: string, passages: readonly ManualPassage[]): ManualPassage[] {
  let best: ManualPassage[] = [];
  let bestScore = 0;
  for (const passage of passages) {
    const score = overlapScore(text, passage.text);
    if (score < 5 || score < bestScore) continue;
    if (score > bestScore) {
      bestScore = score;
      best = [];
    }
    best.push(passage);
  }
  return new Set(best.map((passage) => passage.printedPage)).size === 1 ? best.slice(0, 1) : [];
}

const PRINTED_MARKER = /[^\S\n]*\[p\.(\d{1,3})\]/gi;

/** "expense[p.15]and" keeps a space between the two words. */
function withoutPrintedMarkers(text: string): string {
  const bare = text.replace(/[^\S\n]*\[p\.\d{1,3}\]/gi, (full, offset: number, whole: string) =>
    /^[\p{L}\p{N}]/u.test(whole.slice(offset + full.length)) && offset > 0 ? " " : "",
  );
  return /^[^\S\n]*\[p\.\d{1,3}\]/i.test(text) ? bare.trimStart() : bare;
}

/**
 * One line of the answer cut into stretches at sentence ends. The text
 * between stretches is kept as it was, so joining them gives the line back.
 */
function stretchesOf(line: string): { text: string; gap: string }[] {
  const parts = line.split(/((?<=[.!?])[^\S\n]+)/);
  const stretches: { text: string; gap: string }[] = [];
  for (let at = 0; at < parts.length; at += 2) {
    stretches.push({ text: parts[at] ?? "", gap: parts[at + 1] ?? "" });
  }
  return stretches;
}

/** Markers go before the stretch's closing punctuation, or at its end. */
function markStretch(text: string, pages: readonly number[]): string {
  if (pages.length === 0) return text;
  const markers = [...pages].sort((left, right) => left - right).map((page) => `[p.${page}]`).join(" ");
  const closing = text.match(/[.!?:;]+["'”’)*_]*$/);
  if (closing && closing.index !== undefined && closing.index > 0) {
    return `${text.slice(0, closing.index).trimEnd()} ${markers}${text.slice(closing.index)}`;
  }
  return `${text.trimEnd()} ${markers}`;
}

/**
 * A policy answer cites a printed page only where it restates that page.
 *
 * The answer is read one sentence (or bullet line) at a time. Every [p.N]
 * is taken off and written again only for a page whose passage that
 * sentence restates; a page the model chose stays when that page's text
 * still matches the sentence. No word, line break or bullet is changed:
 * only [p.N] markers are removed or added. 24 Oct 2026, f8759f6: the
 * model's +1 pages were kept, pages 10, 18, 20 and 29 were added to one
 * sentence from shared words alone, and each of those pages became a
 * Sources row.
 *
 * An [S#] that is not one of `shownMarkers` is removed, so [S9] cannot sit
 * beside a shorter source list. When no sentence restates the manual, `ok`
 * is false and the caller falls back to ordinary retrieval.
 */
export function citePolicyAnswer(
  answer: string,
  plan: Pick<FullManualPlan, "index" | "passages">,
  shownMarkers: readonly number[] = [],
): CitedManualAnswer {
  const index = plan.index;
  const cleaned = alignSourceMarkers(normalizeMarkers(answer), shownMarkers);
  if (!index) return { text: cleaned, sources: [], ok: false };

  const hits: { passage: ManualPassage; heading: string | null; score: number }[] = [];
  const addHit = (passage: ManualPassage, text: string) => {
    const score = restatedPhraseLength(text, passage.text) * 10 + overlapScore(text, passage.text);
    const names = namedHeadings(passage, text);
    for (const heading of names.length > 0 ? names : [passage.heading]) {
      const key = `${passage.documentId}:${passage.printedPage}:${normalizeHeading(heading ?? "")}`;
      const existing = hits.findIndex(
        (hit) => `${hit.passage.documentId}:${hit.passage.printedPage}:${normalizeHeading(hit.heading ?? "")}` === key,
      );
      /*
       * The same heading is printed for more than one brand. Keep the passage
       * the answer actually restates, not the first copy in the manual.
       */
      if (existing >= 0) {
        if (score > hits[existing]!.score) hits[existing] = { passage, heading, score };
        continue;
      }
      hits.push({ passage, heading, score });
    }
  };

  const marked = cleaned
    .split("\n")
    .map((line) =>
      stretchesOf(line)
        .map(({ text, gap }) => {
          const written = [...text.matchAll(PRINTED_MARKER)].map((match) => Number(match[1]));
          const bare = withoutPrintedMarkers(text);
          // A stretch that was only markers ("till [p.19]. [p.20]") leaves nothing, not a gap.
          if (!bare.trim()) return text.trim() ? "" : `${text}${gap}`;
          let restated = restatedPassages(bare, plan.passages);
          if (restated.length === 0) {
            const modelPages = [...new Set(written)].filter((page) => index.pages.has(page));
            restated = confirmedModelPages(bare, modelPages, plan.passages);
          }
          if (restated.length === 0) restated = closestPassage(bare, plan.passages);
          const meaningful = restated.filter((passage) => !(passage.printedPage === 1 && !passage.heading));
          for (const passage of meaningful) addHit(passage, bare);
          const pages = [...new Set(meaningful.map((passage) => passage.printedPage))];
          return `${markStretch(bare, pages)}${gap}`;
        })
        .join("")
        .replace(/[^\S\n]+$/, ""),
    )
    .join("\n");

  if (hits.length === 0) return { text: cleaned, sources: [], ok: false };

  const sources: FullManualSource[] = hits.map((hit, marker) => ({
    marker: marker + 1,
    documentId: hit.passage.documentId,
    documentTitle: hit.passage.documentTitle,
    locator: sectionLocator(hit.passage.printedPage, hit.heading),
    excerpt: excerptForHit(hit.heading, hit.passage),
    category: hit.passage.category,
    printedPage: hit.passage.printedPage,
  }));

  return { text: marked, sources, ok: true };
}
