import { afterEach, describe, expect, it } from "vitest";

import { detectTemplateIntent } from "./template-intent";

/** FORM_FOR_FOR_TYPO_ENABLED (B-C3, 11 Nov 2026). The manager's words (sf-s36); the person is invented. */
const FLAG = "FORM_FOR_FOR_TYPO_ENABLED";
const SAID = "I need a exit for for Marnie Halloway TM. Quit without notice. not fulfilling a 2 weeks notice.";

afterEach(() => {
  delete process.env[FLAG];
});

describe("FORM_FOR_FOR_TYPO", () => {
  it("flag off (as production today): no form is read", () => {
    expect(detectTemplateIntent(SAID)).toEqual({ kind: "none" });
  });

  it("flag on: the Resignation/Exit Form is asked for", () => {
    process.env[FLAG] = "true";
    expect(detectTemplateIntent(SAID)).toEqual({ kind: "explicit", templateKey: "resignation-exit" });
    expect(detectTemplateIntent("coaching for for Marnie Holloway, late again")).toEqual({ kind: "explicit", templateKey: "coaching" });
  });

  it("flag on, NEVER-BREAK: \"for for\" with no form before it reads as before", () => {
    process.env[FLAG] = "true";
    const on = detectTemplateIntent("thanks for for the help today");
    delete process.env[FLAG];
    expect(on).toEqual(detectTemplateIntent("thanks for for the help today"));
  });
});
