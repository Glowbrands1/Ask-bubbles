import { describe, expect, it } from "vitest";

import type { GroundedPerson } from "../grounded-entities";
import { checkDate, checkReading, quoted, type CheckContext } from "./check";
import { mergeCheckedReading } from "./merge";
import { parseFormReading } from "./schema";

/**
 * AI_READS_CODE_CHECKS_ENABLED: the code keeps only what the manager's own
 * words support. The turns are QA's production seeds (27 Oct 2026), word for
 * word, with every person invented; this app's stores (Dodge, Sioux Falls).
 * Ported from the sibling app's test.
 */

const person = (id: string, firstName: string, lastName: string, locationIds: string[] = ["loc-264"]): GroundedPerson => ({
  id,
  firstName,
  lastName,
  preferredFirstName: null,
  locationIds,
  title: null,
  primaryLocationName: null,
});

const PEOPLE = [
  person("e-1", "Quinn", "Marlowe"),
  person("e-2", "Dale", "Ferris"),
  person("e-3", "Mara", "Quill"),
  person("e-4", "Ivy", "Hollis", ["loc-236"]),
];

const S1 =
  "My employee quinn marlowe has was 10 minutes late on her last two shifts. On the first shift I verbally coached her on our policy and expectations. Then she was late again. Please create a CA form so I can document. She was late on 10/5 and 10/15";
const S2 = "create a ca for quinn marlowe at dodge, she was late on 10-5 and 10-15. i coached her on 10-16 about being late";

const context = (managerTurns: string[]): CheckContext => ({
  managerTurns,
  people: PEOPLE,
  locations: [
    { id: "loc-264", name: "Omaha, NE (West Dodge Rd)" },
    { id: "loc-225", name: "Sioux Falls, SD (W 41st St)" },
    { id: "loc-338", name: "Sioux Falls, SD (E 18th St)" },
  ],
  headings: ["Attendance", "Tardiness"],
  today: "2026-10-27",
});

const read = (fields: Record<string, unknown>) => parseFormReading(fields)!;

describe("the quote must be the manager's words", () => {
  it("ignores case, spacing and punctuation, never the assistant's lines", () => {
    expect(quoted("Quinn Marlowe", [S1])).toBe(true);
    expect(quoted("QUINN  MARLOWE,", [S1])).toBe(true);
    expect(quoted("Quinn Marlowe was late", [S1])).toBe(false);
    expect(quoted("", [S1])).toBe(false);
  });

  it("drops a value whose quote the manager never wrote", () => {
    const checked = checkReading(
      read({ employee: { value: "Dale Ferris", evidence: "for dale ferris" }, incidentDate: { value: "2026-10-15", evidence: "on 10/15" } }),
      context([S1]),
    );
    expect(checked.employee).toBeNull();
    expect(checked.incidentDate).toBeNull();
    expect(checked.rejected).toEqual(["employee", "incidentDate"]);
  });
});

describe("the employee is one person on the roster", () => {
  const name = (value: string, evidence: string, turn: string) =>
    checkReading(read({ employee: { value, evidence } }), context([turn])).employee?.name ?? null;

  it("reads a first name only, Last, First, and a one-letter typo", () => {
    expect(name("quinn", "My employee quinn has", S1.replace("quinn marlowe", "quinn"))).toBe("Quinn Marlowe");
    expect(name("Marlowe, Quinn", "for Marlowe, Quinn at", S2.replace("quinn marlowe", "Marlowe, Quinn"))).toBe("Quinn Marlowe");
    expect(name("quin marlowe", "for quin marlowe at", S2.replace("quinn", "quin"))).toBe("Quinn Marlowe");
  });

  it("keeps nobody when the words fit two people or none", () => {
    const twoQuinns = { ...context([S2]), people: [...PEOPLE, person("e-9", "Quinn", "Ferris")] };
    expect(checkReading(read({ employee: { value: "quinn", evidence: "quinn" } }), twoQuinns).employee).toBeNull();
    expect(name("dodge", "at dodge", "create a ca for the employee at dodge")).toBeNull();
    expect(name("quinn ferris", "quinn ferris", "create a ca for quinn ferris")).toBeNull();
  });
});

