import { afterEach, describe, expect, it, vi } from "vitest";

import manual151 from "@/test/fixtures/jba-manual-production-151.json";

import type { ManualChunk } from "./official-policy-manual";
import { headingWithPrintedPage, printedPageLabel, withPolicyPagesOnCard } from "./policy-page-on-card";

/**
 * POLICY_PAGE_ON_CARD_ENABLED, the reader under it. The pages are checked
 * against the production JBA Policy Manual rows (all 151, md5-verified against
 * both apps' databases), not against the code: Standards of Conduct is printed
 * on page 12 (PDF sheet 13), Late Opening on 15 (sheet 16), the Cell
 * Phone/Smart Watch Policy on 19 (sheet 20).
 */

type Row = (typeof manual151.chunks)[number];

const CHUNKS: ManualChunk[] = (manual151.chunks as Row[]).map((row) => ({
  chunkIndex: row.chunk_index,
  page: row.page,
  printedPage: row.metadata.printedPage ?? null,
  content: row.content,
  section: row.section,
  sections: row.metadata.sections,
  locator: row.locator,
}));

describe("printed page for a manual heading (production manual)", () => {
  it.each([
    ["Standards of Conduct", "p.12"],
    ["Late Opening", "p.15"],
    ["Cell Phone/Smart Watch Policy", "p.19"],
    ["Attendance", "p.14"],
    ["Animals in the Workplace", "p.30"],
    // The app's own section for the Dress Code box is "Dress Code for The Company" (OFFENSE_MANUAL_SECTIONS),
    // printed on page 15 (chunk 44, PDF sheet 16): the page Direct policy cites on the draft.
    ["Dress Code", "p.15"],
  ])("%s is %s, the printed page and not the PDF sheet", (heading, label) => {
    expect(printedPageLabel(heading, CHUNKS)).toBe(label);
  });

  it("a heading whose own chunk runs over two printed pages is a range", () => {
    // Chunk 89: locator "Pages 26–27 — Employee Injury/Illness in the Workplace & Related Accommodations".
    expect(printedPageLabel("Employee Injury/Illness in the Workplace & Related Accommodations", CHUNKS)).toBe("pp.26–27");
  });

  it("a policy the manual has no section for gets no page", () => {
    expect(printedPageLabel("Violation of Company Policies", CHUNKS)).toBeNull();
    expect(printedPageLabel("Under Performance", CHUNKS)).toBeNull();
    expect(printedPageLabel("Visitors at Work", CHUNKS)).toBeNull();
  });

  it("a heading printed twice gets the page of the occurrence the app cites; one without a page gets none", () => {
    const twice: ManualChunk[] = [
      { chunkIndex: 0, page: 4, printedPage: 3, content: "", sections: [{ heading: "Breaks", page: 3 }] },
      { chunkIndex: 1, page: 10, printedPage: 9, content: "", sections: [{ heading: "Breaks", page: 9 }] },
    ];
    // findManualSection takes the first sheet the heading is printed on; Direct policy cites the same one.
    expect(printedPageLabel("Breaks", twice)).toBe("p.3");
    const none: ManualChunk[] = [{ chunkIndex: 0, page: 4, content: "", sections: [{ heading: "Breaks", page: 0 }] }];
    expect(printedPageLabel("Breaks", none)).toBeNull();
  });

  it("keeps the heading exactly as the app wrote it", () => {
    expect(headingWithPrintedPage("Standards of Conduct", CHUNKS)).toBe("Standards of Conduct (JBA Policy Manual p.12)");
  });
});

