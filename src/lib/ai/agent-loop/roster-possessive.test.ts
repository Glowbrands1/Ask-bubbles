import { describe, expect, it } from "vitest";

import { requestFormKind, withRosterPossessives } from "./tools";

/**
 * Port of the sibling app's #1296 (its live manager's "show me <first>sexit", 23 Nov 2026; Pau: fix in both apps), and
 * the possessive reading it builds on ("open <First>s ca"). Invented roster names.
 */
const ROSTER = [
  { firstName: "Fenna", lastName: "Prewitt", preferredFirstName: null },
  { firstName: "Oswin", lastName: "Hartley", preferredFirstName: null },
  { firstName: "Niles", lastName: "Marsh", preferredFirstName: null },
  { firstName: "Nile", lastName: "Orr", preferredFirstName: null },
];

describe("withRosterPossessives", () => {
  it("\"open Fennas ca\" is Fenna's", () => {
    expect(withRosterPossessives("open Fennas ca", ROSTER)).toBe("open Fenna's ca");
    expect(withRosterPossessives("show me hartleys forms", ROSTER)).toBe("show me hartley's forms");
  });
  it("a name that is itself on the roster stays (\"Niles\" is not \"Nile's\")", () => {
    expect(withRosterPossessives("open Niles ca", ROSTER)).toBe("open Niles ca");
  });
  it("words that are not roster names are untouched", () => {
    expect(withRosterPossessives("open the forms for cars", ROSTER)).toBe("open the forms for cars");
    expect(withRosterPossessives("open Fenna's ca", ROSTER)).toBe("open Fenna's ca");
  });
  it("\"show me <first>sexit\" (no apostrophe, no space): \"Fenna's exit\"", () => {
    expect(withRosterPossessives("show me fennasexit", ROSTER)).toBe("show me fenna's exit");
    expect(withRosterPossessives("show me Hartleysexit form", ROSTER)).toBe("show me Hartley's exit form");
  });
  it("a glued word that is a roster name, or only starts with a name and a short tail, stays", () => {
    expect(withRosterPossessives("open Niles ca", ROSTER)).toBe("open Niles ca");
    expect(withRosterPossessives("fennason and the fennasex", ROSTER)).toBe("fennason and the fennasex");
  });
});

describe("requestFormKind (\"show me <first>sexit\", \"yes\", \"yes\", \"11202026\"; Pau, 23 Nov 2026)", () => {
  const turn = (role: "user" | "assistant", content: string) => ({ role, content }) as never;
  it("the kind said at the start of the request holds through the answers to the replies' questions", () => {
    const history = [
      turn("user", "show me fennasexit"),
      turn("assistant", "Just to confirm — do you want to see Fenna's Resignation/Exit Form on file?"),
      turn("user", "yes"),
      turn("assistant", "There are 6 forms on file for Fenna. Which one would you like to open?"),
    ];
    expect(requestFormKind({ question: "11202026", history }, ROSTER)?.templateNameWords).toEqual(["exit", "resignation"]);
  });
  it("a request that ended (a reply that asked nothing) does not carry its kind into the next one", () => {
    const history = [turn("user", "show me fennasexit"), turn("assistant", "Opening her Resignation/Exit Form."), turn("user", "now show me fennas forms")];
    expect(requestFormKind({ question: "11/20", history }, ROSTER)).toBeNull();
  });
});
