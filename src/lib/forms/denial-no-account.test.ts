import { afterEach, describe, expect, it, vi } from "vitest";

import { onlyDeniesAFault } from "./denial-no-account";

/**
 * DENIAL_NO_ACCOUNT_ENABLED (coding 4's finding via QA, 7 Nov 2026): the exact wording, and the shapes the card
 * reads as its Issue. The person is the pack's invented Rowan Kestrel.
 */
const NAME = "Rowan Kestrel";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("onlyDeniesAFault", () => {
  it("off: false (as before)", () => {
    expect(onlyDeniesAFault("create a corrective action for Rowan Kestrel, not late", NAME)).toBe(false);
  });

  it.each([
    "create a corrective action for Rowan Kestrel, not late",
    "ca for Rowan Kestrel not late",
    "not late",
    "she was never late",
    "Rowan Kestrel had no problems",
  ])("on: %s only denies a fault", (text) => {
    vi.stubEnv("DENIAL_NO_ACCOUNT_ENABLED", "true");
    expect(onlyDeniesAFault(text, NAME)).toBe(true);
  });

  it.each([
    "ca for Rowan Kestrel, she was late on 11/2",
    "not late but left the register open",
    "Rowan Kestrel did not clean the molds",
    "not meeting sales requirements for the month of October",
    "ca for Rowan Kestrel",
  ])("on, negative: %s is not only a denial", (text) => {
    vi.stubEnv("DENIAL_NO_ACCOUNT_ENABLED", "true");
    expect(onlyDeniesAFault(text, NAME)).toBe(false);
  });
});
