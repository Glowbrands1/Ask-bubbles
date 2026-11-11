import { afterEach, describe, expect, it, vi } from "vitest";

import { withoutUnseatedName } from "./roster-only-names";
import { withNoEmployeeCard, withoutCreateNowWhenNoEmployee } from "./no-name-reply-wording";

/*
 * NO_NAME_REPLY_WORDING_ENABLED (QA, Ask Sunny's round 22 live test, 11 Nov 2026; port from Ask Sunny): "create a CA for ima employee" made no card,
 * but the reply said "for the the employee" twice and "You can create it now" with no Create button.
 */
const LINE = "I can create a **Corrective Action Form** for **ima employee**.\n\nManagement will review the applicable company policy with ima employee.";
const NOTE = "You can create it now and fill it in yourself, or tell me here what happened.";

describe("NO_NAME_REPLY_WORDING_ENABLED", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("on: the name's own word never matches inside its stand-in", () => {
    vi.stubEnv("NO_NAME_REPLY_WORDING_ENABLED", "true");
    const out = withoutUnseatedName(LINE, ["ima employee"], [], ["ima employee"]);
    expect(out).not.toMatch(/the the/i);
    expect(out).toContain("policy with the employee.");
  });

  it("off: as before (the doubled word this flag fixes)", () => {
    vi.stubEnv("NO_NAME_REPLY_WORDING_ENABLED", "");
    expect(withoutUnseatedName(LINE, ["ima employee"], [], ["ima employee"])).toMatch(/the the employee/);
  });

  it("no employee on the card: never \"You can create it now\"; with one, unchanged; off, unchanged", () => {
    vi.stubEnv("NO_NAME_REPLY_WORDING_ENABLED", "true");
    expect(withoutCreateNowWhenNoEmployee(NOTE, null)).toBe("Once you tell me who it's for, you can create it and fill it in yourself, or tell me here what happened.");
    expect(withoutCreateNowWhenNoEmployee(NOTE, "Brisa Talmadge")).toBe(NOTE);
    vi.stubEnv("NO_NAME_REPLY_WORDING_ENABLED", "");
    expect(withoutCreateNowWhenNoEmployee(NOTE, null)).toBe(NOTE);
  });
});

describe("NO_NAME_REPLY_WORDING_ENABLED: a card with no employee (Bubbles 16c live, 11 Nov 2026)", () => {
  afterEach(() => vi.unstubAllEnvs());
  const card = { templateKey: "dpoa", employeeName: null, supportsInlineDraft: true };
  const reply = [
    "**Action plan:** Management will review the applicable company policy with Ima. Future policy violations may result in additional corrective action up to and including termination of employment.",
    "",
    "I couldn't verify a store for **ima** from Woven, so I haven't put one on the form. Tell me which store they work at, or leave Store blank on the form.",
    "",
    "Who is this form for? Tell me the employee's full name.",
  ].join("\n");

  it("on: the plan says the employee, the store note goes, no Create button", () => {
    vi.stubEnv("NO_NAME_REPLY_WORDING_ENABLED", "true");
    const out = withNoEmployeeCard({ content: reply, formProposal: card });
    expect(out.content).toContain("policy with the employee.");
    expect(out.content).not.toMatch(/Ima\b|\*\*ima\*\*/);
    expect(out.formProposal?.supportsInlineDraft).toBe(false);
  });

  it("a team-wide card, a card with its employee, and off: unchanged", () => {
    vi.stubEnv("NO_NAME_REPLY_WORDING_ENABLED", "true");
    const team = { content: "This one is for the whole team. **Action plan:** review with Ima.", formProposal: card };
    expect(withNoEmployeeCard(team)).toBe(team);
    const named = { content: reply, formProposal: { ...card, employeeName: "Marnie Holloway" } };
    expect(withNoEmployeeCard(named)).toBe(named);
    vi.stubEnv("NO_NAME_REPLY_WORDING_ENABLED", "");
    const off = { content: reply, formProposal: card };
    expect(withNoEmployeeCard(off)).toBe(off);
  });
});
