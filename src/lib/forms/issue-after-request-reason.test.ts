import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { correctiveActionIssue, managerIncidentClause } from "./incident-issue";

/**
 * ISSUE_AFTER_REQUEST_REASON_ENABLED (QA's round-5 Bubbles check, 8 Nov 2026): "I need a corrective action for under
 * performance. <A> was below on …" gave "Issue: under performance". The person is invented.
 */
const ACCOUNT = "Remy Calder was below on sales per hour, add-on sales and conversion in the month of October.";
const FOR = `I need a corrective action for under performance. ${ACCOUNT}`;
const MADE_FOR = `I need a corrective action made for under performance. ${ACCOUNT}`;

describe("ISSUE_AFTER_REQUEST_REASON_ENABLED", () => {
  beforeEach(() => {
    vi.stubEnv("CA_SALES_POLICY_ENABLED", "true");
    vi.stubEnv("ISSUE_IS_THE_ACCOUNT_ENABLED", "true");
    vi.stubEnv("TYPED_NAME_ENABLED", "true");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("off (as before): the request's reason is the Issue", () => {
    expect(correctiveActionIssue(FOR, "Remy Calder")).toBe("under performance");
  });

  describe("on", () => {
    beforeEach(() => vi.stubEnv("ISSUE_AFTER_REQUEST_REASON_ENABLED", "true"));

    it("the account after the request is the Issue, with \"for\" and with \"made for\"", () => {
      for (const said of [FOR, MADE_FOR]) {
        expect(correctiveActionIssue(said, "Remy Calder"), said).toMatch(/^Remy Calder was below on sales per hour/);
        expect(managerIncidentClause(said, "Remy Calder"), said).toMatch(/^Remy Calder was below on sales per hour/);
      }
    });

    it("the reason alone stays the Issue", () => {
      expect(correctiveActionIssue("I need a corrective action for Remy Calder for under performance", "Remy Calder")).toBe("under performance");
    });

    it("an offense in the for-clause is still the Issue", () => {
      expect(correctiveActionIssue("a corrective action for late opening the store on 11/2. He opened 40 minutes late.", "Remy Calder")).toMatch(
        /^late opening the store/,
      );
    });
  });
});
