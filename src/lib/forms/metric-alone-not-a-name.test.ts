import { afterEach, describe, expect, it } from "vitest";

import { namesAMetric } from "./request-slot";

/**
 * METRIC_ALONE_NOT_A_NAME_ENABLED (QA's prod-env reading, 10 Nov 2026, D4). "Their Club Close is low. Create a corrective
 * action." (`ai/corrective-action-conversation.test.ts`) drafted the form for "Club Close". "Club Close" is a metric
 * inherited from the sibling app's tests; the same sentence with an invented metric shows the mechanism here.
 */
const FLAG = "METRIC_ALONE_NOT_A_NAME_ENABLED";

afterEach(() => {
  delete process.env[FLAG];
});

describe("METRIC_ALONE_NOT_A_NAME: a phrase said to be low is a metric", () => {
  const SAID = "Their Lather Club is low. Create a corrective action.";

  it("flag off (as before): \"Lather Club\" is not read as a metric", () => {
    expect(namesAMetric("Lather Club", SAID)).toBe(false);
  });

  it("flag on: \"Lather Club\" is a metric", () => {
    process.env[FLAG] = "true";
    expect(namesAMetric("Lather Club", SAID)).toBe(true);
    expect(namesAMetric("Lather Club", "the store's Lather Club has been down all month, create a CA")).toBe(true);
    expect(namesAMetric("Lather Club", "Our Lather Club is at 12% this week")).toBe(true);
  });

  it("flag on, NEVER-BREAK: a person typed bare is never read as a metric", () => {
    process.env[FLAG] = "true";
    expect(namesAMetric("Remy Calder", "Remy Calder is behind on cleaning, create a written")).toBe(false);
    expect(namesAMetric("Remy Calder", "write up Remy Calder, she was late on 10-20")).toBe(false);
    // A metric said to be low beside a person: only the metric is one.
    expect(namesAMetric("Lather Club", "Remy Calder's Lather Club is low and she was late again")).toBe(true);
    expect(namesAMetric("Remy Calder", "Remy Calder's Lather Club is low and she was late again")).toBe(false);
  });
});
