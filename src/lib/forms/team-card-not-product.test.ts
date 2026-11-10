import { afterEach, describe, expect, it } from "vitest";

import type { ChatFormProposal } from "@/types";

import { saysEmployeeBlank, teamTopicReadConversation, withTeamCardNotProduct, writtenAsTopic } from "./team-card-not-product";

/*
 * TEAM_CARD_NOT_PRODUCT_ENABLED. The manager's words are verbatim (QA's overnight scan sf-s13, 4 Nov 2026). The replay
 * pack runs the chat: `nov4-overnight-scan-cases.ts` (sf-s13).
 */
const S13 = "I need to make a coaching form for the team at West Dodge Rd on selling Bath Bomb Kits, not writing proper rainchecks which results in inventory not being correct.";
const BLANK = "The employee needs to be left blank for now";
const ROSTER = [{ id: "e-1", firstName: "Odalys", lastName: "Frewen", preferredFirstName: null, locationIds: ["loc-0309"] }];

const card = (employeeName: string) =>
  ({ templateKey: "coaching", templateName: "Coaching Form", employeeName, employeeRole: null, sourceMessageIds: ["m1", "m2"] }) as unknown as ChatFormProposal;

afterEach(() => {
  delete process.env.TEAM_CARD_NOT_PRODUCT_ENABLED;
});

describe("the product on a team coaching card", () => {
  it("reads the topic and the blank-employee turn", () => {
    expect(writtenAsTopic("Bath Bomb Kits", [S13])).toBe(true);
    expect(writtenAsTopic("Odalys Frewen", ["make a coaching form for Odalys Frewen on selling kits"])).toBe(false);
    expect(saysEmployeeBlank(BLANK)).toBe(true);
    expect(saysEmployeeBlank(S13)).toBe(false);
  });

  it("is the team card with the flag on; the blank-employee turn leaves the sources; off, as before", () => {
    const answer = { content: "I have the employee and the store.", formProposal: card("Bath Bomb Kits") };
    const input = { turns: [{ id: "m1", content: S13 }, { id: "m2", content: BLANK }], roster: ROSTER };
    expect(withTeamCardNotProduct(answer, input)).toBe(answer);
    process.env.TEAM_CARD_NOT_PRODUCT_ENABLED = "true";
    const read = withTeamCardNotProduct(answer, input);
    expect(read.formProposal).toMatchObject({ employeeName: "All team members", subject: "team", sourceMessageIds: ["m1"] });
    expect(read.content).toMatch(/whole team/);
  });

  it("a person named for the form is never made the team", () => {
    process.env.TEAM_CARD_NOT_PRODUCT_ENABLED = "true";
    const answer = { content: "", formProposal: card("Odalys Frewen") };
    expect(withTeamCardNotProduct(answer, { turns: [{ id: "m1", content: "coaching form for the team, mostly Odalys Frewen" }], roster: ROSTER })).toBe(answer);
  });

  it("Create reads \"selling Bath Bomb Kits\" in lower case on the team card", () => {
    process.env.TEAM_CARD_NOT_PRODUCT_ENABLED = "true";
    const turns = [{ role: "user", content: S13 }];
    expect(teamTopicReadConversation(turns, "All team members")[0]!.content).toMatch(/selling bath bomb kits/);
    expect(teamTopicReadConversation(turns, "Odalys Frewen")).toBe(turns);
  });
});
