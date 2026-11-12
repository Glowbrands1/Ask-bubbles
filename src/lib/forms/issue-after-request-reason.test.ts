import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { incidentSplitFixEnabled } from "@/lib/config/chat-quality-flags";

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
    // Changed on purpose (QA's October triage, 10 Nov 2026): INCIDENT_SPLIT_FIX_ENABLED on (#189) keeps the request's account in whole sentences, so the sentence after the reason stays with it; flag off unchanged.
    expect(correctiveActionIssue(FOR, "Remy Calder")).toBe(incidentSplitFixEnabled() ? `under performance. ${ACCOUNT.replace(/\.$/, "")}` : "under performance");
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

    it("with CA_SALES_POLICY off no reason reads as a sales one: the Issue is as with this flag off", () => {
      vi.stubEnv("CA_SALES_POLICY_ENABLED", "");
      const on = correctiveActionIssue(FOR, "Remy Calder");
      vi.stubEnv("ISSUE_AFTER_REQUEST_REASON_ENABLED", "");
      expect(on).toBe(correctiveActionIssue(FOR, "Remy Calder"));
    });

    it("an offense in the for-clause is still the Issue", () => {
      expect(correctiveActionIssue("a corrective action for late opening the store on 11/2. He opened 40 minutes late.", "Remy Calder")).toMatch(
        /^late opening the store/,
      );
    });
  });
});

describe("ISSUE_AFTER_REQUEST_REASON_ENABLED: a turn that only corrects the policy or the level is no account (QA, 8 Nov 2026)", () => {
  // nov6-under-performance-explained-tester, the tester's two turns; the person is invented.
  const TESTER = "CA for Odalys Fenmarrow, her sales are low\n\nit should be under performance not standard of conduct";
  beforeEach(() => {
    vi.stubEnv("CA_SALES_POLICY_ENABLED", "true");
    vi.stubEnv("ISSUE_IS_THE_ACCOUNT_ENABLED", "true");
    vi.stubEnv("TYPED_NAME_ENABLED", "true");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("the tester's correction is not the Issue: it is as with the flag off", () => {
    const off = correctiveActionIssue(TESTER, "Odalys Fenmarrow");
    vi.stubEnv("ISSUE_AFTER_REQUEST_REASON_ENABLED", "true");
    expect(correctiveActionIssue(TESTER, "Odalys Fenmarrow")).toBe(off);
    expect(managerIncidentClause(TESTER, "Odalys Fenmarrow")).not.toMatch(/should be|standard of conduct/i);
    expect(off).toBe("her sales are low");
  });

  it("a correction after a reason and an account leaves the account the Issue", () => {
    vi.stubEnv("ISSUE_AFTER_REQUEST_REASON_ENABLED", "true");
    for (const correction of [
      "it should be under performance not standard of conduct",
      "actually make it a written warning",
      "not standards of conduct, under performance",
      "this should fall under attendance instead",
    ]) {
      expect(correctiveActionIssue(`${FOR}\n\n${correction}`, "Remy Calder"), correction).toMatch(/^Remy Calder was below on sales per hour/);
    }
  });

  it("a turn that names a policy and says what happened is still an account", () => {
    vi.stubEnv("ISSUE_AFTER_REQUEST_REASON_ENABLED", "true");
    // Changed on purpose (QA's October triage, 10 Nov 2026): with INCIDENT_SPLIT_FIX_ENABLED on (#189), a later turn's account
    // does not replace the one the request told; the later turn is still never read as only a correction. Flag off unchanged.
    expect(correctiveActionIssue(`${FOR}\n\nshe was 30 minutes late on 11/3, it should be attendance`, "Remy Calder")).toMatch(
      incidentSplitFixEnabled() ? /^Remy Calder was below on sales per hour/ : /30 minutes late/,
    );
  });
});
