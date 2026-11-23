import { describe, expect, it } from "vitest";

import { rowsOfNamedKind } from "./tools";

/**
 * The template names as the library has them (library.ts, exit-library.ts).
 * Pau via QA, 23 Nov 2026 (the sibling app's live chat): "show me <first>sexit" listed all of her forms and then asked
 * "Coaching Form draft or Resignation/Exit Form?" though she had said exit. The kind the manager named keeps the forms
 * whose own template name holds it, read from the template names (never a list of kinds). Invented rows.
 */
const row = (templateName: string, templateShortName: string, id: string) => ({ id, templateName, templateShortName });
const ON_FILE = [
  row("Coaching Form", "Coaching", "c1"),
  row("Coaching Form", "Coaching", "c2"),
  row("Corrective Action Form", "Corrective Action", "ca1"),
  row("Resignation/Exit Form", "Exit Form", "x1"),
  row("Follow-Up Coaching Form", "Follow-Up Coaching", "f1"),
];

describe("rowsOfNamedKind", () => {
  it("\"exit\" keeps the Resignation/Exit Form only", () => {
    expect(rowsOfNamedKind(ON_FILE, "exit").map((form) => form.id)).toEqual(["x1"]);
    expect(rowsOfNamedKind(ON_FILE, "resignation").map((form) => form.id)).toEqual(["x1"]);
  });

  it("a word every form's name holds tells nothing apart", () => {
    expect(rowsOfNamedKind(ON_FILE, "form")).toEqual([]);
  });

  it("a word of one template's name names its forms (corrective)", () => {
    expect(rowsOfNamedKind(ON_FILE, "corrective").map((form) => form.id)).toEqual(["ca1"]);
  });

  it("a word no form's name holds keeps nothing", () => {
    expect(rowsOfNamedKind(ON_FILE, "demotion")).toEqual([]);
  });
});
