import { afterEach, describe, expect, it, vi } from "vitest";

import { statesMetricShortfall } from "./metric-shortfall";

/**
 * BUBBLES_METRIC_WORDS_ENABLED (QA, 10 Nov 2026). The metric reader came over from the sibling app with that company's
 * own metrics. On: those are left out and this company's — UPT, units per transaction, average sale, transactions —
 * are read. Metrics the two share ("sales", "KPIs", "her numbers") read the same either way.
 */
afterEach(() => {
  vi.unstubAllEnvs();
});

const OURS = ["her UPT is low", "his units per transaction are below target", "their average sale is down", "her transactions are slipping"];
const SHARED = ["her sales are low", "his KPIs are behind", "her numbers are down"];

describe("BUBBLES_METRIC_WORDS_ENABLED", () => {
  it("off (main): this company's metrics read as no shortfall; the sibling's do", () => {
    for (const text of OURS) expect(statesMetricShortfall(text), text).toBe(false);
    expect(statesMetricShortfall("their club close is low")).toBe(true);
    expect(statesMetricShortfall("her upgrades are down")).toBe(true);
  });

  it("on: this company's metrics read as a shortfall; the sibling's no longer do", () => {
    vi.stubEnv("BUBBLES_METRIC_WORDS_ENABLED", "true");
    for (const text of OURS) expect(statesMetricShortfall(text), text).toBe(true);
    expect(statesMetricShortfall("their club close is low")).toBe(false);
    expect(statesMetricShortfall("her upgrades are down")).toBe(false);
    expect(statesMetricShortfall("her membership % is low")).toBe(false);
  });

  it("shared metrics read the same either way; a judgement alone is still no metric", () => {
    for (const text of SHARED) expect(statesMetricShortfall(text), text).toBe(true);
    vi.stubEnv("BUBBLES_METRIC_WORDS_ENABLED", "true");
    for (const text of SHARED) expect(statesMetricShortfall(text), text).toBe(true);
    expect(statesMetricShortfall("she was low on energy")).toBe(false);
  });
});