describe("the card's own policy lines get the page; nothing else changes", () => {
  it("the remap card line (QA: Policy: Standards of Conduct, no page)", () => {
    const card = [
      "Here is the Corrective Action Form.",
      "**Employee:** Test Employee",
      "**What happened:** Failed to acknowledge policies in woven by the 10-15-26 deadline",
      "**Policy:** Standards of Conduct, as you said",
      "",
      "What is their job title?",
    ].join("\n");
    expect(withPolicyPagesOnCard(card, CHUNKS)).toBe(
      card.replace("**Policy:** Standards of Conduct, as you said", "**Policy:** Standards of Conduct (JBA Policy Manual p.12), as you said"),
    );
  });

  it("the proposal's policy line, a bare Late Opening line and a 'reads as' line", () => {
    expect(
      withPolicyPagesOnCard(
        "**Policy:** Late Opening, as you said. I'll quote that section from the current policy manual on the draft.",
        CHUNKS,
      ),
    ).toBe(
      "**Policy:** Late Opening (JBA Policy Manual p.15), as you said. I'll quote that section from the current policy manual on the draft.",
    );
    expect(withPolicyPagesOnCard("**Policy:** Late Opening", CHUNKS)).toBe("**Policy:** Late Opening (JBA Policy Manual p.15)");
    expect(
      withPolicyPagesOnCard("**Policy:** this reads as **Standards of Conduct** — a required deadline that was missed.", CHUNKS),
    ).toBe("**Policy:** this reads as **Standards of Conduct** (JBA Policy Manual p.12) — a required deadline that was missed.");
  });

  it("the Dress Code line gets the page of the section the app cites (QA follow-up, 25 Oct 2026)", () => {
    expect(withPolicyPagesOnCard("**Policy:** Dress Code, as you said", CHUNKS)).toBe(
      "**Policy:** Dress Code (JBA Policy Manual p.15), as you said",
    );
  });

  it("never alters the manager's words, a line that already has a page, or a name without one page", () => {
    const unchanged = [
      '**Policy:** "visitors at work", as you said. I\'ll look for that section in the current policy manual.',
      "**Policy:** Standards of Conduct Policy, JBA Policy Manual p.12, as you said",
      '**Policy:** "cell phone" reads as the policy manual\'s **Cell Phone/Smart Watch Policy** (page 19).',
      "**Policy:** Violation of Company Policies, as you said. The policy manual has no single section to quote for it.",
      "**Policy:** Attendance — missing the monthly meeting is an absence from a scheduled shift.",
      "**What happened:** Standards of Conduct, as you said",
      "Policy: Standards of Conduct, as you said",
    ];
    for (const line of unchanged) expect(withPolicyPagesOnCard(line, CHUNKS)).toBe(line);
    const card = "**Policy:** Standards of Conduct, as you said";
    expect(withPolicyPagesOnCard(card, [])).toBe(card);
  });
});

// QA's Bubbles 17m live test (12 Nov 2026): WORN_CLOTHING's read-from-request Dress Code line had no page.
describe("WORN_CLOTHING_IS_DRESS_CODE_ENABLED: the read-from-request policy line gets its printed page", () => {
  const LINE = "**Policy:** Dress Code — read from this request. I'll quote that section from the current policy manual on the draft; tell me if a different policy applies.";
  afterEach(() => vi.unstubAllEnvs());

  it("on: Dress Code is p.15, said beside the heading", () => {
    vi.stubEnv("WORN_CLOTHING_IS_DRESS_CODE_ENABLED", "true");
    expect(withPolicyPagesOnCard(LINE, CHUNKS)).toBe(
      "**Policy:** Dress Code (JBA Policy Manual p.15) — read from this request. I'll quote that section from the current policy manual on the draft; tell me if a different policy applies.",
    );
  });

  it("off: the line is left as it was (no page)", () => {
    vi.stubEnv("WORN_CLOTHING_IS_DRESS_CODE_ENABLED", "");
    expect(withPolicyPagesOnCard(LINE, CHUNKS)).toBe(LINE);
  });
});

// QA's Bubbles 17q live test (12 Nov 2026): "create a CA for <B>, she rang up the wrong items on 11/9" had no page.
describe("POLICY_DASH_LINE_PAGE_ENABLED: a '<policy> — <what>' line gets its printed page", () => {
  const LINE =
    "**Policy:** Standards of Conduct — ringing up a sale inaccurately. I'll cite that section of the current policy manual, with its page, on the draft; tell me if a different policy applies.";
  afterEach(() => vi.unstubAllEnvs());

  it("on: the register-accuracy line says p.12 beside the heading", () => {
    vi.stubEnv("POLICY_DASH_LINE_PAGE_ENABLED", "true");
    expect(withPolicyPagesOnCard(LINE, CHUNKS)).toBe(
      "**Policy:** Standards of Conduct (JBA Policy Manual p.12) — ringing up a sale inaccurately. I'll cite that section of the current policy manual, with its page, on the draft; tell me if a different policy applies.",
    );
  });

  it("on: a phrase that is not one of the app's own policy names, or a line with a page, is left as it is", () => {
    vi.stubEnv("POLICY_DASH_LINE_PAGE_ENABLED", "true");
    for (const line of [
      '**Policy:** "visitors at work" — as you said.',
      "**Policy:** Other — cleaning duties left undone are recorded under Other on the Corrective Action Form, not the Standards of Conduct. Tell me if a different policy applies.",
      "**Policy:** Attendance, from what you described (\"late\") — the policy manual's section on page 14.",
    ]) {
      expect(withPolicyPagesOnCard(line, CHUNKS)).toBe(line);
    }
  });

  it("off: the line is left as it was (no page)", () => {
    vi.stubEnv("POLICY_DASH_LINE_PAGE_ENABLED", "");
    expect(withPolicyPagesOnCard(LINE, CHUNKS)).toBe(LINE);
  });
});
