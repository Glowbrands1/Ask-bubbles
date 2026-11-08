import { afterEach, describe, expect, it, vi } from "vitest";

import { observationAccount } from "./ca-policy";

/**
 * Ported from the sibling app (its round-4 gate, 8 Nov 2026, dropped the sales triple). With SALES_SHORTFALL_OBJECT and
 * SALES_OBSERVATION_ACCOUNT on together, the reason and a payroll answer were cut wherever they stood in the
 * Observation: "This is for Under Performance on <metrics>" became "This is on <metrics>", and "which will be payroll
 * deducted from <name>'s check" became "which will be from …". Only the request clause may be cut. This app's own
 * wording for the metrics; the people invented.
 */
function on() {
  vi.stubEnv("SALES_SHORTFALL_OBJECT_ENABLED", "true");
  vi.stubEnv("SALES_OBSERVATION_ACCOUNT_ENABLED", "true");
}

afterEach(() => vi.unstubAllEnvs());

describe("SALES_OBSERVATION_ACCOUNT keeps the manager's words", () => {
  it.each([
    "This is for Under Performance on her sales goals for October.",
    "Under Performance on her sales goals for October.",
    "which will be payroll deducted from Marnie's check.",
    "payroll deduct applies and $3.25 will be deducted from check.",
    "on 11-1-26 the register was off $20 which will be payroll deducted from Marnie's check",
  ])("%j is kept whole", (sentence) => {
    on();
    expect(observationAccount(sentence, "Remy Calder")).toBe(sentence.replace(/[\s,;:-]+$/, ""));
  });

  it.each([
    ["Remy Calder on performance", ""],
    ["performance for october not pay roll deductable", ""],
    ["can you write me a Ca for remy calder for performance for october", ""],
    ["can you write me a Ca for remy calder on performance, she missed her sales goals", "she missed her sales goals"],
  ])("only the request clause is cut: %j → %j", (sentence, account) => {
    on();
    expect(observationAccount(sentence, "Remy Calder")).toBe(account);
  });
});
