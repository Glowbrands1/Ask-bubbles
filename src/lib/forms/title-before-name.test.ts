import { afterEach, describe, expect, it } from "vitest";

import { detectTemplateIntent, leadingFormRequest } from "./template-intent";
import { leadingTitleLength, nameAfterTitle, sameNameAfterTitle, withoutLeadingTitle } from "./title-before-name";

/**
 * TITLE_BEFORE_NAME_ENABLED (QA's Bubbles 17h live test, 11 Nov 2026): the tester's wording, "Corrective action for
 * Team Member <name>"; the person is invented.
 */
const FLAG = "TITLE_BEFORE_NAME_ENABLED";
const SAID = "Corrective action for Team Member Wren Tallis";

afterEach(() => {
  delete process.env[FLAG];
});

describe("TITLE_BEFORE_NAME: a store title before the name", () => {
  it("flag off (as on main 8ff2e3ba): the tester's wording is read as a question about corrective action", () => {
    // Off pins its own flag (QA's off-pins guard, 11 Nov 2026): it must hold once production turns the flag on.
    delete process.env[FLAG];
    expect(detectTemplateIntent(SAID)).toEqual({ kind: "corrective_action", requestedCreation: false });
  });

  it("flag on: the tester's wording asks for the Corrective Action Form, for the name", () => {
    process.env[FLAG] = "true";
    expect(detectTemplateIntent(SAID)).toEqual({ kind: "explicit", templateKey: "dpoa" });
    expect(leadingFormRequest(SAID)).toMatchObject({ templateKey: "dpoa", subject: ["Wren", "Tallis"] });
  });

  it.each([
    ["Team Member Wren Tallis", "Wren Tallis"],
    ["TM Wren Tallis", "Wren Tallis"],
    ["Shift Lead Wren Tallis", "Wren Tallis"],
    ["Assistant Store Manager Wren Tallis", "Wren Tallis"],
  ])("flag on: %j is %j", (typed, name) => {
    process.env[FLAG] = "true";
    expect(withoutLeadingTitle(typed)).toBe(name);
  });

  it("flag on: a title with nobody after it, or a name with no title, is left as typed", () => {
    process.env[FLAG] = "true";
    expect(leadingTitleLength(["Team", "Members"])).toBe(0);
    expect(withoutLeadingTitle("Wren Tallis")).toBe("Wren Tallis");
    expect(detectTemplateIntent("Corrective action for Wren Tallis")).toEqual({ kind: "explicit", templateKey: "dpoa" });
  });

  it("flag off: names are read as before", () => {
    expect(withoutLeadingTitle("Team Member Wren Tallis")).toBe("Team Member Wren Tallis");
    expect(detectTemplateIntent("Corrective action for Wren Tallis")).toEqual({ kind: "explicit", templateKey: "dpoa" });
  });
});

describe("the card's name after the title, and the create check (QA, 12 Nov 2026)", () => {
  it("flag on: the name after \"for TM\" / \"for Team Member\"", () => {
    process.env[FLAG] = "true";
    expect(nameAfterTitle("Corrective action for TM Wren Tallis")).toBe("Wren Tallis");
    expect(nameAfterTitle("Create a corrective action for Team Member Wren Tallis, she was late")).toBe("Wren Tallis");
    expect(nameAfterTitle("Corrective action for Wren Tallis")).toBeNull();
  });

  it("flag on: the create check's \"Team Member Wren Tallis\" is the card's Wren Tallis; another person is not", () => {
    process.env[FLAG] = "true";
    expect(sameNameAfterTitle("Team Member Wren Tallis", "Wren Tallis", [SAID])).toBe(true);
    expect(sameNameAfterTitle("Maya Lund", "Wren Tallis", [SAID])).toBe(false);
    expect(sameNameAfterTitle("Ronan Wren Tallis", "Wren Tallis", ["Corrective action for Ronan Wren Tallis"])).toBe(false);
  });

  it("flag off: nothing", () => {
    expect(nameAfterTitle("Corrective action for TM Wren Tallis")).toBeNull();
    expect(sameNameAfterTitle("Team Member Wren Tallis", "Wren Tallis", [SAID])).toBe(false);
  });
});

describe("Gate-Bubbles R795T (12 Nov 2026): an award, a time or an event after a title is nobody", () => {
  it.each(["Create a CA for Team Member Of The Month", "Create a CA for Store Manager Of The Year", "Create a CA for Shift Lead Training", "Create a CA for DM Visit"])(
    "flag on: %j gives no name",
    (said) => {
      process.env[FLAG] = "true";
      expect(nameAfterTitle(said)).toBeNull();
    },
  );

  it("flag on: \"Team Member Of The Month\" is left whole on a card, never \"Of The Month\"", () => {
    process.env[FLAG] = "true";
    expect(withoutLeadingTitle("Team Member Of The Month")).toBe("Team Member Of The Month");
    expect(withoutLeadingTitle("Team Member Wren Tallis")).toBe("Wren Tallis");
  });
});
