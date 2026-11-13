import { afterEach, describe, expect, it, vi } from "vitest";

import { readCaPolicy } from "./ca-policy";
import { statesCompanyMetricShortfall } from "./metric-shortfall";

/**
 * COMPANY_METRICS_SHORTFALL_ENABLED (QA's ruling (a) on CA_NO_POLICY_ASKS_WHICH, 13 Nov 2026). The managers' words from
 * the replay pack's nov11-bcs-metrics cases: both made a Corrective Action card with no Policy line.
 */
const COMP = "Can you make a written CA for remy calder\nShe was below goal in IPT, AOV and Comp Sales % for October";
const DISCOUNT = "Can you make a written CA for remy calder\nShe had 40 transactions and was below in IPT, AOV, and Discount Rate";

afterEach(() => vi.unstubAllEnvs());

describe("COMPANY_METRICS_SHORTFALL_ENABLED", () => {
  it("the company's KPIs named and judged are a shortfall; named alone, or a word that only contains one, are not", () => {
    expect(statesCompanyMetricShortfall(COMP)).toBe(true);
    expect(statesCompanyMetricShortfall(DISCOUNT)).toBe(true);
    expect(statesCompanyMetricShortfall("her IPT was great this month")).toBe(false);
    expect(statesCompanyMetricShortfall("she was low on energy and left the script unfinished")).toBe(false);
    expect(statesCompanyMetricShortfall("the comp time was below what we planned")).toBe(false);
  });

  it("off (production today): the account reads as no policy", () => {
    vi.stubEnv("CA_SALES_POLICY_ENABLED", "true");
    vi.stubEnv("COMPANY_METRICS_SHORTFALL_ENABLED", "");
    expect(readCaPolicy(COMP).suggestion).toBeNull();
  });

  it.each([COMP, DISCOUNT])("on: %s is the sales part of the Standards of Conduct", (said) => {
    vi.stubEnv("CA_SALES_POLICY_ENABLED", "true");
    vi.stubEnv("COMPANY_METRICS_SHORTFALL_ENABLED", "true");
    const reading = readCaPolicy(said);
    expect(reading.suggestion).not.toBeNull();
    expect(reading.source).toBe("sales_performance");
  });
});
