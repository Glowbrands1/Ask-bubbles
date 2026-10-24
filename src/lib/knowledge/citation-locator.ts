import { pageLocator } from "@/lib/ingestion/extract/pdf-sections";

import type { ManualBrandScope } from "./brand-sections";

/**
 * A chunk after the brand filter, with the headings ingestion stored.
 *
 * `kept` is the text this company still has. `locator` and `section` are the
 * stored label, which names the first heading of the original chunk — often a
 * heading the filter has already removed.
 */
export interface KeptCitationChunk {
  readonly locator: string;
  readonly section?: string | null;
  readonly kept: string;
  readonly sections: readonly { readonly heading: string; readonly page: number }[];
}

interface LabelScan {
  readonly label: RegExp;
  readonly other: RegExp;
  readonly isSubHeading: (heading: string) => boolean;
}

function labelScan(scope: ManualBrandScope): LabelScan {
  const labelNames = [...scope.otherBrands, ...scope.keptLabels]
    .sort((a, b) => b.length - a.length)
    .map((source) => `(?:${source})`)
    .join("|");
  const otherNames = scope.otherBrands.map((source) => `(?:${source})`).join("|");
  return {
    // The same label line the brand filter keeps or drops: "<Brand>:" or
    // "<Brand> Specific Dress Code:".
    label: new RegExp(`^(${labelNames})(?:\\s+Specific\\s+Dress\\s+Code)?\\s*:\\s*$`, "i"),
    other: new RegExp(`^(?:${otherNames})\\b`, "i"),
    isSubHeading: (heading: string) => scope.subHeadings.some((pattern) => pattern.test(heading.trim())),
  };
}

function lineKey(line: string): string {
  return line.trim().replace(/\s*:\s*$/, "").replace(/\s+/g, " ").toLowerCase();
}

/**
 * Locators for chunks the brand filter has already read.
 *
 * Off, every stored locator is returned unchanged. On, each locator is the
 * first stored heading that is still a line of the kept text. A heading that
 * sits under a brand label is cited with that brand ("Page 16 — Buff City
 * Soap: Shirts") and with the page stored for that heading. A company-wide
 * heading keeps its own name, so Shoes on printed page 15 and Important Notes
 * on printed page 40 stay as they are. The kept text is not rewritten.
 */
export function locatorsAfterBrandFilter(
  enabled: boolean,
  chunks: readonly KeptCitationChunk[],
  scope: ManualBrandScope,
): string[] {
  if (!enabled) return chunks.map((chunk) => chunk.locator);
  const scan = labelScan(scope);
  let brand: string | null = null;

  return chunks.map((chunk) => {
    const pending = [...chunk.sections];
    let first: { heading: string; page: number; brand: string | null } | null = null;

    for (const raw of chunk.kept.split("\n")) {
      const line = raw.trim();
      if (line === "") continue;

      const label = scan.label.exec(line);
      if (label) {
        const name = label[1]!.replace(/\s+/g, " ").trim();
        brand = scan.other.test(name) ? null : name;
        continue;
      }

      const key = lineKey(line);
      const index = pending.findIndex((entry) => lineKey(entry.heading) === key);
      if (index < 0) continue;
      const entry = pending.splice(index, 1)[0]!;
      const sub = scan.isSubHeading(entry.heading);
      if (!first && entry.page > 0) {
        first = { heading: entry.heading, page: entry.page, brand: sub ? brand : null };
      }
      if (!sub) brand = null;
    }

    if (!first) return chunk.locator;
    const heading = first.brand ? `${first.brand}: ${first.heading}` : first.heading;
    return pageLocator(first.page, heading);
  });
}
