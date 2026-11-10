import { afterEach, describe, expect, it, vi } from "vitest";

import { observationAccount, readCaPolicy } from "./ca-policy";
import { correctiveActionIssue } from "./incident-issue";

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

  it.each(["CA for Odalys Fenmarrow for her performance review", "CA for Odalys Fenmarrow for a performance improvement plan"])(
    "CA_PERFORMANCE_REASON: %j is not sales performance (\"performance\" must end its phrase)",
    (text) => {
      vi.stubEnv("CA_SALES_POLICY_ENABLED", "true");
      vi.stubEnv("CA_PERFORMANCE_REASON_ENABLED", "true");
      on();
      expect(readCaPolicy(text).source).not.toBe("sales_performance");
    },
  );

  it("CA_PERFORMANCE_REASON: the request it was for still is", () => {
    vi.stubEnv("CA_SALES_POLICY_ENABLED", "true");
    vi.stubEnv("CA_PERFORMANCE_REASON_ENABLED", "true");
    on();
    expect(readCaPolicy("can you write me a Ca for Odalys Fenmarrow for performance for october")).toMatchObject({ source: "sales_performance" });
  });

  it("the request's reason alone stays the Issue (QA's Bubbles round-5 gate, 8 Nov 2026)", () => {
    vi.stubEnv("CA_SALES_POLICY_ENABLED", "true");
    on();
    expect(correctiveActionIssue("I need a corrective action for Remy Calder for under performance", "Remy Calder")).toBe("under performance");
  });

  describe("ACCOUNT_PLACE_LEAD_ENABLED (QA's Bubbles round-5 final gate, 8 Nov 2026)", () => {
    it("on: \"at Store 264\" is a named place too", () => {
      on();
      vi.stubEnv("ACCOUNT_PLACE_LEAD_ENABLED", "true");
      expect(observationAccount("create a written CA for Remy Calder at Store 264 for missing the 10-15-26 woven deadline", "Remy Calder")).toBe(
        "missing the 10-15-26 woven deadline",
      );
    });

    it("on: a roster store in any case, before a comma, goes too (QA's round-6 gate)", () => {
      on();
      vi.stubEnv("ACCOUNT_PLACE_LEAD_ENABLED", "true");
      expect(observationAccount("create a ca for Remy Calder at kearney, she was late on 10-5", "Remy Calder")).toBe("she was late on 10-5");
      expect(observationAccount("create a ca for Remy Calder at west dodge rd for missing the 10-15-26 woven deadline", "Remy Calder")).toBe(
        "missing the 10-15-26 woven deadline",
      );
    });

    it.each([
      "create a ca for Remy Calder at lunch, she was rude to a guest",
      "create a ca for Remy Calder at the register, she was rude to a guest",
      "create a ca for Remy Calder in the past week, she missed two shifts",
    ])("on, negative: %j is as with the flag off (not a store)", (sentence) => {
      on();
      const before = observationAccount(sentence, "Remy Calder");
      vi.stubEnv("ACCOUNT_PLACE_LEAD_ENABLED", "true");
      expect(observationAccount(sentence, "Remy Calder")).toBe(before);
    });

    it("on: the register stays where it happened", () => {
      on();
      vi.stubEnv("ACCOUNT_PLACE_LEAD_ENABLED", "true");
      expect(observationAccount("create a written CA for Remy Calder at the register for being rude to a guest", "Remy Calder")).toMatch(/^at the register/);
    });

    const SAID = "create a written CA for Wrenna Thistlecombe at West Dodge Rd for missing the 10-15-26 woven deadline";

    it("off: the request's place opens what is left (the gate's finding)", () => {
      on();
      expect(observationAccount(SAID, "Wrenna Thistlecombe")).toBe("at West Dodge Rd for missing the 10-15-26 woven deadline");
    });

    it("on: the place and the request's \"for\" go; the account is left", () => {
      on();
      vi.stubEnv("ACCOUNT_PLACE_LEAD_ENABLED", "true");
      expect(observationAccount(SAID, "Wrenna Thistlecombe")).toBe("missing the 10-15-26 woven deadline");
    });

    it("on: a performance reason after the place is still the request's, cut as before", () => {
      on();
      vi.stubEnv("ACCOUNT_PLACE_LEAD_ENABLED", "true");
      expect(observationAccount("written CA for Remy Calder at West Dodge Rd for performance, she missed her sales goals", "Remy Calder")).toBe(
        "she missed her sales goals",
      );
    });

    it.each([
      "Remy Calder was at the front desk for an hour and ignored the guests",
      "at the register she was rude for no reason",
      "create a written CA for Remy Calder for missing the 10-15-26 woven deadline",
      // coding 2's review: an account's own place or time stays; a lower-case store name is the safe miss.
      "create a written CA for Remy Calder at the register for being rude to a guest",
      "create a written CA for Remy Calder in the past week for missing two shifts",
      "create a written CA for Remy Calder from the stockroom for leaving boxes in the aisle",
      // Changed on purpose (QA's round-6 gate, 8 Nov 2026): a lower-case roster store ("at west dodge rd") is now cut too,
      // so that row moved to "a roster store in any case" above; a lower-case word that is no store stays (below).
    ])("on, negative: %j is as with the flag off", (sentence) => {
      on();
      const before = observationAccount(sentence, "Remy Calder");
      vi.stubEnv("ACCOUNT_PLACE_LEAD_ENABLED", "true");
      expect(observationAccount(sentence, "Remy Calder")).toBe(before);
    });
  });
});
