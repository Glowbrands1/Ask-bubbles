import { describe, expect, it } from "vitest";

import { EXIT_OPTION } from "./exit-library";
import { readExitFacts } from "./exit-facts";

/*
 * QA's live re-test B6 (21 Nov 2026, Pau's account, agent loop on, production 3e2c30dd): "\"How did she leave?\" was asked
 * every turn though the manager said she gave 2 weeks' notice and is fulfilling it (= voluntary resignation with notice);
 * the separation type was never filled." QA's wording (invented names): a notice being served now is Submitted &
 * Fulfilled Notice, as a notice served already is.
 */
const TODAY = "2026-11-21";
const SAID =
  "can you make me an exit form for Brisa Quennell she is in woven under Isolda Quennell. Her last day is nov 23 she is returning her key she gave 2 weeks notice and is fulfilling them. no deduction at this time";

describe("a notice being served is a resignation with notice (B6, item 20)", () => {
  it("QA's words tick Submitted & Fulfilled Notice", () => {
    expect(readExitFacts(SAID, TODAY).noticeOptions).toEqual([EXIT_OPTION.submittedFulfilledNotice]);
  });
  it.each([
    "she gave her two weeks notice and is working it",
    "put in 2 weeks notice and is serving them",
    "she is fulfilling her two weeks notice, last day nov 23",
    "he is serving his notice",
  ])("%s", (said) => {
    expect(readExitFacts(said, TODAY).noticeOptions).toEqual([EXIT_OPTION.submittedFulfilledNotice]);
  });
  it.each([
    "she gave 2 weeks notice and is not fulfilling them",
    "she gave 2 weeks notice but never worked it",
    "she gave 2 weeks notice",
  ])("not a notice being served: %s", (said) => {
    expect(readExitFacts(said, TODAY).noticeOptions).toEqual([]);
  });
});
