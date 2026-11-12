import { afterEach, describe, expect, it, vi } from "vitest";

import { withResentRequestAsYes } from "./resent-request-is-yes";

/* RESENT_REQUEST_IS_YES_ENABLED (QA, 12 Nov 2026). The reproduction's turns; invented people. */
const LETTER =
  "Hi Marcus,\n\nThis letter confirms that your employment with Buff City Soap is terminated, effective 11/08/2026, due to repeated no-call no-shows on 11/3, 11/5 and 11/7.\n\nSincerely,\nDolores Whitcombe\nDistrict Manager";
const REQUEST = `I need an exit form with this information. ${LETTER}`;
const ASKED = "Is this for **Marcus Tellefsen**? Tell me if that should change.";
const history = (first: string) => [
  { role: "user", content: first },
  { role: "assistant", content: ASKED },
];

afterEach(() => vi.unstubAllEnvs());

describe("RESENT_REQUEST_IS_YES_ENABLED", () => {
  it("off: as sent", () => {
    expect(withResentRequestAsYes({ question: REQUEST, history: history(REQUEST) })).toBeNull();
  });

  it("on: the same request again is a yes", () => {
    vi.stubEnv("RESENT_REQUEST_IS_YES_ENABLED", "true");
    expect(withResentRequestAsYes({ question: REQUEST, history: history(REQUEST) })?.question).toBe("yes");
    expect(withResentRequestAsYes({ question: `  ${REQUEST.toUpperCase()} `, history: history(REQUEST) })?.question).toBe("yes");
  });

  it("on: the same letter with the request before it is a yes", () => {
    vi.stubEnv("RESENT_REQUEST_IS_YES_ENABLED", "true");
    expect(withResentRequestAsYes({ question: REQUEST, history: history(LETTER) })?.question).toBe("yes");
  });

  it.each([
    "no",
    "no, it's for Marcus Pell",
    "it's Marcus Pell",
    "yes",
    "I need an exit form for Dolores Whitcombe",
  ])("on, not a resent request: %s", (said) => {
    vi.stubEnv("RESENT_REQUEST_IS_YES_ENABLED", "true");
    expect(withResentRequestAsYes({ question: said, history: history(REQUEST) })).toBeNull();
  });

  it("on: nothing pending, nothing changes", () => {
    vi.stubEnv("RESENT_REQUEST_IS_YES_ENABLED", "true");
    expect(withResentRequestAsYes({ question: REQUEST, history: [{ role: "user", content: REQUEST }, { role: "assistant", content: "Here's what I'll fill in …" }] })).toBeNull();
  });
});
