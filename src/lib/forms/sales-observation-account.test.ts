import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { observationAccount } from "./ca-policy";
import { correctiveActionIssue } from "./incident-issue";

/**
 * SALES_OBSERVATION_ACCOUNT_ENABLED (port of the sibling app's flip-4 gate finding, QA 7 Nov 2026): the card's Issue holds the
 * account, never the request's words, the employee's name in front of them, or a payroll answer. QA's exact
 * shapes; the person is the pack's invented Remy Calder.
 */
const NAME = "Remy Calder";

function on() {
  vi.stubEnv("SALES_SHORTFALL_OBJECT_ENABLED", "true");
  vi.stubEnv("SALES_OBSERVATION_ACCOUNT_ENABLED", "true");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SALES_OBSERVATION_ACCOUNT_ENABLED", () => {
  it("off: the sentence as it is (the gate's finding)", () => {
    vi.stubEnv("SALES_SHORTFALL_OBJECT_ENABLED", "true");
    expect(observationAccount("Remy Calder on performance", NAME)).toBe("Remy Calder on performance");
  });

  it.each([
    ["Remy Calder on performance", ""],
    ["written CA for Remy Calder on performance", ""],
    ["performance for october not pay roll deductable", ""],
    ["can you write me a Ca for remy calder for performance for october", ""],
    ["She had 24 transactions and was below in Below in PPTA, LPSVA, average ticket, and units per transaction", "She had 24 transactions and was below in Below in PPTA, LPSVA, average ticket, and units per transaction"],
  ])("on: %s → %j", (sentence, account) => {
    on();
    expect(observationAccount(sentence, NAME)).toBe(account);
  });

  it("on, negative: an account that names her keeps her name", () => {
    on();
    expect(observationAccount("Remy Calder was rude to a guest at the front desk", NAME)).toBe("Remy Calder was rude to a guest at the front desk");
  });

  it("on, negative: a sentence about her performance review is left alone", () => {
    on();
    expect(observationAccount("She skipped her performance review twice this month", NAME)).toBe("She skipped her performance review twice this month");
  });
});

describe("SALES_OBSERVATION_ACCOUNT_ENABLED: the card's Issue (correctiveActionIssue)", () => {
  const H01 = "written CA for Remy Calder on performance";

  // Production's live CA_SALES_POLICY and TYPED_NAME are the path the card takes to this Issue.
  beforeEach(() => {
    vi.stubEnv("CA_SALES_POLICY_ENABLED", "true");
    vi.stubEnv("TYPED_NAME_ENABLED", "true");
  });

  it("SALES_SHORTFALL_OBJECT alone: the request's words are the Issue (the finding, reproduced)", () => {
    vi.stubEnv("SALES_SHORTFALL_OBJECT_ENABLED", "true");
    expect(correctiveActionIssue(H01, NAME) ?? "").toMatch(/on performance/i);
  });

  it("on: h01 has no Issue", () => {
    on();
    expect(correctiveActionIssue(H01, NAME)).toBeNull();
  });

  it("on: an account keeps its Issue", () => {
    on();
    expect(correctiveActionIssue("written CA for Remy Calder, she was rude to a guest at the register", NAME) ?? "").toMatch(/rude to a guest/);
  });
});
