import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import manual151 from "@/test/fixtures/jba-manual-production-151.json";
import sweep from "@/test/fixtures/bubbles-live-policy-answers-oct25-sweep.json";
import { manualChunkFromRow, type ManualChunkRow } from "@/lib/knowledge/full-manual-load";

import {
  asksAboutManual,
  citePolicyAnswer,
  citeRetrievedAnswer,
  isPolicyQuestion,
  keepRestatedFallbackMarkers,
  planFullManualContext,
  planManualCitations,
  retrievedLocatorPages,
  type FullManualDocument,
} from "./full-manual-context";

/**
 * QA policy sweep, 25 Oct 2026 (Bubbles prod 7174fdc, FULL_MANUAL_CONTEXT
 * on): 71 questions, no wrong fact, but 54 replies with a JBA source and no
 * [p.N]; COBRA "not in the knowledge base"; the first PTO tier cited on p.42;
 * the jury-duty summons cited on p.48 and a sentence left reading "at, so";
 * source headings taken from the wrong section. The replies are the stored
 * ones, byte for byte (md5 checked).
 */

const BUBBLES_DOCUMENT_ID = manual151.document_ids["ask-bubbles"];

function productionManual(): FullManualDocument {
  return {
    id: BUBBLES_DOCUMENT_ID,
    title: "2025 JBA Policy Manual - Edited 5-2025",
    category: "policies_compliance",
    status: "indexed",
    indexed: true,
    chunks: (manual151.chunks as ManualChunkRow[]).map(manualChunkFromRow),
  };
}

function recorded(conversationId: string) {
  const found = sweep.answers.find((answer) => answer.conversationId === conversationId);
  if (!found) throw new Error(`missing live reply ${conversationId}`);
  return found;
}

function pagesIn(text: string): Set<number> {
  return new Set([...text.matchAll(/\[p\.(\d{1,3})\]/g)].map((match) => Number(match[1])));
}

function lineWith(text: string, snippet: string): string {
  const line = text.split("\n").find((part) => part.includes(snippet));
  expect(line, snippet).toBeTruthy();
  return line!;
}

