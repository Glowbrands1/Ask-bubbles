import { afterEach, describe, expect, it, vi } from "vitest";

import type { RosterEmployee } from "@/lib/forms/employee-match";
import { EXIT_TEMPLATE_KEY } from "@/lib/forms/exit-library";
import type { ChatFormProposal } from "@/types";

import { withTitleOfTheEmployee } from "./title-of-the-employee";
import type { AskResponse } from "./types";

/**
 * EXIT_STATED_ONLY_ENABLED (ported from the sibling app, QA 5 Nov 2026): a termination letter pasted for an exit
 * form says "your General Manager" (the employee's manager) and the exit card took it as the employee's Job Title.
 * On an exit card, a title the manager only ever wrote as someone's is never the employee's. Invented people.
 */
const LETTER =
  "This decision follows the text message you sent to your General Manager on 11/05. The tone of the message was also disrespectful to your General Manager, Philippa. We expect every team member to treat our General Managers with respect.";

const card = (templateKey: string): ChatFormProposal =>
  ({
    proposalId: "p1",
    templateKey,
    templateName: "Resignation/Exit Form",
    supportsInlineDraft: true,
    variantKey: null,
    employeeName: "Dorran Ashby",
    employeeRole: "General Manager",
    formDate: null,
    locationId: "loc-264",
    locationName: null,
    locationResolution: "resolved",
    authorizedLocationIds: ["loc-264"],
    status: "ready",
    sourceMessageIds: [],
  }) as ChatFormProposal;

const reply = (templateKey: string): AskResponse => ({
  content: "- **Name:** Dorran Ashby\n- **Job Title:** General Manager\n- **Date:** the day the draft is created",
  citations: [],
  formProposal: card(templateKey),
});

const roster = (positionName: string | null) => async () =>
  [{ id: "e-1", firstName: "Dorran", lastName: "Ashby", preferredFirstName: null, positionName } as unknown as RosterEmployee];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("EXIT_STATED_ONLY_ENABLED: an exit card's Job Title is never the title the manager wrote as someone's", () => {
  it("off: \"your General Manager\" stays the card's Job Title (the bug)", async () => {
    const out = await withTitleOfTheEmployee(reply(EXIT_TEMPLATE_KEY), { question: LETTER, history: [] }, roster(null));
    expect(out.formProposal?.employeeRole).toBe("General Manager");
  });

  it("on, no Woven title: the card has none and the line goes", async () => {
    vi.stubEnv("EXIT_STATED_ONLY_ENABLED", "true");
    const out = await withTitleOfTheEmployee(reply(EXIT_TEMPLATE_KEY), { question: LETTER, history: [] }, roster(null));
    expect(out.formProposal?.employeeRole ?? null).toBeNull();
    expect(out.content).not.toMatch(/Job Title/);
  });

  it("on, a Woven title: the card and the line carry it", async () => {
    vi.stubEnv("EXIT_STATED_ONLY_ENABLED", "true");
    const out = await withTitleOfTheEmployee(reply(EXIT_TEMPLATE_KEY), { question: LETTER, history: [] }, roster("Team Member Part Time"));
    expect(out.formProposal?.employeeRole).toBe("Team Member Part Time");
    expect(out.content).toContain("- **Job Title:** Team Member Part Time");
  });

  it("negative, on: a Corrective Action card is not touched by this rule", async () => {
    vi.stubEnv("EXIT_STATED_ONLY_ENABLED", "true");
    const out = await withTitleOfTheEmployee(reply("dpoa"), { question: LETTER, history: [] }, roster(null));
    expect(out.formProposal?.employeeRole).toBe("General Manager");
  });

  it("negative, on: a title the manager gave the employee (\"Dorran is a General Manager\") stays", async () => {
    vi.stubEnv("EXIT_STATED_ONLY_ENABLED", "true");
    const out = await withTitleOfTheEmployee(reply(EXIT_TEMPLATE_KEY), { question: "Dorran is a General Manager and quit by text on 11/2", history: [] }, roster(null));
    expect(out.formProposal?.employeeRole).toBe("General Manager");
  });
});
