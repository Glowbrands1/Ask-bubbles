import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SIGNED } from "@/app/api/chat/replay-pack/nov9-exit-letter-signer-cases";

import { withoutLetterSigner } from "./letter-signer";
import { withManagerStatedTitle } from "./manager-title";
import type { AskRequest, AskResponse } from "./types";

/**
 * EXIT_LETTER_SIGNER_NOT_SUBJECT_ENABLED. QA, the Bubbles round-6 live test (9 Nov 2026), in QA's wording with the
 * people invented: "create an exit form for <B>, team member at Grand Island. Here is the termination letter: '…
 * <C>, District Manager'".
 */
const FLAG = "EXIT_LETTER_SIGNER_NOT_SUBJECT_ENABLED";

beforeEach(() => vi.stubEnv(FLAG, "true"));
afterEach(() => vi.unstubAllEnvs());

describe("withoutLetterSigner", () => {
  it("off: the turn as it was", () => {
    vi.stubEnv(FLAG, "");
    expect(withoutLetterSigner({ question: SIGNED })).toBe(SIGNED);
  });

  it("on: QA's turn is read without the sign-off, the letter's closing quote kept", () => {
    const read = withoutLetterSigner({ question: SIGNED });
    expect(read).not.toMatch(/Maren Tollefsen|District Manager/);
    expect(read.endsWith("Please return your store key.'")).toBe(true);
    expect(read.startsWith("create an exit form for Corvin Ashdale, team member at Grand Island.")).toBe(true);
  });

  it("on: other closing titles, with or without a closing quote", () => {
    expect(withoutLetterSigner({ question: "exit form for Corvin Ashdale. Letter: you are terminated. Maren Tollefsen, Regional Director" })).toBe(
      "exit form for Corvin Ashdale. Letter: you are terminated.",
    );
    expect(withoutLetterSigner({ question: "create a CA for Corvin Ashdale: \"you were late twice. Maren Tollefsen, Store Manager\"" })).toBe(
      "create a CA for Corvin Ashdale: \"you were late twice.\"",
    );
  });

  it("on: a letter the form's person signs is kept", () => {
    const own = "create an exit form for Corvin Ashdale. Here is his resignation letter: 'I am resigning effective 11-6-26. Corvin Ashdale, Team Member'";
    expect(withoutLetterSigner({ question: own })).toBe(own);
  });

  it("on: no form's person named, or no sign-off: the turn as it was", () => {
    const unnamed = "Here is the termination letter: 'your employment is terminated. Maren Tollefsen, District Manager'";
    expect(withoutLetterSigner({ question: unnamed })).toBe(unnamed);
    const plain = "create an exit form for Corvin Ashdale, he quit on 11-6-26 with no notice";
    expect(withoutLetterSigner({ question: plain })).toBe(plain);
  });
});

describe("withManagerStatedTitle with the flag", () => {
  const card = (employeeRole: string): AskResponse =>
    ({ content: "", formProposal: { employeeName: "Corvin Ashdale", employeeRole } }) as unknown as AskResponse;
  const request = { question: SIGNED, history: [] } as unknown as AskRequest;

  beforeEach(() => vi.stubEnv("MANAGER_WORDS_ONLY_ENABLED", "true"));

  it("off: the signer's title is taken as the one the manager stated (the bug)", () => {
    vi.stubEnv(FLAG, "");
    expect(withManagerStatedTitle(card("Team Member"), request).formProposal?.employeeRole).toBe("District Manager");
  });

  it("on: the employee's own title stays", () => {
    expect(withManagerStatedTitle(card("Team Member"), request).formProposal?.employeeRole).toBe("Team Member");
  });
});