/** The answer's words, in order, without [p.N] / [S#] markers. */
function wordsInOrder(text: string): string[] {
  return text
    .replace(/\[(?:p\.\d{1,3}(?:-\d{1,3})?|S\d{1,2})\]/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
}

/**
 * A reply answered from retrieval reaches the manager with its [S#] markers
 * taken out, so the stored text has none. The replay puts the cited row's
 * marker back after every sentence and bullet, the most the model could have
 * cited: a sentence that restates nothing must still come out unmarked.
 */
function withSourceMarker(content: string, marker = 1): string {
  return content
    .split("\n")
    .map((line) =>
      line.trim()
        ? line.replace(/([.!?:])(?=\s|$)/g, ` [S${marker}]$1`).replace(/^(- [^[]*?)$/u, `$1 [S${marker}]`)
        : line,
    )
    .join("\n");
}

const citePlan = () => planManualCitations([productionManual()]);
const fullPlan = (question: string) => planFullManualContext({ question, documents: [productionManual()] });

describe("the stored replies", () => {
  it.each(sweep.answers.map((answer) => [answer.conversationId, answer] as const))("%s is the reply production saved", (_id, answer) => {
    expect(createHash("md5").update(answer.content).digest("hex")).toBe(answer.md5);
  });

  it("the short replies were answered from retrieval: no policy word, so the manual was not in the prompt", () => {
    for (const id of ["conv_mvnq2qk32hw0pah", "conv_mvnq2i4c2o7tyfj", "conv_mvnq5p7s278vzdm", "conv_mvnq1y262zwz4jn", "conv_mvnq4dvo2i2xnfg", "conv_mvnq5wzc2zbf6f9"]) {
      const answer = recorded(id);
      expect(answer.trace.cacheReadInputTokens, id).toBe(0);
      expect(isPolicyQuestion(answer.question), answer.question).toBe(false);
      expect(answer.content).not.toMatch(/\[p\.\d/);
    }
    for (const id of ["conv_mvnq55v42a0dhaj", "conv_mvnq5u9u2kj9v06"]) {
      expect(recorded(id).trace.cacheReadInputTokens).toBeGreaterThan(0);
      expect(isPolicyQuestion(recorded(id).question)).toBe(true);
    }
  });
});

/*
 * (1) A RETRIEVED MANUAL SOURCE IS A MARKED SENTENCE. The manual pages these
 * replies restate are the sources production showed; the [p.N] now sits in
 * the sentence, and a sentence that restates nothing has none.
 */
describe("(1) a reply answered from retrieval carries its [p.N] inline", () => {
  const cases = [
    ["conv_mvnq2qk32hw0pah", [18], "Employees shouldn't park", 18, "Page 18 — Employee Parking"],
    ["conv_mvnq2i4c2o7tyfj", [15, 16], "facial hair is acceptable", 16, "Page 16 — Facial Hair"],
    ["conv_mvnq1y262zwz4jn", [12], "vaping (vapor products) is prohibited", 12, "Page 12 — Smoking/Vaping"],
  ] as const;

  it.each(cases)("%s marks the sentence it restates and names that section", (id, rowPages, snippet, page, locator) => {
    const answer = recorded(id);
    const cited = citeRetrievedAnswer(withSourceMarker(answer.content), citePlan(), (marker) => (marker === 1 ? [...rowPages] : null));
    expect(cited.ok).toBe(true);
    expect(wordsInOrder(cited.text)).toEqual(wordsInOrder(answer.content));
    expect(cited.text).not.toMatch(/\[S\d/);
    expect(pagesIn(lineWith(cited.text, snippet))).toEqual(new Set([page]));
    expect(cited.sources.map((source) => source.locator)).toEqual([locator]);
  }, 20_000);

  it("the parking reply, as the live reply read it, gains only its marker", () => {
    const answer = recorded("conv_mvnq2qk32hw0pah");
    const cited = citeRetrievedAnswer(withSourceMarker(answer.content), citePlan(), (marker) => (marker === 1 ? [18] : null));
    expect(cited.text).toBe(
      "Employees shouldn't park in the spots closest to the front of the location — those are reserved for customers [p.18].",
    );
  }, 20_000);

  it("the full-time reply marks each hours line on p.33 and leaves its closing offer unmarked", () => {
    const answer = recorded("conv_mvnq4dvo2i2xnfg");
    const cited = citeRetrievedAnswer(withSourceMarker(answer.content), citePlan(), (marker) => (marker === 1 ? [33] : null));
    for (const snippet of ["AMM/ASD/AGM", "Hourly Office Personnel", "MM/SD/GM/TSD/DM"]) {
      expect(pagesIn(lineWith(cited.text, snippet))).toEqual(new Set([33]));
    }
    expect(pagesIn(lineWith(cited.text, "Let me know"))).toEqual(new Set());
    // (5) The section the lines restate, not the first heading of the chunk ("Accident Procedures").
    expect(cited.sources.map((source) => source.locator)).toEqual(["Page 33 — Employee Classifications"]);
  }, 20_000);

  it("the maternity reply cites Maternity Leave on p.48, not Witness Duty", () => {
    const answer = recorded("conv_mvnq5wzc2zbf6f9");
    const cited = citeRetrievedAnswer(withSourceMarker(answer.content), citePlan(), (marker) => (marker === 1 ? [48] : null));
    expect(pagesIn(lineWith(cited.text, "12 weeks of unpaid"))).toEqual(new Set([48]));
    expect(pagesIn(lineWith(cited.text, "Leave Request Form has to be filled out"))).toEqual(new Set([48]));
    /*
     * The premium bullet shares "health insurance … premium payments" with
     * the Premium Payments list on p.44; the rest of the answer restates
     * p.48 by phrase, and p.48 prints the rule ("Health insurance will be
     * maintained, but the Employee is responsible for … premiums"), so the
     * answer's own page wins (citation-c, "a word match prefers the answer's
     * own page"; without it this bullet cited p.44).
     */
    expect(pagesIn(lineWith(cited.text, "Health insurance continues"))).toEqual(new Set([48]));
    expect(cited.sources.map((source) => source.locator)).toEqual(["Page 48 — Maternity Leave"]);
  }, 20_000);

  it("a source from another document keeps its [S#], and an uncited sentence is not marked", () => {
    const cited = citeRetrievedAnswer(
      "Employees shouldn't park in the spots closest to the front of the location [S1]. Check the store binder [S2]. Facial hair is acceptable as long as it is clean, well-groomed, and trimmed.",
      citePlan(),
      (marker) => (marker === 1 ? [18] : null),
    );
    expect(cited.text).toBe(
      "Employees shouldn't park in the spots closest to the front of the location [p.18]. Check the store binder [S2]. Facial hair is acceptable as long as it is clean, well-groomed, and trimmed.",
    );
  }, 20_000);

  it("a manual source the sentence does not restate leaves no marker and no source", () => {
    const cited = citeRetrievedAnswer(
      "Employees shouldn't park in the spots closest to the front of the location [S1]. Let me know if anything else comes up [S1].",
      citePlan(),
      () => [18],
    );
    expect(cited.text).toBe(
      "Employees shouldn't park in the spots closest to the front of the location [p.18]. Let me know if anything else comes up.",
    );
    expect(cited.sources.map((source) => source.printedPage)).toEqual([18]);
  }, 20_000);

  it("reads a stored locator as printed pages", () => {
    expect(retrievedLocatorPages({ locator: "Page 18 — Employee Parking", page: 19 })).toEqual([18]);
    expect(retrievedLocatorPages({ locator: "Pages 15–16 — Hair", page: 16 })).toEqual([15, 16]);
    // A locator that only repeats the PDF sheet is not a printed page.
    expect(retrievedLocatorPages({ locator: "Page 19", page: 19 })).toEqual([]);
  });
});

/*
 * (2) COBRA. The manual prints it on p.45 under "Group Health Plan
 * Continuation Coverage Under COBRA", and the assembled manual has it. The
 * live turn never loaded the manual ("What is COBRA?" names no policy word)
 * and retrieval returned no manual excerpt. The model said what it could see.
 */
describe("(2) What is COBRA?", () => {
  it("p.45 and its COBRA heading are in the assembled manual", () => {
    const plan = planFullManualContext({ question: "What is COBRA?", documents: [productionManual()], asked: true });
    expect(plan.ready).toBe(true);
    expect(plan.cachedBlock).toMatch(/\[p\.45\][\s\S]*Group Health Plan Continuation Coverage Under COBRA/);
    expect(plan.index?.headings.get(45)?.has("group health plan continuation coverage under cobra")).toBe(true);
  });

  it("the policy words alone do not load the manual for it; the wide gate does, from the printed heading", () => {
    const answer = recorded("conv_mvnq5p7s278vzdm");
    expect(planFullManualContext({ question: answer.question, documents: [productionManual()] }).ready).toBe(false);
    expect(asksAboutManual(answer.question, citePlan())).toBe(true);
  }, 20_000);

  it("the wide gate is not opened by a slot turn, a form command or a common word", () => {
    for (const question of [
      "Her name is Test Employee",
      "She works at Grand Island",
      "It happened on 10-21",
      "asdasd",
      "create a CA for team member at Kearney",
      "What is the weather today?",
    ]) {
      expect(asksAboutManual(question, citePlan()), question).toBe(false);
    }
  }, 20_000);
});

/*
 * (3) The first PTO tier is printed on p.41 (Provisions) with Eligibility.
 * The sentence restates both; read one at a time, each said less than the
 * later tiers on p.42, which took the citation.
 */
describe("(3) How much PTO does a full-time manager get in their first years?", () => {
  it("the first-tier sentence cites p.41, Eligibility and Provisions", () => {
    const answer = recorded("conv_mvnq55v42a0dhaj");
    const cited = citePolicyAnswer(answer.content, fullPlan(answer.question));
    expect(cited.ok).toBe(true);
    expect(wordsInOrder(cited.text)).toEqual(wordsInOrder(answer.content));
    expect(pagesIn(lineWith(cited.text, "in the first tier"))).toEqual(new Set([41]));
    expect(cited.sources.map((source) => source.locator)).toContain("Page 41 — Eligibility");
    // The blackout dates are the Usage section on p.42.
    expect(pagesIn(lineWith(cited.text, "peak blackout dates"))).toContain(42);
  }, 20_000);
});

/*
 * (4) The jury-duty reply. The summons sentence says "jury duty" and is
 * printed, nearly word for word, under Jury Duty (47); Witness Duty (48)
 * prints the same rule two words longer. The day-limit sentence lost its
 * marker and kept "at".
 */
describe("(4) Do employees get time off for jury duty?", () => {
  const answer = recorded("conv_mvnq5u9u2kj9v06");
  // The stored reply lost "[p.47]" after "at"; this is that sentence as the model wrote it.
  const written = answer.content.replace("— at, so", "— at [p.47], so");

  it("the summons sentence cites Jury Duty on p.47", () => {
    const cited = citePolicyAnswer(answer.content, fullPlan(answer.question));
    expect(pagesIn(lineWith(cited.text, "show the summons to their supervisor"))).toEqual(new Set([47]));
    expect(cited.sources.map((source) => source.locator)).toContain("Page 47 — Jury Duty");
  }, 20_000);

  it('"at [p.47]" never becomes "at,": the word goes with a marker no page backs', () => {
    const cited = citePolicyAnswer(written, fullPlan(answer.question));
    expect(cited.text).not.toMatch(/\bat,/);
    expect(lineWith(cited.text, "specific day limit")).toContain("(The manual gives a specific day limit — 15 days, so I'll note that number is in the sources.)");
  }, 20_000);

  it("a marker the sentence reads through is re-pointed in place when the sentence restates a page", () => {
    const cited = citePolicyAnswer(
      "You will be paid your normal salary or hourly compensation for up to 15 days, as printed at [p.12].",
      fullPlan(answer.question),
    );
    expect(cited.text).toBe("You will be paid your normal salary or hourly compensation for up to 15 days, as printed at [p.47].");
  }, 20_000);

  it("(see [p.N]) with nothing restated leaves no empty brackets", () => {
    const cited = citePolicyAnswer(
      "Employees must show the jury duty summons to their supervisor as soon as possible. Ask your supervisor first (see [p.12]).",
      fullPlan(answer.question),
    );
    expect(cited.text).toBe(
      "Employees must show the jury duty summons to their supervisor as soon as possible [p.47]. Ask your supervisor first.",
    );
  }, 20_000);

  it("the retrieval fallback drops the word with a marker it drops", () => {
    expect(
      keepRestatedFallbackMarkers("Bring the prior coaching reference noted at [p.36], and the date.", fullPlan(answer.question), () => null),
    ).toBe("Bring the prior coaching reference noted, and the date.");
  }, 20_000);

  it("is unchanged when its own output is cited again", () => {
    const once = citePolicyAnswer(written, fullPlan(answer.question));
    const twice = citePolicyAnswer(once.text, fullPlan(answer.question));
    expect(twice.text).toBe(once.text);
  }, 20_000);
});

/*
 * (5) A passage at the top of a page, before its first heading, continues
 * the section above it: the rest of the PTO accrual list on p.42 is
 * Provisions, not an unlabelled "Page 42".
 */
describe("(5) source headings", () => {
  it("the later PTO tiers on p.42 are labelled Provisions", () => {
    const cited = citePolicyAnswer(
      "From 5-9 years of service in a full-time position, it is 3 weeks (120 hours), with a maximum accrual cap of 160 hours.",
      fullPlan("What is the PTO policy?"),
    );
    expect(pagesIn(cited.text)).toEqual(new Set([42]));
    expect(cited.sources.map((source) => source.locator)).toEqual(["Page 42 — Provisions"]);
  }, 20_000);
});
