import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { matchEmployeeName, type RosterEmployee } from "./employee-match";

/**
 * QA, 15 Nov 2026: the manager typed "Salem Pool" and the form switched to the roster's "Melanie Pool". A shared last
 * name with a different first name is never a strong or close match; a close spelling of the first name is. Invented
 * names.
 */
const MELANIE: RosterEmployee = { id: "e-melanie", firstName: "Melanie", lastName: "Pool", locationIds: ["loc-264"] };

describe("the matcher: the first name must fit", () => {
  it.each([
    ["salem pool", "none"],
    ["Salem Pool", "none"],
    ["sal pool", "none"],
    ["melany pool", "confirm"],
    ["melanie pool", "exact"],
  ])("%s → %s", (typed, kind) => {
    expect(matchEmployeeName(typed, [MELANIE]).kind).toBe(kind);
  });
});
