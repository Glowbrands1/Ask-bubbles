import { afterEach, describe, expect, it, vi } from "vitest";

import { correctiveActionIssue } from "./incident-issue";

/*
 * CARD_ACCOUNT_DROPS_NON_FACTS (QA's Bubbles 17w live chat, 14 Nov 2026), in the manager's words; the person is invented.
 * The card's turns reach `correctiveActionIssue` joined as the chat route joins them (a blank line between turns).
 */
const turns = (...said: string[]) => said.join("\n\n");
const LIVE = turns("Marnie Holloway was late on 11/3/26", "she yelled at a customer and she maybe forgot", "corrective action form");

describe("correctiveActionIssue across the account turns", () => {
  afterEach(() => vi.unstubAllEnvs());

  // The live card's exact Issue needs production's other flags; the replay case (nov14-card-account-*) asserts it.
  it("off: never both facts", () => {
    vi.stubEnv("CARD_ACCOUNT_DROPS_NON_FACTS_ENABLED", "");
    expect(correctiveActionIssue(LIVE, "Marnie Holloway") ?? "").not.toMatch(/late on 11\/3\/26.*yelled/);
  });

  it("on: both facts, the lateness first, no hedge", () => {
    vi.stubEnv("CARD_ACCOUNT_DROPS_NON_FACTS_ENABLED", "true");
    expect(correctiveActionIssue(LIVE, "Marnie Holloway")).toBe("Marnie Holloway was late on 11/3/26; she yelled at a customer");
  });

  it("on: a request turn with its own account keeps it", () => {
    vi.stubEnv("CARD_ACCOUNT_DROPS_NON_FACTS_ENABLED", "true");
    const said = turns("Marnie Holloway was late on 11/3/26", "create a CA for Marnie Holloway, she yelled at a customer");
    const off = (() => {
      vi.stubEnv("CARD_ACCOUNT_DROPS_NON_FACTS_ENABLED", "");
      return correctiveActionIssue(said, "Marnie Holloway");
    })();
    vi.stubEnv("CARD_ACCOUNT_DROPS_NON_FACTS_ENABLED", "true");
    expect(correctiveActionIssue(said, "Marnie Holloway")).toBe(off);
  });

  it("on: the walk back stops at a turn about somebody else", () => {
    vi.stubEnv("CARD_ACCOUNT_DROPS_NON_FACTS_ENABLED", "true");
    const said = turns("Remy Calder was late on 11/2/26", "Marnie Holloway yelled at a customer", "corrective action form");
    const issue = correctiveActionIssue(said, "Marnie Holloway") ?? "";
    expect(issue).toMatch(/yelled at a customer/);
    expect(issue).not.toMatch(/Remy|11\/2/);
  });

  it("on: a hedge-only or level-only clause adds nothing", () => {
    vi.stubEnv("CARD_ACCOUNT_DROPS_NON_FACTS_ENABLED", "true");
    const said = turns("Marnie Holloway was late on 11/3/26 and she gets a verbal warning", "corrective action form");
    expect(correctiveActionIssue(said, "Marnie Holloway")).toBe("Marnie Holloway was late on 11/3/26");
  });
});
