import { afterEach, describe, expect, it, vi } from "vitest";

import { asksOnlyAboutFormsOnFile } from "./chat-form-records";

/* HISTORY_DENIAL_NOT_RECORDS (Gate-Bubbles-3's #888 follow-up, QA 14 Nov 2026), in the gate's wordings. */
afterEach(() => vi.unstubAllEnvs());
const on = (value: boolean) => vi.stubEnv("HISTORY_DENIAL_NOT_RECORDS_ENABLED", value ? "true" : "");

const DENIALS = [
  "verbal ca for remy calder, she was late on 11/3/26. no payroll deduct. never been written up",
  "verbal ca for remy calder, she was late on 11/3/26. no payroll deduct. no prior coaching",
  "verbal ca for remy calder, she was late on 11/3/26. she hasn't been coached before",
];

describe("HISTORY_DENIAL_NOT_RECORDS", () => {
  it("off: a denied history reads as a question about forms on file (the defect)", () => {
    on(false);
    for (const said of DENIALS.slice(0, 2)) expect(asksOnlyAboutFormsOnFile(said), said).toBe(true);
  });

  it("on: a denied history is not a question about forms on file", () => {
    on(true);
    for (const said of DENIALS) expect(asksOnlyAboutFormsOnFile(said), said).toBe(false);
  });

  it("on: a question about forms on file still is", () => {
    on(true);
    for (const said of ["has remy calder been written up before?", "does remy have any prior coaching?", "show me remy's coaching history"]) {
      expect(asksOnlyAboutFormsOnFile(said), said).toBe(true);
    }
  });
});
