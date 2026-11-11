import { afterEach, describe, expect, it } from "vitest";

import { typedJobTitle } from "./job-title-from-words";

/**
 * JOB_TITLE_APPOSITION_ENABLED (QA S12, 27 Oct 2026). Every position this app
 * has is on its own title list, which already reads "<name>, <title> at
 * <store>"; the flag reads one that is not, as typed. The chat path:
 * `api/chat/job-title-from-words-e2e.test.ts`.
 */
const FLAG = "JOB_TITLE_APPOSITION_ENABLED";
const TURN = "create a CA form for quinn marlowe, cashier at kearney, for opening late on 9-28-26";

afterEach(() => {
  delete process.env[FLAG];
});

describe(FLAG, () => {
  it("on: the title after the comma, as typed", () => {
    process.env[FLAG] = "true";
    expect(typedJobTitle([TURN], "Quinn Marlowe")).toBe("Cashier");
    expect(typedJobTitle(["create a CA form for quinn marlowe, kearney, late on 9-28-26"], "Quinn Marlowe")).toBeNull();
  });

  it("off: as before", () => {
    expect(typedJobTitle([TURN], "Quinn Marlowe")).toBeNull();
  });
});
