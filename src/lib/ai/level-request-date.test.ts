import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { correctiveActionIssue } = await import("@/lib/forms/incident-issue");
const { managerWordsObservation } = await import("@/lib/forms/draft-never-blank");

/*
 * LEVEL_REQUEST_DATE_ENABLED (QA, the sibling app's live chat, 30 Oct 2026):
 * "create a written on 10/20 for <name> at <store>, she was late again" put
 * the whole request on the Corrective Action card. Here the card's Issue read
 * "create a written on 10/20 for … she was late again" word for word. The
 * manager's words in this app's wording, the person invented.
 */
const SAID = "create a written on 10/20 for katrin dovetail at lees summit, she was late again";
const NAME = "Katrin Dovetail";
const FLAG = "LEVEL_REQUEST_DATE_ENABLED";

function flag(on: boolean) {
  vi.stubEnv(FLAG, on ? "true" : "");
  vi.stubEnv("REQUEST_LINE_ACCOUNT_ENABLED", "true");
  vi.stubEnv("TYPED_NAME_ENABLED", "true");
}
afterEach(() => vi.unstubAllEnvs());

describe("a level request is the request, not the account (LEVEL_REQUEST_DATE_ENABLED)", () => {
  it("QA's words: the card's Issue is what happened", () => {
    flag(true);
    expect(correctiveActionIssue(SAID, NAME)).toBe("she was late again");
  });

  it("off, as reported: the request is the Issue", () => {
    flag(false);
    expect(correctiveActionIssue(SAID, NAME)).toMatch(/^create a written on 10\/20/);
  });

  it("the draft written from the manager's words starts with what happened", () => {
    flag(true);
    expect(managerWordsObservation(SAID, NAME)).toMatch(/\nShe was late again\.$/);
  });

  it("off: the draft from the manager's words starts with the request", () => {
    flag(false);
    expect(managerWordsObservation(SAID, NAME)).toMatch(/\nCreate a written on 10\/20/);
  });

  for (const said of [
    "create a written on 10-20-26 for katrin dovetail, she was late again",
    "make a verbal 10/20 for katrin dovetail, she was late again",
    "create a final warning on 10/20 for katrin dovetail, she was late again",
    "create a written for katrin dovetail at lees summit, she was late again",
  ]) {
    it(`"${said}" → she was late again`, () => {
      flag(true);
      expect(correctiveActionIssue(said, NAME)).toBe("she was late again");
    });
  }

  it("an account that only mentions a written is kept", () => {
    flag(true);
    const said = "she tore up the written on 10/20 for no reason";
    const on = correctiveActionIssue(said, NAME);
    flag(false);
    expect(on).toBe(correctiveActionIssue(said, NAME));
  });
});