describe("dates", () => {
  it("accepts the shapes managers write, and only the day the quote says", () => {
    for (const evidence of ["10/15", "10-15", "10-15-26", "10.15", "oct 15", "october 15th", "15 october"]) {
      expect(checkDate("2026-10-15", evidence, "2026-10-27"), evidence).toBe("2026-10-15");
    }
    expect(checkDate("2026-10-15", "the 15th", "2026-10-27")).toBe("2026-10-15");
    expect(checkDate("2026-10-16", "10/15", "2026-10-27")).toBeNull();
    expect(checkDate("2025-10-15", "10/15", "2026-10-27")).toBeNull();
    expect(checkDate("2026-10-28", "10/28", "2026-10-27")).toBeNull();
  });

  it("an incident date the manager gave for a prior step is not the incident date", () => {
    const checked = checkReading(
      read({
        incidentDate: { value: "2026-10-16", evidence: "i coached her on 10-16" },
        priorSteps: [{ kind: "coaching", date: "2026-10-16", evidence: "i coached her on 10-16" }],
      }),
      context([S2]),
    );
    expect(checked.incidentDate).toBeNull();
    expect(checked.notIncidentDates).toEqual(["2026-10-16"]);
  });
});

describe("location, level, payroll and policy", () => {
  it("keeps what the quote names, and one location only", () => {
    const checked = checkReading(
      read({
        location: { value: "dodge", evidence: "at dodge" },
        warningLevel: { value: "verbal", evidence: "verbal" },
        payroll: { value: "no", evidence: "no payroll deduct" },
        policyHeading: { value: "Tardiness", evidence: "late" },
      }),
      context([S2, "verbal", "no payroll deduct"]),
    );
    expect(checked.location?.id).toBe("loc-264");
    expect(checked.warningLevel).toBe("verbal");
    expect(checked.payroll).toBe("no");
    expect(checked.policyHeading).toBe("Tardiness");
    const siouxFalls = checkReading(read({ location: { value: "sioux falls", evidence: "at sioux falls" } }), context(["create a ca at sioux falls"]));
    expect(siouxFalls.location).toBeNull();
    const madeUp = checkReading(read({ policyHeading: { value: "Late Arrival", evidence: "late" } }), context([S2]));
    expect(madeUp.policyHeading).toBeNull();
  });

  it("an amount must be in the quote", () => {
    const turn = "payroll deduct $3.25 for the shortage";
    expect(checkReading(read({ payrollAmount: { value: "3.25", evidence: "$3.25" } }), context([turn])).payrollAmount).toBe("$3.25");
    expect(checkReading(read({ payrollAmount: { value: "3", evidence: "$3.25" } }), context([turn])).payrollAmount).toBeNull();
  });
});

