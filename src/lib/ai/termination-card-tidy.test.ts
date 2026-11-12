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
