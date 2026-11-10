import { afterEach, describe, expect, it } from "vitest";

import { statedWarningLevel } from "./warning-level";

/*
 * LEVEL_REQUEST_MORE_VERBS_ENABLED (QA's audit, 10 Nov 2026). The manager's words are verbatim (the overnight scan's
 * sf-s17); the person is invented. The replay pack runs the chat: `nov4-overnight-scan-cases.ts` (sf-s17).
 */
const S17 = "put together a written CA for Marit Sollano for not compelting her woven courses by the deadline of october 31st";
const TODAY = "2026-11-04";

afterEach(() => {
  delete process.env.LEVEL_REQUEST_MORE_VERBS_ENABLED;
  delete process.env.REQUEST_LEVEL_NOT_HISTORY_ENABLED;
});

describe("\"put together a written CA for <A> … by the deadline of october 31st\"", () => {
  it("off, as before: the level is not read", () => {
    process.env.REQUEST_LEVEL_NOT_HISTORY_ENABLED = "true";
    expect(statedWarningLevel(S17, TODAY)).toBeNull();
  });
  it("on: \"put together\", \"prepare\", \"draw up\" open the request, so the level is this CA's", () => {
    process.env.REQUEST_LEVEL_NOT_HISTORY_ENABLED = "true";
    process.env.LEVEL_REQUEST_MORE_VERBS_ENABLED = "true";
    expect(statedWarningLevel(S17, TODAY)).toBe("written");
    expect(statedWarningLevel("prepare a verbal CA for Marit Sollano for missing the deadline of october 31st", TODAY)).toBe("verbal");
    expect(statedWarningLevel("draw up a written CA for Marit Sollano, she missed the october 31st deadline", TODAY)).toBe("written");
  });
  it("on: a level already given is still history", () => {
    process.env.REQUEST_LEVEL_NOT_HISTORY_ENABLED = "true";
    process.env.LEVEL_REQUEST_MORE_VERBS_ENABLED = "true";
    expect(statedWarningLevel("put together a CA for Marit Sollano, she already had a written warning on october 3rd", TODAY)).toBeNull();
  });
});
