import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { GroundedPerson } from "./grounded-entities";
import { decideIntentTurn } from "./intent-slots";
import { lastFirstReading } from "./reader/last-first";

/*
 * LAST_FIRST_NAME_READ_ENABLED (ported from Ask Sunny), through the turn's
 * decision: the employee is the one roster person "Calder, Remy" fits when
 * today's readers left it open; flag off, as before. Invented names.
 */
const person = (id: string, firstName: string, lastName: string): GroundedPerson => ({
  id,
  firstName,
  lastName,
  preferredFirstName: null,
  locationIds: ["loc-0001"],
  positionName: null,
  employmentStatus: "active",
  title: null,
  primaryLocationName: null,
});
const PEOPLE = [person("e-1", "Remy", "Calder"), person("e-2", "Tess", "Varga")];
const QUESTION = "My employee Calder, Remy was 10 minutes late on 10/20. Please create a corrective action form so I can document.";

function decide() {
  const checked = lastFirstReading({ managerTurns: [QUESTION], people: PEOPLE, locations: [], headings: [], today: "2026-10-27" });
  return decideIntentTurn({ question: QUESTION, history: [], today: "2026-10-27", saved: null, raw: null, people: PEOPLE, stores: [], headings: [], templates: [], formInProgress: false, checked });
}

afterEach(() => vi.unstubAllEnvs());

describe("the turn's employee", () => {
  it("off: not filled by the Last, First reading", () => {
    const decision = decide();
    expect(decision.state.employeeName).not.toBe("Remy Calder");
    expect(decision.reader).toBeUndefined();
  });

  it("on: Remy Calder, and the trace says what was filled", () => {
    vi.stubEnv("LAST_FIRST_NAME_READ_ENABLED", "true");
    const decision = decide();
    expect(decision.state.employeeName).toBe("Remy Calder");
    expect(decision.reader).toEqual({ filled: ["employee"], disputed: [] });
  });
});
