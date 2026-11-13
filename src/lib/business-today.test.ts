import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { readNewHireConfig } from "@/lib/admin/new-hire-invites";

import { recordToday } from "./business-today";

/*
 * Live bug (QA, 13 Nov 2026; ported from the sibling app, where evening forms were dated the next day): a "today"
 * used as a business date was the UTC date, already tomorrow from about 6–7 PM Central. Here the form's date already
 * uses businessToday(); Woven's termination and new-hire dates were read against the UTC date, so a termination or a
 * hire dated tomorrow was applied that evening.
 *
 * 7:30 PM Central on 12 Nov 2026 is 01:30Z on 13 Nov.
 */
const EVENING = new Date("2026-11-13T01:30:00Z");

afterEach(() => vi.unstubAllEnvs());

describe("FORM_DATE_BUSINESS_TODAY: an evening 'today' is today, not tomorrow", () => {
  it("flag off: the UTC date, as before (the bug)", () => {
    expect(recordToday(EVENING)).toBe("2026-11-13");
    expect(readNewHireConfig({}, EVENING).today).toBe("2026-11-13");
  });

  it("flag on: the business date", () => {
    vi.stubEnv("FORM_DATE_BUSINESS_TODAY_ENABLED", "true");
    expect(recordToday(EVENING)).toBe("2026-11-12");
    expect(readNewHireConfig({}, EVENING).today).toBe("2026-11-12");
  });

  it("flag on: daytime is the same date either way", () => {
    vi.stubEnv("FORM_DATE_BUSINESS_TODAY_ENABLED", "true");
    expect(recordToday(new Date("2026-11-12T18:00:00Z"))).toBe("2026-11-12");
  });

  it("the Woven reads of 'today' use recordToday, not the UTC slice", () => {
    for (const file of ["src/lib/employees/woven/sync.ts", "src/lib/employees/woven/validate.ts", "src/lib/admin/new-hire-invites.ts"]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("recordToday(");
      expect(source, file).not.toMatch(/now\(\)\.toISOString\(\)\.slice\(0, 10\)|now\.toISOString\(\)\.slice\(0, 10\)|isoDate\(now\(\)\)/);
    }
  });
});
