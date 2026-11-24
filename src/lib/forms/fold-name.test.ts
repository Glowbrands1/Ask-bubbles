import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { matchEmployeeName } from "./employee-match";
import { foldName } from "./fold-name";
import { samePerson } from "./proposal";

/* Port from the sibling app's #1141 (QA's code audit, item 13, 20 Nov 2026): accents and curly apostrophes. Invented names. */
describe("foldName", () => {
  it("drops accents without splitting the word, and straightens apostrophes", () => {
    expect(foldName("Ramírez")).toBe("Ramirez");
    expect(foldName("Lucía Ramírez")).toBe("Lucia Ramirez");
    expect(foldName("D’Angelo")).toBe("D'Angelo");
    expect(foldName("Zoë Brontë")).toBe("Zoe Bronte");
  });

  it("samePerson (the card and Create) and the roster's name check read them as the same person", () => {
    expect(samePerson("lucia ramirez", "Lucía Ramírez")).toBe(true);
    expect(samePerson("Nico D’Angelo", "Nico D'Angelo")).toBe(true);
    const roster = [{ id: "e-1", firstName: "Lucía", lastName: "Ramírez", preferredFirstName: null, employmentStatus: "active", locationIds: [], positionName: null }];
    expect(matchEmployeeName("lucia ramirez", roster as never).kind).toBe("exact");
    const curly = [{ id: "e-2", firstName: "Nico", lastName: "D'Angelo", preferredFirstName: null, employmentStatus: "active", locationIds: [], positionName: null }];
    expect(matchEmployeeName("Nico Dʼangelo", curly as never).kind).toBe("exact");
  });
});
