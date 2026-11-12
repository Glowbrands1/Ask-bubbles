import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { issueWithoutWriteUpLead, withWriteUpLeadNotAccount, withoutWriteUpLead } from "./write-up-lead";

/**
 * WRITE_UP_LEAD_NOT_ACCOUNT_ENABLED. Ported from the sibling app (QA's October triage of its #167, 10 Nov 2026), in
 * #167's wording ("write up <employee> for cell phone use"; the person here is invented): with production's flags the
 * Corrective Action card's Issue was the raw message. It should be the account, "Cell phone use", without the request's
 * words and the name.
 */
const FLAG = "WRITE_UP_LEAD_NOT_ACCOUNT_ENABLED";
const NAME = "Marnie Holloway";

beforeEach(() => {
  const production = JSON.parse(readFileSync("src/config/production-flags.json", "utf8")) as { on: string[] };
  for (const name of production.on) vi.stubEnv(name, "true");
  vi.stubEnv(FLAG, "true");
});
afterEach(() => vi.unstubAllEnvs());

const CARD = { templateKey: "dpoa", employeeName: NAME };
const correctiveActionIssue = (said: string, name: string): string | null =>
  withWriteUpLeadNotAccount({ content: "I'll draft a **Corrective Action Form**.", formProposal: { ...CARD, employeeName: name, issue: said } }).formProposal?.issue ?? null;

describe("#167: \"write up <employee> for cell phone use\" puts the account in the Issue, not the message", () => {
  it("off (production today): the Issue is the raw message (the bug)", () => {
    vi.stubEnv(FLAG, "");
    expect(correctiveActionIssue(`write up ${NAME} for cell phone use`, NAME)).toBe(`write up ${NAME} for cell phone use`);
  });

  it.each([
    `write up ${NAME} for cell phone use`,
    `write up ${NAME.toLowerCase()} for cell phone use`,
    "Write up Marnie for cell phone use",
    `please write up ${NAME} for cell phone use`,
    `I need to write up ${NAME} for cell phone use`,
    `write ${NAME} up for cell phone use`,
  ])("on: %s → the Issue is \"Cell phone use\"", (said) => {
    const read = correctiveActionIssue(said, NAME) ?? "";
    expect(read).toMatch(/^Cell phone use\.?$/);
    expect(read).not.toMatch(/write|Marnie|Holloway/i);
  });

  it("on: an Issue that only mentions a write-up is as it was", () => {
    const said = "She was written up for cell phone use on 10/2 and was on her phone again today.";
    expect(correctiveActionIssue(said, NAME)).toBe(said);
  });

  it("on: the reply's Issue line follows the card", () => {
    const answer = { content: `Here is the card.\n**Issue:** write up ${NAME} for cell phone use\n**Date:** 11/10/26`, formProposal: { ...CARD, issue: `write up ${NAME} for cell phone use` } };
    expect(withWriteUpLeadNotAccount(answer).content).toBe("Here is the card.\n**Issue:** Cell phone use\n**Date:** 11/10/26");
  });

  // Gate-Bubbles-5 (R768): the card puts other readbacks on the Issue line; only the Issue segment is replaced.
  it("on: the Store and Type of warning readbacks on the Issue line are kept, and the other card fields too", () => {
    const store = "**Store:** Omaha, NE (West Dodge Rd), from Woven (where the employee is assigned) — tell me if that should change";
    const level = "**Type of warning:** Written Warning, as you said — tell me if that should change";
    const card = { ...CARD, issue: `write up ${NAME} for cell phone use`, formDate: "2026-11-10", locationId: "loc-264" };
    const answer = { content: `Here is the card.\n\n**Issue:** write up ${NAME} for cell phone use · ${level} · ${store}\n\nNext.`, formProposal: card };
    const out = withWriteUpLeadNotAccount(answer);
    expect(out.content).toBe(`Here is the card.\n\n**Issue:** Cell phone use · ${level} · ${store}\n\nNext.`);
    expect(out.formProposal).toEqual({ ...card, issue: "Cell phone use" });
  });

  it("off: the answer is the same object", () => {
    vi.stubEnv(FLAG, "");
    const answer = { content: "x", formProposal: { ...CARD, issue: `write up ${NAME} for cell phone use` } };
    expect(withWriteUpLeadNotAccount(answer)).toBe(answer);
  });
});

describe("withoutWriteUpLead", () => {
  it("cuts the request and the card's employee, keeps the account", () => {
    expect(withoutWriteUpLead(`write up ${NAME} for cell phone use`, NAME)).toBe("Cell phone use");
    expect(withoutWriteUpLead("can you please write up marnie for being on her phone at the register", NAME)).toBe("Being on her phone at the register");
  });

  it("negative: an account that only mentions a write-up, or another person, is as it was", () => {
    expect(withoutWriteUpLead("She was written up for cell phone use on 10/2", NAME)).toBe("She was written up for cell phone use on 10/2");
    expect(withoutWriteUpLead("write up Remy Calder for cell phone use", NAME)).toBe("write up Remy Calder for cell phone use");
    expect(withoutWriteUpLead("Marnie was on her phone during the shift", NAME)).toBe("Marnie was on her phone during the shift");
    expect(withoutWriteUpLead(`write up ${NAME} for cell phone use`, null)).toBe(`write up ${NAME} for cell phone use`);
  });

  it("nothing left: null", () => {
    expect(withoutWriteUpLead(`write up ${NAME} for it`, NAME)).toBeNull();
    expect(issueWithoutWriteUpLead(`write up ${NAME} for it.`, NAME)).toBeNull();
  });
});
