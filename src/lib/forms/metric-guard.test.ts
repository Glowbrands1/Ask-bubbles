import { afterEach, describe, expect, it, vi } from "vitest";

import type { AskResponse } from "@/lib/ai/types";

import { withoutMetricChoices, withRosterOnlyNames } from "./roster-only-names";
import { installRequestMessage } from "./request-slot";

/**
 * METRIC_GUARD_ENABLED (QA's LIVE=1 on main f99ee58a, 5 Nov 2026, the smaller set, 3/3 runs, mgr-1-roster-first-initial).
 * QA's message and the live reply's shape, word for word; the person is invented (checked against both directories).
 */
const MESSAGE = "I need a corrective action verbal for Perpetua T. This is for Under Performance on PPTA, LPSVA, Club Average, Club Close %, and Spa %.";
const LIVE = "Which of them is this **Corrective Action Form** for — **Club Close**, **Perpetua** or **Under**?";
const ROSTER = ["Perpetua Thornquist", "Marnie Holloway"];
const reply = (content: string): AskResponse => ({ content, citations: [] });

afterEach(() => {
  vi.unstubAllEnvs();
  installRequestMessage(() => undefined);
});

describe("METRIC_GUARD_ENABLED off: as before (the bug)", () => {
  it("the live reply keeps **Club Close** and **Under** as people", () => {
    installRequestMessage(() => MESSAGE);
    expect(withRosterOnlyNames(reply(LIVE)).content).toBe(LIVE);
  });
});

describe("METRIC_GUARD_ENABLED on, FORM_NAME off: no metric is ever a choice", () => {
  it("QA's live reply: the metrics go, the one person left is asked by her roster name", () => {
    vi.stubEnv("METRIC_GUARD_ENABLED", "true");
    const out = withoutMetricChoices(reply(LIVE), MESSAGE, ROSTER).content;
    expect(out).toBe("Is this for **Perpetua Thornquist**?");
    expect(out).not.toMatch(/Club Close|Under/);
  });

  it("through the step the chat runs (`withRosterOnlyNames`), with FORM_NAME off", () => {
    vi.stubEnv("METRIC_GUARD_ENABLED", "true");
    installRequestMessage(() => MESSAGE);
    expect(withRosterOnlyNames(reply(LIVE)).content).not.toMatch(/\*\*(?:Club Close|Under)\*\*/);
  });

  it("\"Is this for **Club Average**?\" asks who instead", () => {
    expect(withoutMetricChoices(reply("Is this for **Club Average**?"), MESSAGE, ROSTER).content).toMatch(/^Who is this form for\?/);
  });

  it("negative: two people and no metric are left as they are", () => {
    const text = "Which of them is this **Corrective Action Form** for — **Marnie Holloway** or **Perpetua Thornquist**?";
    expect(withoutMetricChoices(reply(text), "create a ca for Marnie or Perpetua. This is for Under Performance on PPTA, LPSVA, Club Average, Club Close %, and Spa %.", ROSTER).content).toBe(text);
  });

  it("negative: a roster person is kept even when the message lists them (\"CA for Marnie Holloway, Remy Calder, and Ignatius Wexlerby\")", () => {
    const text = "Which of them is this **Corrective Action Form** for — **Marnie Holloway** or **Remy Calder**?";
    expect(withoutMetricChoices(reply(text), "CA for Marnie Holloway, Remy Calder, and Ignatius Wexlerby", ["Marnie Holloway", "Remy Calder", "Ignatius Wexlerby"]).content).toBe(text);
  });

  it("negative: a message with no list and no offense phrase changes nothing", () => {
    const text = "Which of them is this **Coaching Form** for — **Marnie Holloway** or **Club Close**?";
    expect(withoutMetricChoices(reply(text), "create a coaching form", ROSTER).content).toBe(text);
  });
});
