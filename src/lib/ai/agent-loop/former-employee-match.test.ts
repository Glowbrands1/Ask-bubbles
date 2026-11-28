import { describe, expect, it } from "vitest";

import type { DirectoryRosterRow } from "@/lib/forms/employee-roster";

import { formerMatchIn } from "./tools";

/*
 * E3 (owner's review, 28 Nov 2026): "A former (terminated) employee is found only when the manager types the exact full
 * name. Active employees get near-miss, first-name and accent-tolerant matching." Former employees now get the same
 * matching; more than one fit is asked, never picked silently. Invented people.
 */
const former = (id: string, firstName: string, lastName: string, preferredFirstName: string | null = null): DirectoryRosterRow => ({
  id,
  firstName,
  lastName,
  preferredFirstName,
  employmentStatus: "terminated",
  locationIds: ["loc-264"],
});
const YSOLDE = former("f-1", "Ysolde", "Kovač");
const ZEBULON = former("f-2", "Zebulonius", "Montrose", "Zebulon");
const YSOLDE_TWO = former("f-3", "Ysolde", "Brannigan");

describe("a former employee is matched as an active one is (E3)", () => {
  it("the exact full name, as before", () => {
    expect(formerMatchIn([YSOLDE, ZEBULON], "Ysolde Kovač")).toMatchObject({ kind: "one", name: "Ysolde Kovač" });
  });

  it("accents typed another way, any case, any word order", () => {
    expect(formerMatchIn([YSOLDE, ZEBULON], "ysolde kovac")).toMatchObject({ kind: "one", name: "Ysolde Kovač" });
    expect(formerMatchIn([YSOLDE, ZEBULON], "Kovac Ysolde")).toMatchObject({ kind: "one", name: "Ysolde Kovač" });
  });

  it("the preferred first name", () => {
    expect(formerMatchIn([YSOLDE, ZEBULON], "Zebulon Montrose")).toMatchObject({ kind: "one", name: "Zebulon Montrose" });
  });

  it("a near miss is asked, never used silently", () => {
    const found = formerMatchIn([YSOLDE, ZEBULON], "Ysolde Kovak");
    expect(found.kind).toBe("ask");
    expect(found.kind === "ask" && found.askExactly).toMatch(/^Did you mean \*\*Ysolde Kovač\*\*\?.*no longer active/);
  });

  it("a first name alone is asked", () => {
    const found = formerMatchIn([YSOLDE, ZEBULON], "Zebulonius");
    expect(found).toMatchObject({ kind: "ask", names: ["Zebulon Montrose"] });
  });

  it("more than one former employee fits: the manager is asked which, none is picked", () => {
    const found = formerMatchIn([YSOLDE, ZEBULON, YSOLDE_TWO], "Ysolde");
    expect(found.kind).toBe("ask");
    expect(found.kind === "ask" && [...found.names].sort()).toEqual(["Ysolde Brannigan", "Ysolde Kovač"]);
    expect(found.kind === "ask" && found.askExactly).toMatch(/^Which former employee is this for: \*\*Ysolde (?:Brannigan|Kovač)\*\* or \*\*Ysolde (?:Brannigan|Kovač)\*\*\?/);
  });

  it("two former employees with the same full name are asked about, never one picked", () => {
    const found = formerMatchIn([YSOLDE, { ...YSOLDE, id: "f-9", locationIds: ["loc-265"] }], "Ysolde Kovač");
    expect(found.kind).toBe("ask");
    expect(found.kind === "ask" && found.names.length).toBe(2);
    expect(found.kind === "ask" && found.askExactly).toMatch(/^Which former employee is this for: \*\*Ysolde Kovač at [^*]+\*\* or \*\*Ysolde Kovač at [^*]+\*\*\?/);
  });

  it("a name that is nobody stays nobody", () => {
    expect(formerMatchIn([YSOLDE, ZEBULON], "Bartholomew Pengrove")).toEqual({ kind: "none" });
  });
});
