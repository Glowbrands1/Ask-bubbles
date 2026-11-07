import { afterEach, describe, expect, it, vi } from "vitest";

import { detectTemplateIntent } from "./template-intent";
import { statedWarningLevel } from "./warning-level";

/**
 * LEVEL_ENDS_REQUEST_ENABLED (QA, live tester, 7 Nov 2026). "my team member <name> was late on 10-20-26, verbal ca"
 * gave no card: the closing level read as history, so the turn was a question.
 */
const LIVE = "my team member Wrenna Calloway was late on 10-20-26, verbal ca";
const TODAY = "2026-11-06";

const read = (text: string) => ({ level: statedWarningLevel(text, TODAY), intent: detectTemplateIntent(text) });

describe("LEVEL_ENDS_REQUEST_ENABLED", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("off: the live wording is a question with no level (the reported failure)", () => {
    expect(read(LIVE)).toEqual({ level: null, intent: { kind: "corrective_action", requestedCreation: false } });
  });

  it.each([
    [LIVE, "verbal"],
    ["Wrenna was late on 10-20-26, written corrective action.", "written"],
    ["Wrenna Calloway no call no show 10-21-26, verbal c/a", "verbal"],
  ])('on: "%s" asks for the form, %s', (text, level) => {
    vi.stubEnv("LEVEL_ENDS_REQUEST_ENABLED", "true");
    expect(read(text)).toEqual({ level, intent: { kind: "corrective_action", requestedCreation: true } });
  });

  it.each([
    "she was late last night, verbal warning",
    "she had a verbal ca on 9-1-26",
    "my team member Wrenna Calloway was late on 10-20-26, verbal ca?",
    "she got a verbal ca last month, now she was late again",
  ])('"%s" reads the same on and off', (text) => {
    const off = read(text);
    vi.stubEnv("LEVEL_ENDS_REQUEST_ENABLED", "true");
    expect(read(text)).toEqual(off);
  });
});
