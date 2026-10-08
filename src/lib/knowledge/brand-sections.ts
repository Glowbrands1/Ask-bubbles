/**
 * ============================================================================
 * ONE BRAND'S READING OF A MULTI-BRAND POLICY MANUAL
 * ============================================================================
 *
 * The JBA Policy Manual covers every brand JB & Associates operates. Most of
 * it is company-wide, but parts apply to one brand only, and the manual says
 * so in three ways — which are the three things this module reads:
 *
 *   A SECTION MARKED FOR OTHER BRANDS   "Buddy Passes (… Employees ONLY)", the
 *                                       client tanning chapter "(… ONLY)" and
 *                                       every sub-section under it. Dropped
 *                                       from its heading to the next heading.
 *
 *   A BRAND LABEL INSIDE A SECTION      "<Brand>:" on its own (the dress code,
 *                                       the holiday lists, IT support). Opens
 *                                       a block for that brand which runs to
 *                                       the next label or section heading.
 *                                       Another brand's block is dropped; this
 *                                       company's, the corporate office's and
 *                                       "All Locations" are kept.
 *
 *   A BRAND BULLET                      "o <Brand> – MyGlow", "o <Brand>:
 *                                       50% off …". Only that bullet is
 *                                       dropped — with the lines the page
 *                                       wrapped it onto, which begin in lower
 *                                       case ("… 25% off non-" / "tanning.").
 *
 * Plus the few passages that address another brand's staff in running prose
 * (`otherBrandPassages`), which open an other-brand block until the next
 * heading.
 *
 * WHAT IS KEPT IS VERBATIM. Nothing is reworded or summarised: a line is kept
 * whole or dropped whole, so a "Direct policy from official manual" quotation
 * built from the result is still the manual's own text.
 *
 * CHUNKS ARE READ IN ORDER. A brand block can start at the end of one chunk
 * and continue into the next ("<Brand>:" closing chunk 92, its holiday list
 * opening chunk 93), so the state at the end of one chunk is the state at the
 * start of the next. Chunks overlap a little at their edges; the overlap
 * belongs to the same block as the end of the previous chunk, so carrying the
 * state forward reads it correctly.
 */

export interface ManualBrandScope {
  /**
   * Brand names whose labels, bullets and blocks are dropped — regular
   * expression SOURCES ("Crunch(?:\\s+Fitness)?"), not literal strings.
   */
  readonly otherBrands: readonly string[];
  /**
   * Label names that open a block that is KEPT: this company's brand, the
   * corporate office, "All Locations". Regular expression sources, like
   * `otherBrands`.
   */
  readonly keptLabels: readonly string[];
  /** Section headings whose whole section is dropped (exact, case-insensitive). */
  readonly excludedSections: readonly RegExp[];
  /**
   * Headings that sit INSIDE a brand block (a dress-code sub-heading) and so
   * neither open nor close one.
   */
  readonly subHeadings: readonly RegExp[];
  /** Prose that opens an other-brand passage, running to the next heading. */
  readonly otherBrandPassages: readonly RegExp[];
}

export interface ManualChunkText {
  readonly content: string;
  /** The section headings ingestion recorded for this chunk, in order. */
  readonly headings: readonly string[];
}

interface ReadState {
  sectionExcluded: boolean;
  otherBrandBlock: boolean;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The text of each chunk as this company reads it, in the same order. An
 * entry is "" when nothing in that chunk applies.
 */
export function readManualForBrand(
  chunks: readonly ManualChunkText[],
  scope: ManualBrandScope,
): string[] {
  const labelNames = [...scope.otherBrands, ...scope.keptLabels]
    .sort((a, b) => b.length - a.length)
    .map((source) => `(?:${source})`)
    .join("|");
  // "<Name>:" or "<Name> Specific Dress Code:" as a whole line.
  const LABEL = new RegExp(`^(${labelNames})(?:\\s+Specific\\s+Dress\\s+Code)?\\s*:\\s*$`, "i");
  // A label printed at the end of a sentence: "… at work. <Brand>:".
  const INLINE_LABEL = new RegExp(
    `([.!?)])[ \\t]+((?:${labelNames})(?:\\s+Specific\\s+Dress\\s+Code)?\\s*:[ \\t]*)(?=\\n|$)`,
    "gi",
  );
  const otherNames = scope.otherBrands.map((source) => `(?:${source})`).join("|");
  const OTHER_LABEL = new RegExp(`^(?:${otherNames})\\b`, "i");
  // "o <Brand> – MyGlow", "o <Brand> – January …", "o <Brand>: 50% off …"
  const OTHER_BULLET = new RegExp(`^o\\s+(?:${otherNames})\\b\\s*[–:-]`, "i");

  const state: ReadState = { sectionExcluded: false, otherBrandBlock: false };
  const isExcludedSection = (heading: string) =>
    scope.excludedSections.some((pattern) => pattern.test(heading.trim()));
  const isSubHeading = (heading: string) => scope.subHeadings.some((pattern) => pattern.test(heading.trim()));

  return chunks.map((chunk) => {
    const headings = [...new Set(chunk.headings.map((heading) => heading.trim()).filter(Boolean))];

    let text = chunk.content.replace(/\r\n?/g, "\n");
    // Put every heading the chunk carries on its own line.
    for (const heading of headings.sort((a, b) => b.length - a.length)) {
      text = text.replace(
        new RegExp(`([.!?)])[ \\t]+(${escape(heading)})(?=\\n)`, "g"),
        "$1\n$2",
      );
    }
    // Labels printed after a sentence, and bullets printed inline (". o Next").
    text = text.replace(INLINE_LABEL, "$1\n$2");
    text = text.replace(/([.!?)])[ \t]+(o[ \t]+)(?=\S)/g, "$1\n$2");
    // A passage that opens mid-line starts its own line.
    for (const passage of scope.otherBrandPassages) {
      const body = passage.source.replace(/^\^/, "");
      text = text.replace(new RegExp(`([.!?])[ \\t]+(?=${body})`, `g${passage.flags.replace("g", "")}`), "$1\n");
    }

    const kept: string[] = [];
    // True while the lines that follow are the wrapped rest of a dropped brand bullet.
    let inDroppedBullet = false;
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      // Lower case, and not the next bullet (whose marker is a lower-case "o").
      if (inDroppedBullet && /^\p{Ll}/u.test(line) && !/^o\s/.test(line)) continue;
      inDroppedBullet = false;
      if (line === "") {
        if (!state.sectionExcluded && !state.otherBrandBlock) kept.push(rawLine);
        continue;
      }

      const heading = headings.find((entry) => entry.toLowerCase() === line.toLowerCase());
      if (heading && !isSubHeading(heading)) {
        state.sectionExcluded = isExcludedSection(heading);
        state.otherBrandBlock = false;
        if (!state.sectionExcluded) kept.push(rawLine);
        continue;
      }

      const label = LABEL.exec(line);
      if (label) {
        state.otherBrandBlock = OTHER_LABEL.test(label[1]!);
        if (!state.sectionExcluded && !state.otherBrandBlock) kept.push(rawLine);
        continue;
      }

      if (scope.otherBrandPassages.some((pattern) => pattern.test(line))) {
        state.otherBrandBlock = true;
        continue;
      }

      if (OTHER_BULLET.test(line)) {
        inDroppedBullet = true;
        continue;
      }

      if (!state.sectionExcluded && !state.otherBrandBlock) kept.push(rawLine);
    }

    return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  });
}

/** True when a document title names a manual this scope applies to. */
export function isMultiBrandManual(title: string, titles: readonly RegExp[]): boolean {
  return titles.some((pattern) => pattern.test(title));
}
