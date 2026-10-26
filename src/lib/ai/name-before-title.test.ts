import { afterEach, describe, expect, it } from "vitest";

import { nameBeforeTitle, withNameBeforeTitle } from "./name-before-title";
import type { AskRequest } from "./types";

/**
 * QA live run, 26 Oct 2026 (tester 1, B10/B12; the tester's wording, names
 * invented): a lowercase name before ", team member at <store>" was not read,
 * and a capitalised name with no comma before "Team Member" lost its surname.
 */
const FLAG = "NAME_BEFORE_TITLE_ENABLED";
const saved = process.env[FLAG];
afterEach(() => {
  if (saved === undefined) delete process.env[FLAG];
  else process.env[FLAG] = saved;
});

const B10 =
  "create a verbal ca for wren halvorsen, team member at omaha ne, standards of conduct, she was rude to a customer on 10-7-26. payroll deduct not applicable";
const B12 = "written ca for wren halvorsen, team member at omaha ne, attendance, she was a no call no show on 10-21-26 and 10-22-26";

describe("NAME_BEFORE_TITLE_ENABLED off", () => {
  it("reads every turn as typed, as on main", () => {
    delete process.env[FLAG];
    const request = { question: B10, history: [] } as unknown as AskRequest;
    expect(withNameBeforeTitle(request)).toBe(request);
  });
});

describe("NAME_BEFORE_TITLE_ENABLED on", () => {
  it.each([
    [B10, "create a verbal ca for Wren Halvorsen, team member at omaha ne, standards of conduct"],
    ["Create a verbal ca for wren halvorsen, team member at omaha ne, standards of conduct", "Create a verbal ca for Wren Halvorsen, team member at omaha ne, standards of conduct"],
    ["CREATE A VERBAL CA FOR WREN HALVORSEN, TEAM MEMBER AT OMAHA NE", "CREATE A VERBAL CA FOR Wren Halvorsen, TEAM MEMBER AT OMAHA NE"],
    ["create a verbal ca for wren halvorsen team member at omaha ne, standards of conduct", "create a verbal ca for Wren Halvorsen, team member at omaha ne, standards of conduct"],
    ["create a verbal ca for Wren Halvorsen Team Member at Omaha NE, standards of conduct", "create a verbal ca for Wren Halvorsen, Team Member at Omaha NE, standards of conduct"],
    [B12, "written ca for Wren Halvorsen, team member at omaha ne, attendance"],
    ["Written ca for Wren Halvorsen team member at Omaha NE, attendance", "Written ca for Wren Halvorsen, team member at Omaha NE, attendance"],
  ])("'%s' reads the two words as the name", (turn, read) => {
    process.env[FLAG] = "on";
    expect(nameBeforeTitle(turn).startsWith(read)).toBe(true);
  });

  it.each([
    "create a verbal ca for Wren Halvorsen, team member at omaha ne, standards of conduct",
    "create a ca for wren halvorsen at omaha ne, she was late",
    "create a ca for the team member at omaha ne",
    "create a ca for her, team member at omaha ne",
    "coaching for devon harlan, rory vance was late today",
    "what is a ca for a team member?",
    // QA-5, 26 Oct 2026: a topic is not a name.
    "ca for dress code, associate at omaha",
    "Ca for dress code associate at omaha",
    "CA FOR DRESS CODE, ASSOCIATE AT OMAHA",
  ])("leaves '%s' as typed", (turn) => {
    process.env[FLAG] = "on";
    expect(nameBeforeTitle(turn)).toBe(turn);
  });

  it("reads earlier manager turns the same way", () => {
    process.env[FLAG] = "on";
    const out = withNameBeforeTitle({ question: "yes", history: [{ role: "user", content: B12 }] } as unknown as AskRequest);
    expect(out.history[0]!.content).toContain("for Wren Halvorsen, team member");
  });
});
