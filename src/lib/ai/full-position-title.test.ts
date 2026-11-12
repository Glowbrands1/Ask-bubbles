import { afterEach, describe, expect, it, vi } from "vitest";

import { isCompanyPositionTitle } from "@/lib/forms/staff-picker";

import { fullPositionTitle, withFullPositionTitle } from "./full-position-title";
import type { AskResponse } from "./types";

/**
 * QA task A, 6 Nov 2026: an exit form typed as lines with the position "Team
 * Member Part Time" got the Position "Team Member". The manager's wording, an
 * invented name (not on the directory).
 */
const TYPED =
  "Isaura Corvadine\nTeam Member Part Time \nNE Omaha Dodge\nGave notice - fulfilled notice\nGave notice 10/20/26 - date notice fulfilled 11/3/26\nResigning to pursue other career options\nStore items returned payroll deduction does not apply eligible for rehire";
const REQUEST = {
  question: TYPED,
  history: [{ id: "m-1", role: "user" as const, content: "Can you create an exit form for me?", createdAt: "2026-11-06T02:00:00Z" }],
};

function exitCard(role: string | null, source: "manager" | "woven" | null = "manager"): AskResponse {
  return {
    content: `Here's what I'll fill in on the **Resignation/Exit Form** for **Isaura Corvadine**:\n\n- **Name:** Isaura Corvadine\n- **Job Title:** ${role}\n- **Store:** Omaha, NE`,
    sources: [],
    formProposal: { templateKey: "resignation-exit", employeeName: "Isaura Corvadine", employeeRole: role, employeeRoleSource: source },
  } as unknown as AskResponse;
}

afterEach(() => vi.unstubAllEnvs());

describe("isCompanyPositionTitle: the company's own position names, whole", () => {
  it("knows the whole position, in any case or spacing", () => {
    expect(isCompanyPositionTitle("Team Member Part Time")).toBe(true);
    expect(isCompanyPositionTitle("  team member   part time ")).toBe(true);
    expect(isCompanyPositionTitle("Assistant General Manager")).toBe(true);
  });
  it("a part of one, or one with other words, is not a position name", () => {
    expect(isCompanyPositionTitle("Team Member")).toBe(false);
    expect(isCompanyPositionTitle("Team Member Weekends Only")).toBe(false);
    expect(isCompanyPositionTitle("Team Member Part Time NE Omaha Dodge")).toBe(false);
  });
});

describe("FULL_POSITION_TITLE_ENABLED: the whole typed position is the card's Position", () => {
  it("the defect, flag off: the card keeps \"Team Member\" (unchanged)", () => {
    vi.stubEnv("FULL_POSITION_TITLE_ENABLED", "");
    const card = exitCard("Team Member");
    expect(withFullPositionTitle(card, REQUEST)).toBe(card);
  });

  it("flag on: \"Team Member Part Time\" typed on its own line is the Position, on the card and in the read-back", () => {
    vi.stubEnv("FULL_POSITION_TITLE_ENABLED", "true");
    const out = withFullPositionTitle(exitCard("Team Member"), REQUEST);
    expect(out.formProposal?.employeeRole).toBe("Team Member Part Time");
    expect(out.formProposal?.employeeRoleSource).toBe("manager");
    expect(out.content).toMatch(/^- \*\*Job Title:\*\* Team Member Part Time$/m);
  });

  it("flag on: a \"Position:\" line in the request, typed in lower case, is the company's position", () => {
    vi.stubEnv("FULL_POSITION_TITLE_ENABLED", "true");
    const out = withFullPositionTitle(exitCard("Team Member"), { question: "exit form for Isaura Corvadine\nposition: team member part time\nlast day 11/3/26", history: [] });
    expect(out.formProposal?.employeeRole).toBe("Team Member Part Time");
  });

  it("negative, flag on: a title with other words after it that are not a position stays as read", () => {
    vi.stubEnv("FULL_POSITION_TITLE_ENABLED", "true");
    const card = exitCard("Team Member");
    expect(withFullPositionTitle(card, { question: TYPED.replace("Team Member Part Time", "Team Member Weekends Only"), history: [] })).toBe(card);
    expect(withFullPositionTitle(card, { question: "Isaura Corvadine Team Member Part Time NE Omaha Dodge gave notice", history: [] })).toBe(card);
  });

  it("flag on: a position that does not hold the card's title, or Woven's title, is left alone", () => {
    vi.stubEnv("FULL_POSITION_TITLE_ENABLED", "true");
    const manager = exitCard("Store Manager");
    expect(withFullPositionTitle(manager, REQUEST)).toBe(manager);
    const woven = exitCard("Team Member", "woven");
    expect(withFullPositionTitle(woven, REQUEST)).toBe(woven);
    const none = exitCard(null, null);
    expect(withFullPositionTitle(none, REQUEST)).toBe(none);
  });

  it("the title already whole is not lengthened again", () => {
    expect(fullPositionTitle([TYPED], "Team Member Part Time")).toBeNull();
    expect(fullPositionTitle([TYPED], "Team Member")).toBe("Team Member Part Time");
  });
});
