import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { checkProposalIsCurrent } from "./proposal-currency";

/*
 * QA S5 (ported from Ask Sunny), 27 Oct 2026: the manager's request said the
 * name with a word repeated and the card was for the full name; Create refused
 * the card as out of date. CREATE_ACCEPTS_PART_OF_NAME_ENABLED takes a name that
 * is part of the card's as the same person. Invented names.
 */
const turn = (id: string, content: string) => ({ id, role: "user" as const, content });
const S5 = "create ca form for remy calder remy had a register shortage of $3.25 on 10-20-26. payroll deduct of $3.25 is applicable / verbal / yes payroll deduct";

afterEach(() => vi.unstubAllEnvs());

describe("CREATE_ACCEPTS_PART_OF_NAME_ENABLED", () => {
  it("off: 'remy calder remy' against the card for Remy Calder is refused, as before", () => {
    expect(checkProposalIsCurrent({ conversation: [turn("a", S5)], templateKey: "dpoa", employeeName: "Remy Calder" }).current).toBe(false);
  });

  it("on: 'remy calder remy' is part of the card's Remy Calder, so the card is current", () => {
    vi.stubEnv("CREATE_ACCEPTS_PART_OF_NAME_ENABLED", "true");
    expect(checkProposalIsCurrent({ conversation: [turn("a", S5)], templateKey: "dpoa", employeeName: "Remy Calder" }).current).toBe(true);
  });

  it("on: a card for a different person with a shared first name is still refused", () => {
    vi.stubEnv("CREATE_ACCEPTS_PART_OF_NAME_ENABLED", "true");
    const conversation = [turn("a", "create ca form for remy voss was late on 10-20-26 / verbal / no payroll deduct")];
    expect(checkProposalIsCurrent({ conversation, templateKey: "dpoa", employeeName: "Remy Calder" }).current).toBe(false);
  });

  it("on: a correction to another person after the card is still refused", () => {
    vi.stubEnv("CREATE_ACCEPTS_PART_OF_NAME_ENABLED", "true");
    const conversation = [turn("a", "create ca form for remy calder was late on 10-20-26"), turn("b", "No, not Remy Calder. Tess Varga.")];
    expect(checkProposalIsCurrent({ conversation, templateKey: "dpoa", employeeName: "Remy Calder" }).current).toBe(false);
  });
});
