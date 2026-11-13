import { afterEach, describe, expect, it, vi } from "vitest";

import type { AskResponse } from "./types";
import { withIssueNotTerminationHedge } from "./termination-card-tidy";

/* TERMINATION_CARD_TIDY_ENABLED (QA's 17o live notes, 12 Nov 2026). The tester's wording; invented person. */
const card = (issue: string) =>
  ({
    content: `I'll draft a **Corrective Action Form** for **Marnie Holloway** …\n\n**Issue:** ${issue} · **Store:** Omaha, NE (West Dodge Rd)\n\n**Policy:** Attendance`,
    citations: [],
    formProposal: { templateKey: "dpoa", templateName: "Corrective Action Form", employeeName: "Marnie Holloway", issue },
  }) as unknown as AskResponse;

afterEach(() => vi.unstubAllEnvs());

describe("TERMINATION_CARD_TIDY_ENABLED: the Issue is never a hedge about terminating", () => {
  it("off: the card as built", () => {
    // Pinned off (test only): a run with the flag on in the environment no longer fails this arm.
    vi.stubEnv("TERMINATION_CARD_TIDY_ENABLED", "false");
    const built = card("do not terminate yet");
    expect(withIssueNotTerminationHedge(built, "CA for Marnie Holloway, do not terminate yet, she was late")).toBe(built);
  });

  it.each([
    ["CA for Marnie Holloway, do not terminate yet, she was late", "do not terminate yet", "she was late"],
    ["CA for Marnie Holloway, might terminate next time; she was 30 minutes late on 11/3", "might terminate next time", "she was 30 minutes late on 11/3"],
    ["write up Marnie Holloway. Not a termination. She left the register open.", "Not a termination", "She left the register open"],
  ])("on: %s", (question, issue, account) => {
    vi.stubEnv("TERMINATION_CARD_TIDY_ENABLED", "true");
    const out = withIssueNotTerminationHedge(card(issue), question);
    expect(out.formProposal?.issue).toBe(account);
    expect(out.content).toContain(`**Issue:** ${account} · **Store:**`);
  });

  it.each([
    ["CA for Marnie Holloway, she was late", "she was late"],
    ["CA for Marnie Holloway, do not terminate yet", "do not terminate yet"],
    ["CA for Marnie Holloway, she was late and might be terminated", "she was late and might be terminated"],
  ])("on, kept: %s", (question, issue) => {
    vi.stubEnv("TERMINATION_CARD_TIDY_ENABLED", "true");
    const built = card(issue);
    expect(withIssueNotTerminationHedge(built, question)).toBe(built);
  });
});

/* TERMINATION_TIDY_HELD_NAME_ENABLED (QA's 17r live note, 12 Nov 2026): the off-roster ask path holds the name off the card. */
describe("TERMINATION_TIDY_HELD_NAME_ENABLED: the tidy reads the account after a held name", () => {
  const held = {
    content: "I couldn't find **Corwin Ashdale** in the Woven roster, so that name is not on the form.\n\n**Issue:** do not terminate yet · **Store:** Omaha, NE (West Dodge Rd)",
    citations: [],
    formProposal: { templateKey: "dpoa", templateName: "Corrective Action Form", employeeName: null, issue: "do not terminate yet" },
  } as unknown as AskResponse;
  const SAID = "CA for Corwin Ashdale, do not terminate yet, she was late";

  it("off (TERMINATION_CARD_TIDY on): a card with no employee keeps the hedge as its Issue (the bug)", () => {
    vi.stubEnv("TERMINATION_CARD_TIDY_ENABLED", "true");
    vi.stubEnv("TERMINATION_TIDY_HELD_NAME_ENABLED", "false");
    expect(withIssueNotTerminationHedge(held, SAID)).toBe(held);
  });

  it("on: the account after the name the reply could not find is the Issue", () => {
    vi.stubEnv("TERMINATION_CARD_TIDY_ENABLED", "true");
    vi.stubEnv("TERMINATION_TIDY_HELD_NAME_ENABLED", "true");
    const out = withIssueNotTerminationHedge(held, SAID);
    expect(out.formProposal?.issue).toBe("she was late");
    expect(out.content).toContain("**Issue:** she was late · **Store:**");
  });

  it("on: with no held name in the reply, the card as built", () => {
    vi.stubEnv("TERMINATION_CARD_TIDY_ENABLED", "true");
    vi.stubEnv("TERMINATION_TIDY_HELD_NAME_ENABLED", "true");
    const nameless = { ...held, content: "**Issue:** do not terminate yet" } as AskResponse;
    expect(withIssueNotTerminationHedge(nameless, SAID)).toBe(nameless);
  });
});
