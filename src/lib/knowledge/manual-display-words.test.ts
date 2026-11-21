import { describe, expect, it } from "vitest";

import manual151 from "@/test/fixtures/jba-manual-production-151.json";
import { policyFieldValue } from "@/lib/forms/policy-citation";
import { excerptTextForDisplay } from "@/lib/knowledge/excerpt-brand-filter";
import { rowToCitation } from "@/lib/knowledge/mappers";

import { documentWordsForDisplay, manualWordsForDisplay, policyValueForDisplay } from "./manual-display-words";

/*
 * QA's live re-test (21 Nov 2026, item 7 / A5, Pau's account): "The quoted Late Opening policy text shows the word
 * "salon" in Ask Bubbles." Pau wants Bubbles never to say salon (store instead). The manual's own Late Opening text, as
 * production holds it, is shown and saved with "store"; the stored chunk, the manual's title and its heading are not
 * touched.
 */
const LATE_OPENING = manual151.chunks.find((row) => row.chunk_index === 42)!;
const TITLE = "2025 JBA Policy Manual - Edited 5-2025";

describe("the manual's words on screen (MANUAL_DISPLAY_WORDS: salon → store)", () => {
  it("production's Late Opening text says salon (the case proves something)", () => {
    expect(LATE_OPENING.locator).toBe("Page 15 — Late Opening");
    expect(LATE_OPENING.content).toMatch(/The manager of the salon will\nbe required to open the salon/);
  });

  it("whole words only, case kept, plural too", () => {
    expect(manualWordsForDisplay("The manager of the salon opens the Salon. SALONS and salons; salon's key; Salonpas stays.")).toBe(
      "The manager of the store opens the Store. STORES and stores; store's key; Salonpas stays.",
    );
  });

  it("the source card's excerpt and a form's Direct policy read store; the chunk itself is unchanged", () => {
    const before = LATE_OPENING.content;
    const card = rowToCitation({ chunk_id: "c42", document_id: "doc-manual", document_title: TITLE, category: "policies_compliance", locator: LATE_OPENING.locator, page: LATE_OPENING.page, section: LATE_OPENING.section, content: LATE_OPENING.content, similarity: 1 });
    expect(card.excerpt).not.toMatch(/\bsalon\b/i);
    expect(card.excerpt).toMatch(/The manager of the store will\nbe required to open the store/);
    expect(card.locator, "the heading is the manual's own").toBe("Page 15 — Late Opening");
    expect(excerptTextForDisplay(LATE_OPENING.content, TITLE)).not.toMatch(/\bsalon\b/i);

    // As the draft route saves a form's Direct policy: the field value, then this company's words.
    const saved = policyValueForDisplay(policyFieldValue([{ policyText: LATE_OPENING.content, documentTitle: "JBA Policy Manual", sectionTitle: "Late Opening", pageLabel: "15", documentId: "doc-manual", source: "official_policy_manual" }]), TITLE);
    expect(saved).toMatch(/open the store/);
    expect(saved).not.toMatch(/\bsalon\b/i);
    expect(saved).toContain("Source: JBA Policy Manual — Late Opening, p. 15");

    expect(LATE_OPENING.content, "the stored chunk was changed").toBe(before);
    expect(LATE_OPENING.content).toMatch(/\bsalon\b/);
  });

  it("another document's text is left as written", () => {
    expect(documentWordsForDisplay("the salon opens", "Store Opening Checklist")).toBe("the salon opens");
    expect(documentWordsForDisplay("the salon opens", TITLE)).toBe("the store opens");
  });
});
