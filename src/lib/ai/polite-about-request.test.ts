import { afterEach, describe, expect, it, vi } from "vitest";

import { madeAbout } from "./make-it-about";
import { withoutPoliteLeadOnCard } from "./polite-about-request";

/** POLITE_ABOUT_STAYS_CARD_ENABLED (the Bubbles live tester, QA, 8 Nov 2026); invented people. */
const SAID = "can you make it for missing out monthly meeting";
const onCard = (question: string) => ({ question, continueProposalTemplateKey: "coaching" });

afterEach(() => vi.unstubAllEnvs());

describe("POLITE_ABOUT_STAYS_CARD", () => {
  it("off: the turn and the reading are as before (the report)", () => {
    expect(withoutPoliteLeadOnCard(onCard(SAID))).toBe(SAID);
    expect(madeAbout(SAID)).toBeNull();
  });

  it.each([
    [SAID, "make it for missing out monthly meeting"],
    ["could you please make it about missing our monthly meeting?", "make it about missing our monthly meeting"],
    ["ok can you make the form for not clocking in on 11/2", "make the form for not clocking in on 11/2"],
  ])("on, a card open: %s → %s", (question, expected) => {
    vi.stubEnv("POLITE_ABOUT_STAYS_CARD_ENABLED", "true");
    expect(withoutPoliteLeadOnCard(onCard(question))).toBe(expected);
  });

  it("on: no card open, or another request, is unchanged", () => {
    vi.stubEnv("POLITE_ABOUT_STAYS_CARD_ENABLED", "true");
    expect(withoutPoliteLeadOnCard({ question: SAID })).toBe(SAID);
    expect(withoutPoliteLeadOnCard(onCard("can you make a coaching form for Remy Calder"))).toBe("can you make a coaching form for Remy Calder");
    expect(withoutPoliteLeadOnCard(onCard("can you tell me the attendance policy?"))).toBe("can you tell me the attendance policy?");
  });

  it("on: \"make it for <topic>\" says what the form is about; \"make it for <name>\" does not", () => {
    vi.stubEnv("POLITE_ABOUT_STAYS_CARD_ENABLED", "true");
    expect(madeAbout("make it for missing out monthly meeting")).toBe("missing out monthly meeting");
    expect(madeAbout("make it for no call no show on saturday")).toBe("no call no show on saturday");
    expect(madeAbout("make it for remy calder")).toBeNull();
    expect(madeAbout("make it for Remy Calder instead")).toBeNull();
  });
});
