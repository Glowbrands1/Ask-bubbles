import { describe, expect, it } from "vitest";

import manual151 from "@/test/fixtures/jba-manual-production-151.json";
import live from "@/test/fixtures/bubbles-live-policy-answers-oct24.json";
import liveB2 from "@/test/fixtures/bubbles-live-policy-answers-oct24-b2.json";
import liveStep3 from "@/test/fixtures/bubbles-live-policy-answers-oct24-step3.json";
import { manualChunkFromRow, type ManualChunkRow } from "@/lib/knowledge/full-manual-load";

import { citePolicyAnswer, planFullManualContext, type FullManualDocument } from "./full-manual-context";

/**
 * The whole production JBA Policy Manual (151 rows), read the way
 * full-manual-load.ts reads them, and the replies production saved for the
 * dress-code and cell-phone questions on 24 Oct 2026.
 *
 * Printed pages are checked against two sources, not against the code:
 * the manual's own table of contents (knowledge_chunks_toc_backup_20261024)
 * lists Dress Code 15, Crunch Fitness 16, Buff City Soap 16, Sun Tan City 17,
 * Cell Phone 19, Company Email Account 19 and Point of Sale and Alarm
 * Passwords 20; and the footer export in jba-manual-brand-chunks.json puts
 * "17 | P a g e" before chunk 50's opening lines ("No patches…", the Buff
 * City Soap pants lines), so those lines are printed on page 17, as stored.
 */

const DRESS_CODE = "What is the dress code policy for Buff City Soap and Crunch?";
const CELL_PHONE = "What is the cell phone policy?";

const rows = manual151;
const BUBBLES_DOCUMENT_ID = manual151.document_ids["ask-bubbles"];

function productionManual(): FullManualDocument {
  return {
    id: BUBBLES_DOCUMENT_ID,
    title: "2025 JBA Policy Manual - Edited 5-2025",
    category: "policies_compliance",
    status: "indexed",
    indexed: true,
    chunks: (rows.chunks as ManualChunkRow[]).map(manualChunkFromRow),
  };
}

function reply(conversationId: string): string {
  const found = live.answers.find((answer) => answer.conversationId === conversationId);
  if (!found) throw new Error(`missing live reply ${conversationId}`);
  return found.content;
}

function markerBefore(text: string, snippet: string): number | null {
  const at = text.indexOf(snippet);
  expect(at, snippet).toBeGreaterThan(-1);
  const markers = [...text.slice(0, at).matchAll(/\[p\.(\d{1,3})\]/g)];
  const last = markers[markers.length - 1];
  return last ? Number(last[1]) : null;
}

