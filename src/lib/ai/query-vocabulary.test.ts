import { describe, expect, it } from "vitest";

import { retrievalPlan } from "./continuation";
import { correctedHrWord, normalizeRetrievalQuery } from "./query-vocabulary";

describe("normalizeRetrievalQuery: shorthand is spelled out beside the word typed", () => {
  it.each([
    ["OT rules for mgrs?", "OT (overtime) rules for mgrs (managers)?"],
    ["pto carryover", "pto (paid time off) carryover"],
    ["sched swap w/ coworker", "sched (schedule) swap w/ (with) coworker"],
    ["how many sick days do PT employees get", "how many sick days do PT (part-time) employees get"],
    ["ncns policy", "ncns (no call no show) policy"],
    ["LOA request", "LOA (leave of absence) request"],
  ])("%s → %s", (typed, expanded) => {
    expect(normalizeRetrievalQuery(typed)).toBe(expanded);
  });

  it("keeps every original word, so a document that uses the shorthand still matches", () => {
    const rewritten = normalizeRetrievalQuery("OT for FT mgrs")!;
    for (const word of ["OT", "FT", "mgrs"]) expect(rewritten).toContain(word);
  });
});

describe("normalizeRetrievalQuery: HR misspellings are corrected", () => {
  it.each([
    ["attendence policy", "attendance policy"],
    ["harrasment reporting", "harassment reporting"],
    ["vacaton request", "vacation request"],
    ["resignaton notice", "resignation notice"],
    ["benifits enrollment", "benefits enrollment"],
    ["insurence", "insurance"],
  ])("%s → %s", (typed, corrected) => {
    expect(normalizeRetrievalQuery(typed)).toBe(corrected);
  });

  it("returns null when there is nothing to rewrite", () => {
    for (const question of ["what is the dress code", "Can I wear jeans?", "polite customers", "does the manager handle breaks"]) {
      expect(normalizeRetrievalQuery(question)).toBeNull();
    }
  });

  it("never 'corrects' an ordinary word that happens to be close to an HR word", () => {
    for (const word of ["polite", "manage", "absent", "medicine", "training", "transport", "employer", "personnel"]) {
      expect(correctedHrWord(word)).toBeNull();
    }
  });

  it("short words and a tie between two targets are left alone", () => {
    expect(correctedHrWord("leav")).toBeNull();
    expect(correctedHrWord("polcy")).toBeNull(); // five letters: too short to correct safely
  });
});

describe("retrievalPlan: the rewrite is an extra query, never a replacement", () => {
  it("searches the question as typed first, then the rewrite", () => {
    expect(retrievalPlan("OT rules for mgrs?", [], true).queries).toEqual([
      "OT rules for mgrs?",
      "OT (overtime) rules for mgrs (managers)?",
    ]);
  });

  it("a question with nothing to rewrite is searched once, exactly as typed", () => {
    expect(retrievalPlan("what is the dress code", [], true).queries).toEqual(["what is the dress code"]);
  });

  it("the anchored follow-up query is normalised too", () => {
    const plan = retrievalPlan(
      "can I carry it over?",
      [
        { role: "user", content: "How much PTO do I get a year?" },
        { role: "assistant", content: "It depends on tenure." },
      ],
      true,
    );
    expect(plan.anchor).toBe("How much PTO do I get a year?");
    expect(plan.fallback).toBe("How much PTO (paid time off) do I get a year?\ncan I carry it over?");
  });
});

describe("retrievalPlan: questions that point back with a pronoun", () => {
  const history = [
    { role: "user" as const, content: "How much paid time off do I get?" },
    { role: "assistant" as const, content: "It accrues each pay period." },
  ];

  it.each(["does that apply to part-timers?", "is it the same for managers?", "can I carry it over?", "is there a limit?", "what if it's a holiday?"])(
    "'%s' gets the previous question as its fallback",
    (question) => {
      expect(retrievalPlan(question, history, true).anchor).toBe("How much paid time off do I get?");
    },
  );

  it.each(["is it ok to wear jeans?", "what is the dress code?", "Can I swap shifts with a coworker?"])(
    "'%s' names its own subject and gets no fallback",
    (question) => {
      expect(retrievalPlan(question, history, true).fallback).toBeNull();
    },
  );

  it("switched off, nothing is anchored", () => {
    expect(retrievalPlan("does that apply to part-timers?", history, false).fallback).toBeNull();
  });
});