describe("the checked reading fills only what today's readers left open", () => {
  const code = {
    employee: { person: null, name: "Marlowe Quinn", ambiguous: [], typed: "Marlowe Quinn" },
    date: { iso: null, ambiguous: ["2026-10-05", "2026-10-15"] },
  };

  it("fills a field the code could not settle, and clears the numbered list", () => {
    const checked = checkReading(
      read({
        employee: { value: "Marlowe, Quinn", evidence: "Marlowe, Quinn" },
        incidentDate: { value: "2026-10-15", evidence: "10/15" },
      }),
      context([S2.replace("quinn marlowe", "Marlowe, Quinn"), "10/15"]),
    );
    const merge = mergeCheckedReading(checked);
    expect(merge.employee(code.employee).name).toBe("Quinn Marlowe");
    expect(merge.date(code.date)).toEqual({ iso: "2026-10-15", ambiguous: [] });
    expect(merge.filled).toEqual(["employee", "incidentDate"]);
  });

  it("never replaces a value today's readers settled; the disagreement is traced", () => {
    const checked = checkReading(read({ incidentDate: { value: "2026-10-05", evidence: "10-5" } }), context([S2]));
    const merge = mergeCheckedReading(checked);
    expect(merge.date({ iso: "2026-10-15", ambiguous: [] }).iso).toBe("2026-10-15");
    expect(merge.disputed).toEqual(["incidentDate"]);
    expect(merge.filled).toEqual([]);
  });

  it("with no checked reading every field is today's, the same object", () => {
    const merge = mergeCheckedReading(null);
    expect(merge.employee(code.employee)).toBe(code.employee);
    expect(merge.date(code.date)).toBe(code.date);
    expect(merge.title("Makery Associate")).toBe("Makery Associate");
  });

  it("S1 written \"10.5 and 10.15\", then \"10.15\": the newest answer moves past today's 10/05", () => {
    const turns = [S1.replace("10/5 and 10/15", "10.5 and 10.15"), "I already told you the employee name. She is at Dodge", "10.15"];
    const checked = checkReading(read({ incidentDate: { value: "2026-10-15", evidence: "10.15" } }), context(turns));
    expect(checked.incidentDateTurn).toBe(2);
    const merge = mergeCheckedReading(checked);
    expect(merge.date({ iso: "2026-10-05", ambiguous: [] }).iso).toBe("2026-10-15");
    expect(merge.filled).toEqual(["incidentDate"]);
  });

  it("a date stated again in the newest turn stays today's", () => {
    const turns = [S2, "10-15"];
    const checked = checkReading(read({ incidentDate: { value: "2026-10-05", evidence: "10-5" } }), context(turns));
    const merge = mergeCheckedReading(checked);
    expect(merge.date({ iso: "2026-10-15", ambiguous: [] }).iso).toBe("2026-10-15");
  });
});

describe("an amount is not a date", () => {
  it("\"$3.25\" states no March 25th", () => {
    expect(checkDate("2026-03-25", "short $3.25", "2026-10-27")).toBeNull();
  });
});


describe("this app's wording (QA S3, S12)", () => {
  it("\"yes payrol ldeduct\" answers the payroll question yes", () => {
    const checked = checkReading(read({ payroll: { value: "yes", evidence: "yes payrol ldeduct" } }), context(["yes payrol ldeduct"]));
    expect(checked.payroll).toBe("yes");
  });

  it("\"this should be a written\" is this form's level; the verbal on 9-1-26 is a prior step", () => {
    const turn = "this should be a written and note a verbal ca was given on 9-1-26";
    const checked = checkReading(
      read({
        warningLevel: { value: "written", evidence: "this should be a written" },
        incidentDate: { value: "2026-09-28", evidence: "9-28-26" },
        priorSteps: [{ kind: "verbal", date: "2026-09-01", evidence: "a verbal ca was given on 9-1-26" }],
      }),
      context(["create a CA form for quinn marlowe, team member at grand island, for opening store late on 9-28-26", turn]),
    );
    expect(checked.warningLevel).toBe("written");
    expect(checked.incidentDate).toBe("2026-09-28");
    expect(checked.priorSteps).toEqual([{ kind: "verbal", iso: "2026-09-01" }]);
  });

  it("\"she was issued a verbal ca on 10.1\" dates a prior step 10/1", () => {
    expect(checkDate("2026-10-01", "she was issued a verbal ca on 10.1", "2026-10-26")).toBe("2026-10-01");
  });
});

describe("the create route's check of the reader's employee quote (Haiku, smoke run 27 Oct 2026)", () => {
  it("\"My employee Marlowe, Quinn\" read by the code as \"Marlowe\" is the card's Quinn Marlowe; another person is not", async () => {
    const { readerNamesCardEmployee } = await import("./recheck");
    const conversation = [{ role: "user", content: "My employee Marlowe, Quinn has was 10 minutes late on her last two shifts." }];
    const reading = { employee: { value: "Quinn Marlowe", quote: "My employee Marlowe, Quinn" } };
    expect(readerNamesCardEmployee(reading, conversation, "Quinn Marlowe", "Marlowe")).toBe(true);
    expect(readerNamesCardEmployee(reading, conversation, "Quinn Marlowe", "Dale Ferris")).toBe(false);
    expect(readerNamesCardEmployee(reading, conversation, "Dale Ferris", "Marlowe")).toBe(false);
  });
});