/** The answer's words, in order, without [p.N] markers. */
function wordsInOrder(text: string): string[] {
  return text
    .replace(/\[p\.\d{1,3}\]/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
}

function pagesIn(text: string): Set<number> {
  return new Set([...text.matchAll(/\[p\.(\d{1,3})\]/g)].map((match) => Number(match[1])));
}

/** The output line that holds `snippet`, with its markers. */
function lineWith(text: string, snippet: string): string {
  const line = text.split("\n").find((part) => part.includes(snippet));
  expect(line, snippet).toBeTruthy();
  return line!;
}

function expectSameWordsAndLines(input: string, output: string) {
  expect(wordsInOrder(output)).toEqual(wordsInOrder(input));
  expect(output.split("\n").length).toBe(input.split("\n").length);
}

describe("production manual rows", () => {
  it("are the stored rows, with no footer in the text", () => {
    // Chunks 2-16 were the contents pages, deleted on 24 Oct 2026 (backup in knowledge_chunks_toc_backup_20261024).
    expect(rows.chunks.map((row) => row.chunk_index)).toEqual([0, 1, ...Array.from({ length: 149 }, (_, at) => 17 + at)]);
    for (const row of rows.chunks) {
      expect(row.content).not.toMatch(/\d+\s*\|\s*P\s*a\s*g\s*e/i);
      if (row.metadata.printedPage) expect(row.page).toBe(row.metadata.printedPage + 1);
    }
    const chunk = (index: number) => rows.chunks.find((row) => row.chunk_index === index)!;
    expect(chunk(46).locator).toBe("Pages 15–16 — Hair");
    expect(chunk(46).metadata.sections).toEqual([
      { page: 15, heading: "Hair" },
      { page: 16, heading: "Facial Hair" },
      { page: 16, heading: "Make-up" },
    ]);
    expect(chunk(50).metadata.printedPage).toBe(17);
    expect(chunk(50).content.startsWith("o No patches, rips, or holes are to be noticeable on the shirt.")).toBe(true);
    expect(chunk(62).metadata.sections).toEqual([
      { page: 19, heading: "Company Email Account" },
      { page: 20, heading: "Point of Sale and Alarm Passwords" },
    ]);
  });

  it.each([DRESS_CODE, CELL_PHONE])("marks every section on the page the manual prints it (%s)", (question) => {
    const text = planFullManualContext({ question, documents: [productionManual()] }).cachedBlock ?? "";
    expect(markerBefore(text, "Dress Code for The Company")).toBe(15);
    expect(markerBefore(text, "Hair\no Hair of all lengths")).toBe(15);
    expect(markerBefore(text, "Facial Hair\n")).toBe(16);
    expect(markerBefore(text, "Make-up\n")).toBe(16);
    expect(markerBefore(text, "Jewelry/Accessories")).toBe(16);
    expect(markerBefore(text, "Crunch Fitness Specific Dress Code:")).toBe(16);
    expect(markerBefore(text, "Buff City Soap:")).toBe(16);
    expect(markerBefore(text, "Any BCS Employee can wear any plain black")).toBe(16);
    expect(markerBefore(text, "o Full length black or blue jean-colored pants are acceptable.\n")).toBe(17);
    expect(markerBefore(text, "Sun Tan City:")).toBe(17);
    expect(markerBefore(text, "All aspects of the dress code")).toBe(17);
    expect(markerBefore(text, "Cell Phone/Smart Watch Policy")).toBe(19);
    expect(markerBefore(text, "Company Email Account")).toBe(19);
    expect(markerBefore(text, "Point of Sale and Alarm Passwords")).toBe(20);
  });
});

describe("live replies from 24 Oct 2026", () => {
  const plan = (question: string) => planFullManualContext({ question, documents: [productionManual()] });

  it("conv_mvmkij8h2vdogs9 keeps every word and line, and keeps only markers its text is printed on", () => {
    const raw = reply("conv_mvmkij8h2vdogs9");
    const cited = citePolicyAnswer(raw, plan(DRESS_CODE));
    expect(cited.ok).toBe(true);
    expectSameWordsAndLines(raw, cited.text);
    expect(pagesIn(lineWith(cited.text, "Name tags worn and visible"))).toEqual(new Set([15]));
    expect(pagesIn(lineWith(cited.text, "Belts dark brown or black"))).toEqual(new Set([15]));
    expect(pagesIn(lineWith(cited.text, "Facial hair is fine"))).toEqual(new Set([16]));
    expect(pagesIn(lineWith(cited.text, "Jewelry is fine"))).toEqual(new Set([16]));
    expect(pagesIn(lineWith(cited.text, "tattoos must be covered"))).toEqual(new Set([16]));
    expect(pagesIn(lineWith(cited.text, "worn under the branded apron"))).toEqual(new Set([16]));
    expect(pagesIn(lineWith(cited.text, "approved for Instructors only"))).toEqual(new Set([16]));
    expect(pagesIn(lineWith(cited.text, "blue jean-colored pants are acceptable"))).toEqual(new Set([17]));
    expect(pagesIn(lineWith(cited.text, "at The Company's discretion"))).toEqual(new Set([17]));
    for (const page of pagesIn(cited.text)) expect([15, 16, 17]).toContain(page);
    for (const page of pagesIn(cited.text)) {
      expect(cited.sources.some((source) => source.printedPage === page)).toBe(true);
    }
  });

  it("conv_mvmnp3lv2ify4m8 moves the +1 markers back and drops pages 10, 18, 20 and 29", () => {
    const raw = reply("conv_mvmnp3lv2ify4m8");
    const cited = citePolicyAnswer(raw, plan(DRESS_CODE));
    expect(cited.ok).toBe(true);
    expectSameWordsAndLines(raw, cited.text);
    expect(pagesIn(lineWith(cited.text, "Name tags worn and visible"))).toEqual(new Set([15]));
    expect(pagesIn(lineWith(cited.text, "Tennis shoes or other full-coverage"))).toEqual(new Set([15]));
    expect(pagesIn(lineWith(cited.text, "Belts must be dark brown or black"))).toEqual(new Set([15]));
    expect(pagesIn(lineWith(cited.text, "Hair of all lengths and colors"))).toEqual(new Set([15]));
    expect(pagesIn(lineWith(cited.text, "Jewelry is fine"))).toEqual(new Set([16]));
    expect(pagesIn(lineWith(cited.text, "worn under the branded apron"))).toEqual(new Set([16]));
    expect(pagesIn(lineWith(cited.text, "two uniform shirts provided at hire"))).toEqual(new Set([16]));
    expect(pagesIn(lineWith(cited.text, "approved for Instructors ONLY"))).toEqual(new Set([16]));
    expect(pagesIn(lineWith(cited.text, "blue jean-colored pants are acceptable"))).toEqual(new Set([17]));
    expect(pagesIn(lineWith(cited.text, "all aspects of dress code"))).toEqual(new Set([17]));
    for (const page of [10, 18, 20, 29]) {
      expect(pagesIn(cited.text).has(page)).toBe(false);
      expect(cited.sources.some((source) => source.printedPage === page)).toBe(false);
    }
  });

  it("conv_mvmkj5v72w5x3l5 cites the cell-phone policy on p.19, the driving rule on p.32, and nothing from chunk 62", () => {
    const raw = reply("conv_mvmkj5v72w5x3l5");
    const cited = citePolicyAnswer(raw, plan(CELL_PHONE));
    expect(cited.ok).toBe(true);
    expectSameWordsAndLines(raw, cited.text);
    expect(pagesIn(cited.text)).toEqual(new Set([19, 32]));
    expect(pagesIn(lineWith(cited.text, "must be kept out of sight"))).toEqual(new Set([19]));
    // The reply's closing note restates Driver Safety Rules, printed on 32 (checked in the PDF).
    expect(pagesIn(lineWith(cited.text, "separate rule for driving"))).toEqual(new Set([32]));
    expect(cited.sources.length).toBeGreaterThan(0);
    for (const source of cited.sources) {
      expect(source.locator === "Page 19 — Cell Phone/Smart Watch Policy" || source.printedPage === 32).toBe(true);
    }
    const body = cited.sources.map((source) => `${source.locator}\n${source.excerpt}`).join("\n");
    expect(body).not.toMatch(/Company Email|Point of Sale|alarm codes/i);
  });

  it("conv_mvmnpmj55lrm0ny drops pages 9, 12, 14, 20, 26, 31 and 48 from the cell-phone answer", () => {
    const raw = reply("conv_mvmnpmj55lrm0ny");
    const cited = citePolicyAnswer(raw, plan(CELL_PHONE));
    expect(cited.ok).toBe(true);
    expectSameWordsAndLines(raw, cited.text);
    expect(pagesIn(cited.text)).toEqual(new Set([19]));
    expect(pagesIn(lineWith(cited.text, "must be kept out of sight"))).toEqual(new Set([19]));
    const body = cited.sources.map((source) => `${source.locator}\n${source.excerpt}`).join("\n");
    expect(body).not.toMatch(/Company Email|Point of Sale|alarm codes/i);
    expect(cited.sources.every((source) => source.printedPage === 19)).toBe(true);
  });

  it("is unchanged when its own output is cited again, as server-ask does after the self-check", () => {
    for (const [conversationId, question] of [
      ["conv_mvmkij8h2vdogs9", DRESS_CODE],
      ["conv_mvmnpmj55lrm0ny", CELL_PHONE],
    ] as const) {
      const once = citePolicyAnswer(reply(conversationId), plan(question));
      const twice = citePolicyAnswer(once.text, plan(question));
      expect(twice.text).toBe(once.text);
      expect(twice.sources.map((source) => source.locator)).toEqual(once.sources.map((source) => source.locator));
    }
  });
});

/**
 * QA, 24 Oct 2026: the stray pages in the live replies (9, 10, 12, 14, 18,
 * 20, 26, 29, 31, 48) come from sections outside the dress code and cell
 * phone policy, so only the whole manual shows they are gone. The driving
 * rule the 15:43 cell-phone reply mentions is Driver Safety Rules, printed
 * on 32.
 */
describe("live replies against the whole manual", () => {
  const cases = [
    ["conv_mvmkij8h2vdogs9", [15, 16, 17]],
    ["conv_mvmnp3lv2ify4m8", [15, 16, 17]],
    ["conv_mvmkj5v72w5x3l5", [19, 32]],
    ["conv_mvmnpmj55lrm0ny", [19]],
  ] as const;

  it.each(cases)("%s cites only pages %j, in the text and in Sources", (conversationId, allowed) => {
    const found = live.answers.find((answer) => answer.conversationId === conversationId)!;
    const plan = planFullManualContext({ question: found.question, documents: [productionManual()] });
    const cited = citePolicyAnswer(found.content, plan);
    expect(cited.ok).toBe(true);
    expectSameWordsAndLines(found.content, cited.text);
    for (const page of pagesIn(cited.text)) expect(allowed).toContain(page);
    for (const source of cited.sources) expect(allowed).toContain(source.printedPage);
    expect(pagesIn(cited.text).has(allowed[0])).toBe(true);
  });
});

/**
 * QA P0, 24 Oct 2026 (live round B2, conv_mvmzil682z73liv): "It's the
 * employee's responsibility to protect the guest experience — texting, phone
 * calls, or social media use while working jeopardizes that" was cited on
 * pages 9, 14, 26, 31 and 48, each a Sources row. "the employee's
 * responsibility to" is printed on all of them; the page this restates is
 * the Cell Phone/Smart Watch Policy on 19 ("It is the Employee's personal
 * responsibility to protect the client's experience … texting … social media
 * … jeopardizes"). A phrase printed on three or more pages says nothing about
 * which page a sentence restates.
 */
describe("boilerplate phrases cite no page (QA P0, live round B2)", () => {
  const b2 = (conversationId: string) => {
    const found = liveB2.answers.find((answer) => answer.conversationId === conversationId);
    if (!found) throw new Error(`missing live reply ${conversationId}`);
    return found;
  };
  const SENTENCE =
    "It's the employee's responsibility to protect the guest experience — texting, phone calls, or social media use while working jeopardizes that.";

  it("the cell-phone sentence cites page 19 only", () => {
    const plan = planFullManualContext({ question: CELL_PHONE, documents: [productionManual()] });
    const cited = citePolicyAnswer(SENTENCE, plan);
    expect(pagesIn(cited.text)).toEqual(new Set([19]));
    expect(cited.sources.every((source) => source.printedPage === 19)).toBe(true);
  }, 20_000);

  it("the whole B2 cell-phone reply cites page 19 only, with the same words and lines", () => {
    const found = b2("conv_mvmzil682z73liv");
    const cited = citePolicyAnswer(found.content, planFullManualContext({ question: found.question, documents: [productionManual()] }));
    expectSameWordsAndLines(found.content, cited.text);
    expect(pagesIn(cited.text)).toEqual(new Set([19]));
    expect(pagesIn(lineWith(cited.text, "protect the guest experience"))).toEqual(new Set([19]));
    expect(cited.sources.every((source) => source.printedPage === 19)).toBe(true);
  }, 20_000);

  it("no sentence of the B2 dress-code and PTO replies carries more than two pages", () => {
    for (const conversationId of ["conv_mvmzj1sr2u4yqex", "conv_mvmzj2142hdb365"]) {
      const found = b2(conversationId);
      const cited = citePolicyAnswer(found.content, planFullManualContext({ question: found.question, documents: [productionManual()] }));
      expectSameWordsAndLines(found.content, cited.text);
      for (const line of cited.text.split("\n")) {
        for (const sentence of line.split(/(?<=[.!?])\s+/)) expect(pagesIn(sentence).size, sentence).toBeLessThanOrEqual(2);
      }
    }
  }, 20_000);

  it("the B2 dress-code reply cites the dress code on 15, 16 and 17 only", () => {
    const found = b2("conv_mvmzj1sr2u4yqex");
    const cited = citePolicyAnswer(found.content, planFullManualContext({ question: found.question, documents: [productionManual()] }));
    for (const page of pagesIn(cited.text)) expect([15, 16, 17]).toContain(page);
  }, 20_000);

  it("the B2 PTO reply cites PTO on 41 and 42 only", () => {
    const found = b2("conv_mvmzj2142hdb365");
    const cited = citePolicyAnswer(found.content, planFullManualContext({ question: found.question, documents: [productionManual()] }));
    for (const page of pagesIn(cited.text)) expect([41, 42]).toContain(page);
  }, 20_000);
});

/**
 * QA B-list, 25 Oct 2026 (live step 3 and round B2, FULL_MANUAL_CONTEXT on):
 *   - "[p.16-17] [p.16]": the model's range marker was kept beside the page
 *     the sentence restates.
 *   - "Page 15 — Anyone": a sentence's first word was used as the heading.
 *   - "the prior coaching reference [p.36]" kept Time Records because the
 *     sentence shared four ordinary words with that page; a manager's note
 *     is not a page.
 *   - The peak-season bullet ("Buff City Soap Nov 1 and Dec 31") cited
 *     nothing: the manual spells the months out.
 */
describe("QA B-list: ranges, heading fragments, loose model pages, month names", () => {
  const step3 = (conversationId: string) => {
    const found = liveStep3.answers.find((answer) => answer.conversationId === conversationId);
    if (!found) throw new Error(`missing live reply ${conversationId}`);
    return found;
  };
  const planFor = (question: string) => planFullManualContext({ question, documents: [productionManual()] });

  it("a range marker is a marker: the shirt bullet cites each page once, and the dress-code note is not labelled 'Anyone'", () => {
    const found = step3("conv_mvmzl40e2dxpgej");
    const cited = citePolicyAnswer(found.content, planFor(DRESS_CODE));
    expectSameWordsAndLines(found.content.replace(/\[p\.\d+-\d+\]/g, ""), cited.text);
    expect(cited.text).not.toMatch(/\[p\.\d+-\d+\]/);
    const shirts = lineWith(cited.text, "Buff City Soap shirts");
    expect(shirts.match(/\[p\.16\]/g)?.length ?? 0).toBeLessThanOrEqual(1);
    for (const page of pagesIn(shirts)) expect([16, 17]).toContain(page);
    expect(pagesIn(lineWith(cited.text, "Anyone violating"))).toEqual(new Set([15]));
    expect(cited.sources.map((source) => source.locator)).not.toContain("Page 15 — Anyone");
  }, 20_000);

  /*
   * Live, this reply came from the retrieval fallback (no sentence restated
   * the manual, so server-ask asked again with ordinary retrieval and the
   * model cited the Time Records chunk). The manual pass itself must not
   * find a page for it: five shared words out of seventeen ("scheduled",
   * "minutes", "employee", "payroll", …) are not the section.
   */
  it("a manager's prior-coaching note restates no page of the manual", () => {
    const found = step3("conv_mvmznap42vcw0dl");
    const plan = planFor(found.question);
    const cited = citePolicyAnswer(found.content.replace(/ \[p\.36\]/, ""), plan);
    expect(pagesIn(lineWith(cited.text, "the prior coaching reference")).size).toBe(0);
    expect(cited.sources.map((source) => source.locator)).not.toContain("Page 36 — Time Records");
    // With the model's own [p.36], the page is still not confirmed.
    expect(citePolicyAnswer(found.content, plan).sources.map((source) => source.printedPage)).not.toContain(36);
  }, 20_000);

  it('"Nov 1 and Dec 31" is the manual\'s "November 1 and December 31": the peak-season bullet cites p.42', () => {
    const found = liveB2.answers.find((answer) => answer.conversationId === "conv_mvmzj2142hdb365")!;
    const cited = citePolicyAnswer(found.content, planFor(found.question));
    expect(pagesIn(lineWith(cited.text, "peak season"))).toEqual(new Set([42]));
  }, 20_000);
});
