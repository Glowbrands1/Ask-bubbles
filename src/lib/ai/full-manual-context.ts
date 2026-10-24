import { MULTI_BRAND_MANUAL_TITLES, POLICY_MANUAL_BRAND_SCOPE } from "@/config/company/knowledge";
import { readManualForBrand, isMultiBrandManual, type ManualBrandScope } from "@/lib/knowledge/brand-sections";
import { estimateTokens } from "@/lib/ingestion/chunking";
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
  readonly page?: number | null;
  readonly printedPage?: number | null;
  readonly section?: string | null;
  readonly headings?: readonly string[];
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
}

export interface FullManualPlan {
  readonly ready: boolean;
  readonly reason: "ready" | "over_budget" | "no_manual" | "not_policy";
  readonly tokens: number;
  readonly choice: ManualBrandChoice;
  readonly cachedBlock: string | null;
  readonly sources: readonly FullManualSource[];
  readonly index: ManualCitationIndex | null;
  /** Brand names whose rules are in the block. */
  readonly brands: readonly string[];
}

const POLICY_QUESTION =
  /\b(?:dress(?:\s*|-)?codes?|uniforms?|pto|paid\s+time\s+off|vacation(?:\s+time)?|sick(?:\s+(?:day|days|leave|time))?|polic(?:y|ies)|handbooks?|manuals?|attendance|time\s*off|holidays?|bereavement|benefits?)\b/i;

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

function printedPage(chunk: FullManualChunk): number | null {
  if (typeof chunk.printedPage === "number" && Number.isInteger(chunk.printedPage) && chunk.printedPage > 0) {
    return chunk.printedPage;
  }
  const locator = chunk.locator?.match(/\bpage\s+(\d{1,3})\b/i);
  if (locator) return Number(locator[1]);
  return null;
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

function recordHeadings(index: MutableIndex, page: number | null, text: string, known: readonly string[]): void {
  if (!page) return;
  index.pages.add(page);
  let set = index.headings.get(page);
  if (!set) {
    set = new Set();
    index.headings.set(page, set);
  }
  for (const line of text.split("\n")) {
    const heading = headingOf(line, known);
    if (heading) set.add(normalizeHeading(heading));
  }
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
export function rebuildManualText(
  chunks: readonly FullManualChunk[],
  choice: ManualBrandChoice,
): { text: string; index: ManualCitationIndex } {
  const ordered = [...chunks].sort((left, right) => left.chunkIndex - right.chunkIndex);
  const readings = readingsFor(ordered, choice);
  const index: MutableIndex = { pages: new Set(), headings: new Map() };
  const blocks: string[] = [];
  let previous = "";
  let currentPage: number | null = null;
  for (let position = 0; position < ordered.length; position += 1) {
    const chunk = ordered[position]!;
    const body = trimOverlap(previous, readings[position] ?? "");
    if (!body) continue;
    const page = printedPage(chunk);
    if (page && page !== currentPage) {
      blocks.push(`[p.${page}]`);
      currentPage = page;
      index.pages.add(page);
    }
    recordHeadings(index, currentPage, body, chunk.headings ?? []);
    blocks.push(body);
    previous = body;
  }
  return { text: blocks.join("\n\n"), index };
}

function locatorFor(choice: ManualBrandChoice): string {
  if (choice === "bcs") return "Full Buff City Soap manual";
  if (choice === "crunch") return "Full Crunch manual";
  if (choice === "stc") return `Full ${OTHER_TANNING_BRAND} manual`;
  return "Full manual";
}

function headerFor(choice: ManualBrandChoice, sources: readonly FullManualSource[]): string {
  const markers = sources.map((source) => `[S${source.marker}] ${source.documentTitle}`).join("\n");
  const coverage =
    choice === "all"
      ? "The question did not name one brand, so this text includes every brand in the manual. Cover Buff City Soap and Crunch, not only one brand."
      : "This text is that brand's manual plus the company-wide sections.";
  return `FULL POLICY MANUAL

${markers}

This is the current manual. Retired and superseded editions are not included. Pages are marked [p.N]. Cite a page only when that marker is present, and a heading only when it is printed on that page. ${coverage}`;
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
    index: null,
    brands: [],
  };
  if (!isPolicyQuestion(input.policyText ?? input.question)) return empty;

  const documents = input.documents.filter(isCurrentManual);
  if (documents.length === 0) return { ...empty, reason: "no_manual" };

  const pages: Set<number> = new Set();
  const headings: Map<number, Set<string>> = new Map();
  const parts: string[] = [];
  const sources: FullManualSource[] = documents.map((document, index) => ({
    marker: index + 1,
    documentId: document.id,
    documentTitle: document.title,
    locator: locatorFor(choice),
    excerpt: "",
    category: categoryOf(document.category),
  }));

  for (const document of documents) {
    const rebuilt = rebuildManualText(document.chunks, choice);
    for (const page of rebuilt.index.pages) pages.add(page);
    for (const [page, set] of rebuilt.index.headings) {
      const existing = headings.get(page) ?? new Set<string>();
      for (const heading of set) existing.add(heading);
      headings.set(page, existing);
    }
    parts.push(rebuilt.text);
  }

  const body = parts.filter((part) => part.trim().length > 0).join("\n\n");
  const cachedBlock = `${headerFor(choice, sources)}\n\n${body}`.trim();
  const tokens = estimateTokens(cachedBlock);
  const excerpt = body.replace(/\s+/g, " ").trim().slice(0, 320);
  const withExcerpt = sources.map((source) => ({ ...source, excerpt: excerpt || source.documentTitle }));
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
    sources: withExcerpt,
    index,
    brands,
  };
}

export function fullManualGroundingNote(plan: Pick<FullManualPlan, "sources" | "choice">): string {
  const markers = plan.sources.map((source) => `[S${source.marker}]`).join(", ");
  const coverage =
    plan.choice === "all"
      ? "The question does not name one brand. Cover every brand this manual states, including Buff City Soap and Crunch."
      : "The question names one brand. Answer from that brand's manual and the company-wide sections.";
  const listed = plan.sources
    .map((source) => `[S${source.marker}] ${source.documentTitle} — ${source.locator}`)
    .join("\n");
  return `COMPANY KNOWLEDGE

The full current policy manual is in the system prefix. Valid markers are ${markers}. Cite a page only when that page is marked [p.N] in the manual, and a heading only when that heading is printed on that page. ${coverage}

${listed}`;
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
