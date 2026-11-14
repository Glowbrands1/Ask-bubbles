import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import flags from "@/config/production-flags.json";

import { correctiveActionIssue } from "./incident-issue";

/** Production's flags (on and assumedOn), as the chat route reads the account: the Issue is read only with them. */
function production(): void {
  const lists = flags as { on: string[]; assumedOn?: string[] };
  for (const name of [...lists.on, ...(lists.assumedOn ?? [])]) vi.stubEnv(name, "true");
}

/*
 * CARD_ACCOUNT_DROPS_NON_FACTS (QA's Bubbles 17w live chat, 14 Nov 2026), in the manager's words; the person is invented.
 * The card's turns reach `correctiveActionIssue` joined as the chat route joins them (a blank line between turns).
 */
const turns = (...said: string[]) => said.join("\n\n");
const LIVE = turns("Marnie Holloway was late on 11/3/26", "she yelled at a customer and she maybe forgot", "corrective action form");

describe("correctiveActionIssue across the account turns", () => {
  beforeEach(() => production());
  afterEach(() => vi.unstubAllEnvs());

  it("off: as production, the hedge kept and the lateness dropped", () => {
    vi.stubEnv("CARD_ACCOUNT_DROPS_NON_FACTS_ENABLED", "");
    expect(correctiveActionIssue(LIVE, "Marnie Holloway")).toBe("she yelled at a customer and she maybe forgot");
  });

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

/*
 * Gate-Bubbles-4's bar (G4-893, 14 Nov 2026): the Issue only drops from the Issue as read; it never inserts a word,
 * never re-splits a joined clause, and a turn that is not one clean fact in the manager's words is never put first.
 */
describe("CARD_ACCOUNT_DROPS_NON_FACTS_ENABLED: Gate-Bubbles-4's bar", () => {
  beforeEach(() => {
    production();
    vi.stubEnv("CARD_ACCOUNT_DROPS_NON_FACTS_ENABLED", "true");
  });
  afterEach(() => vi.unstubAllEnvs());

  const same = (said: string) => {
    vi.stubEnv("CARD_ACCOUNT_DROPS_NON_FACTS_ENABLED", "");
    const off = correctiveActionIssue(said, "Marnie Holloway");
    vi.stubEnv("CARD_ACCOUNT_DROPS_NON_FACTS_ENABLED", "true");
    return { off, on: correctiveActionIssue(said, "Marnie Holloway") };
  };

  it.each([
    "create a CA for Marnie Holloway, she needed a ride and left early",
    "create a CA for Marnie Holloway, she was given the closing checklist and skipped half of it",
    "create a CA for Marnie Holloway, she was charged by a customer for the wrong item and argued",
    "create a CA for Marnie Holloway, she yelled at a customer and then she walked out",
  ])("a joined account is kept word for word: %s", (said) => {
    const { off, on } = same(said);
    expect(on).toBe(off);
  });

  it("a title turn before the account is never put first (b1: \"Team Member; he was late\")", () => {
    const issue = correctiveActionIssue(turns("Team Member", "she was late on 11/3/26", "corrective action form"), "Marnie Holloway") ?? "";
    expect(issue).not.toMatch(/Team Member/);
  });

  it("only a clause with her subject is dropped; the words before it stay", () => {
    const { off, on } = same(turns("Marnie Holloway was late on 11/3/26, she probably overslept", "corrective action form"));
    expect(off ?? "").toMatch(/probably/);
    expect(on).toBe("Marnie Holloway was late on 11/3/26");
  });
});
