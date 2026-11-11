import { afterEach, describe, expect, it, vi } from "vitest";

import PRODUCTION_FLAGS from "@/config/production-flags.json";

vi.mock("server-only", () => ({}));

const { withoutRequestInObservation } = await import("./request-observation");
const { correctiveActionIssue } = await import("./incident-issue");

/*
 * QA, live, 4 Nov 2026 (CA_SALES_POLICY_ENABLED on): the card's Issue and the
 * draft's Observation of Offense were the whole request, "CA for <name> due to
 * under performance in salon metrics". The #237 audit (live, 26 Oct 2026):
 * "create a ca for <name> at <store>, she was late on 10-5 and 10-15" was the
 * Issue with the request in front. QA's wording, the people invented.
 * Rebuilds #454 behind CA_REASON_DUE_TO_ENABLED.
 */
const NAME = "Briony Fellwater";
const REQUEST = `CA for ${NAME} due to under performance in salon metrics`;
const COPIED = `Observed:\n${REQUEST}`;
const AT_STORE = "create a ca for remy calder at dodge, she was late on 10-5 and 10-15. i coached her on 10-16 about being late";

/** Production's flags (`production-flags.json`), with the fix on or off. */
function flag(on: boolean) {
  for (const name of [...PRODUCTION_FLAGS.on, ...PRODUCTION_FLAGS.assumedOn]) vi.stubEnv(name, "true");
  vi.stubEnv("CA_REASON_DUE_TO_ENABLED", on ? "true" : "false");
}
afterEach(() => vi.unstubAllEnvs());

describe("the request is not the Observation (CA_REASON_DUE_TO_ENABLED)", () => {
  it("QA's live wording: the request sentence becomes its reason", () => {
    flag(true);
    expect(withoutRequestInObservation({ observation: COPIED }, "observation", NAME)?.observation).toBe("Observed:\nUnder performance in salon metrics.");
  });

  it("\"for\" and \"because of\" read the same way; the rest of the Observation stays", () => {
    flag(true);
    expect(
      withoutRequestInObservation({ observation: `Observed:\nMSB CA for ${NAME} for underperformance in the month of October. She missed two huddles.` }, "observation", NAME)?.observation,
    ).toBe("Observed:\nUnderperformance in the month of October. She missed two huddles.");
    expect(withoutRequestInObservation({ observation: `Observed:\nCA for ${NAME} because of a register shortage on 10/20` }, "observation", NAME)?.observation).toBe(
      "Observed:\nA register shortage on 10/20.",
    );
  });

  it("\"create a ca for <name> at <store>, she was late …\": the account after the comma", () => {
    flag(true);
    expect(
      withoutRequestInObservation({ observation: "Observed:\ncreate a ca for Remy Calder at dodge, she was late on 10-5 and 10-15." }, "observation", "Remy Calder")?.observation,
    ).toBe("Observed:\nShe was late on 10-5 and 10-15.");
  });

  it("an Observation that is an account is left as it is", () => {
    flag(true);
    expect(withoutRequestInObservation({ observation: `Observed:\n${NAME} did not meet her salon metrics in October.` }, "observation", NAME)).toBeNull();
  });

  it("a request with no reason to read is left as it is", () => {
    flag(true);
    expect(withoutRequestInObservation({ observation: `Observed:\nCA for ${NAME}` }, "observation", NAME)).toBeNull();
    expect(withoutRequestInObservation({ observation: "Observed:\ncreate a ca for Remy Calder at dodge." }, "observation", "Remy Calder")).toBeNull();
  });

  it("off: unchanged", () => {
    flag(false);
    expect(withoutRequestInObservation({ observation: COPIED }, "observation", NAME)).toBeNull();
  });
});

describe("the card's Issue is the reason, not the request (CA_REASON_DUE_TO_ENABLED)", () => {
  it("QA's live wording: \"due to\" and \"because of\" join the reason", () => {
    flag(true);
    expect(correctiveActionIssue(REQUEST, NAME)).toBe("under performance in salon metrics");
    expect(correctiveActionIssue(`CA for ${NAME} because of under performance in salon metrics`, NAME)).toBe("under performance in salon metrics");
  });

  it("\"create a ca for <name> at <store>, she was late …\": the account, not the request", () => {
    flag(true);
    const issue = correctiveActionIssue(AT_STORE, "Remy Calder") ?? "";
    expect(issue).toMatch(/^she was late on 10-5 and 10-15/);
    expect(issue).not.toMatch(/create|ca for|coach/i);
  });

  it("off: as before (the bug), the card has no Issue", () => {
    flag(false);
    // Changed on purpose (10 Nov 2026, the B#501 rework on main): with production's SALES_OBSERVATION_ACCOUNT and
    // SALES_SHORTFALL_OBJECT on, the live bug is a blank Issue, no longer the whole request.
    expect(correctiveActionIssue(REQUEST, NAME)).toBeNull();
    // Main reads the at-store Issue as the account already (ISSUE_IS_THE_ACCOUNT and the round-6 flags); the Observation
    // is still the request (the replay row below), which is what this flag fixes there.
    expect(correctiveActionIssue(AT_STORE, "Remy Calder") ?? "").toMatch(/^she was late on 10-5 and 10-15/);
  });
});
