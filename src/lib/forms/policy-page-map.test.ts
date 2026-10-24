import { describe, expect, it } from "vitest";

import type { ManualChunk } from "@/lib/forms/official-policy-manual";

import { policyPrintedPages, printedPageForHeading } from "./policy-page-map";

const standards: ManualChunk = {
  chunkIndex: 2,
  page: 13,
  printedPage: 12,
  section: "Standards of Conduct",
  content: "Standards of Conduct\nThe company states this rule.",
  sections: [{ heading: "Standards of Conduct", page: 13 }],
};

describe("policy printed pages", () => {
  it("uses the chunk's printed page for a heading it already has", () => {
    expect(printedPageForHeading("Standards of Conduct", [standards])).toBe(12);
    expect(printedPageForHeading("standards of conduct", [standards])).toBe(12);
  });

  it("does not map a word that is not a heading", () => {
    expect(printedPageForHeading("pets", [standards])).toBeNull();
    expect(printedPageForHeading("Visitors in the Workplace", [standards])).toBeNull();
    expect(policyPrintedPages([standards]).has("pets")).toBe(false);
  });

  it("uses a section page when the chunk has no printed page", () => {
    const chunk: ManualChunk = {
      chunkIndex: 4,
      page: 0,
      section: "Attendance",
      content: "Attendance",
      sections: [{ heading: "Attendance", page: 14 }],
    };
    expect(printedPageForHeading("Attendance", [chunk])).toBe(14);
  });
});
