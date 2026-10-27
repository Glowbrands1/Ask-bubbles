import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { checkProposalIsCurrent } from "./proposal-currency";

/*
 * LAST_FIRST_NAME_READ_ENABLED (ported from Ask Sunny): the manager wrote "Calder,
 * Remy"; the card is for Remy Calder; Create refused it as out of date. Invented names.
 */
const turn = (id: string, content: string) => ({ id, role: "user" as const, content });
const CONVERSATION = [turn("a", "My employee Calder, Remy was 10 minutes late on 10/20. Please create a CA form so I can document.")];

afterEach(() => vi.unstubAllEnvs());

describe("the Create check and 'Calder, Remy'", () => {
  it("off: refused as out of date, as before", () => {
    expect(checkProposalIsCurrent({ conversation: CONVERSATION, templateKey: "dpoa", employeeName: "Remy Calder" }).current).toBe(false);
  });

  it("on: the card for Remy Calder is current", () => {
    vi.stubEnv("LAST_FIRST_NAME_READ_ENABLED", "true");
    expect(checkProposalIsCurrent({ conversation: CONVERSATION, templateKey: "dpoa", employeeName: "Remy Calder" }).current).toBe(true);
  });

  it("on: a card for another person is still refused", () => {
    vi.stubEnv("LAST_FIRST_NAME_READ_ENABLED", "true");
    expect(checkProposalIsCurrent({ conversation: CONVERSATION, templateKey: "dpoa", employeeName: "Tess Varga" }).current).toBe(false);
    const other = [turn("a", "My employee Voss, Remy was late on 10/20. Please create a CA form")];
    expect(checkProposalIsCurrent({ conversation: other, templateKey: "dpoa", employeeName: "Remy Calder" }).current).toBe(false);
  });
});
