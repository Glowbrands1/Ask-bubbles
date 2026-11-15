import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { matchEmployeeName, type RosterEmployee } from "./employee-match";

/**
 * QA, 15 Nov 2026: the manager typed a first name and a surname, and the card showed another first name. QA then found
 * the typed first name was that employee's preferred first name in Woven: the matcher was right, the card showed only
 * the legal name. Pinned here: the preferred first name is that person; a shared last name with a first name that fits
 * nobody is never a match; a close spelling of the first name is. Invented names.
 */
const MARISOL: RosterEmployee = { id: "e-marisol", firstName: "Marisol", lastName: "Fairweather", locationIds: ["loc-264"] };
/** QA, 15 Nov 2026: in the report the typed first name was the employee's preferred first name in Woven. */
const LORRAINE: RosterEmployee = { id: "e-lorraine", firstName: "Lorraine", preferredFirstName: "Rae", lastName: "Fairweather", locationIds: ["loc-264"] };

describe("the matcher: the first name must fit", () => {
  it.each([
    ["soren fairweather", "none"],
    ["Soren Fairweather", "none"],
    ["sor fairweather", "none"],
    ["marisal fairweather", "confirm"],
    ["marisol fairweather", "exact"],
  ])("%s → %s", (typed, kind) => {
    expect(matchEmployeeName(typed, [MARISOL]).kind).toBe(kind);
  });
});

describe("the preferred first name typed is that person (the report's real case)", () => {
  it("\"rae fairweather\" is Lorraine Fairweather (preferred Rae), exact", () => {
    const found = matchEmployeeName("rae fairweather", [LORRAINE, MARISOL]);
    expect(found.kind).toBe("exact");
    expect(found.kind === "exact" ? found.employee.id : null).toBe("e-lorraine");
  });
});
