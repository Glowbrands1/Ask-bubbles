import { describe, expect, it } from "vitest";

import type { ChatFormProposal } from "@/types";

import type { GroundedPerson } from "../grounded-entities";
import { checkReading, type CheckContext } from "./check";
import { mergePlan } from "./hook";
import { parseFormReading } from "./schema";

/**
 * AI_READS_CODE_CHECKS_ENABLED: how this app hands a checked reading to its
 * card (`hook.ts`). Invented people; Dodge is store 264.
 */

const person = (id: string, firstName: string, lastName: string): GroundedPerson => ({
  id,
  firstName,
  lastName,
  preferredFirstName: null,
  locationIds: ["loc-264"],
  title: null,
  primaryLocationName: null,
});
const PEOPLE = [person("e-1", "Quinn", "Marlowe"), person("e-2", "Dale", "Ferris")];

const context = (managerTurns: string[]): CheckContext => ({
  managerTurns,
  people: PEOPLE,
  locations: [{ id: "loc-264", name: "Omaha, NE (West Dodge Rd)" }],
  headings: [],
  today: "2026-10-26",
});

const read = (fields: Record<string, unknown>) => parseFormReading(fields)!;

function card(fields: Partial<ChatFormProposal>): ChatFormProposal {
  return {
    proposalId: "p-1",
    templateKey: "dpoa",
    templateName: "Corrective Action Form",
    supportsInlineDraft: true,
    variantKey: null,
    employeeName: null,
    employeeRole: null,
    locationId: null,
    locationName: null,
    locationResolution: "resolved",
    status: "ready",
    sourceMessageIds: [],
    ...fields,
  } as ChatFormProposal;
}

const S1 = [
  "My employee quinn has was 10 minutes late on her last two shifts. On the first shift I verbally coached her on our policy and expectations. Then she was late again. Please create a CA form so I can document. She was late on 10.5 and 10.15",
  "I already told you the employee name. She is at Dodge",
  "10.15",
];

describe("the reading fills only what today's card left open", () => {
  it("a typed name that is nobody on the roster: the roster person, as the app's line", () => {
    const checked = checkReading(read({ employee: { value: "quinn", evidence: "My employee quinn has" } }), context(S1));
    const plan = mergePlan(card({ employeeName: "quinn" }), checked, PEOPLE);
    expect(plan.lines).toEqual(["The employee is Quinn Marlowe."]);
    expect(plan.filled).toEqual(["employee"]);
  });

  it("a newer answer moves past today's date (\"10.15\" after \"10.5 and 10.15\")", () => {
    const checked = checkReading(read({ incidentDate: { value: "2026-10-15", evidence: "10.15" } }), context(S1));
    const plan = mergePlan(card({ employeeName: "Quinn Marlowe", formDate: "2026-10-05" }), checked, PEOPLE);
    expect(plan.lines).toEqual(["It happened on 10/15/2026."]);
  });

  it("QA S12: a level today's card left blank", () => {
    const turns = ["create a CA form for quinn marlowe, team member at grand island, for opening store late on 9-28-26", "this should be a written and note a verbal ca was given on 9-1-26"];
    const checked = checkReading(read({ warningLevel: { value: "written", evidence: "this should be a written" } }), context(turns));
    expect(mergePlan(card({ employeeName: "Quinn Marlowe" }), checked, PEOPLE).lines).toEqual(["Warning level: written."]);
  });

  it("payroll yes with its amount, only when the card has no answer", () => {
    const turns = ["create ca form for dale ferris. dale had a register shortage of $3.25 on 10-20-26. payroll deduct of $3.25 is applicable"];
    const checked = checkReading(
      read({ payroll: { value: "yes", evidence: "payroll deduct of $3.25 is applicable" }, payrollAmount: { value: "3.25", evidence: "$3.25" } }),
      context(turns),
    );
    expect(mergePlan(card({ employeeName: "Dale Ferris" }), checked, PEOPLE).lines).toEqual(["Payroll deduct applies.", "Payroll deduction of $3.25."]);
    const settled = mergePlan(card({ employeeName: "Dale Ferris", payrollDeduct: "no" }), checked, PEOPLE);
    expect(settled.lines).toEqual([]);
    expect(settled.disputed).toEqual(["payroll"]);
  });

  it("a value today's card settled stays, and the disagreement is traced", () => {
    const turns = ["create a ca for dale ferris at dodge, late on 10-5 and 10-15"];
    const checked = checkReading(read({ employee: { value: "quinn", evidence: "quinn" }, incidentDate: { value: "2026-10-05", evidence: "10-5" } }), context([...turns, "quinn"]));
    const plan = mergePlan(card({ employeeName: "Dale Ferris", formDate: "2026-10-15" }), checked, PEOPLE);
    expect(plan.lines).toEqual([]);
    expect(plan.disputed).toEqual(["employee", "incidentDate"]);
  });
});

describe("the stale roster line", () => {
  const response = (content: string, reader: boolean) =>
    ({
      content,
      citations: [],
      coverage: "not_applicable",
      formProposal: card({ employeeName: "Quinn Marlowe", ...(reader ? { checkedReading: { employee: { value: "Quinn Marlowe", quote: "Marlowe, Quinn" } } } : {}) }),
    }) as never;

  it("goes when the reader put that person on the card; any other name, or no reader, stays", async () => {
    const { withoutStaleRosterNote } = await import("./hook");
    const stale = "I couldn't find **Marlowe** in the Woven roster, so that name is not on the form.\n\nI'll draft it.";
    expect(withoutStaleRosterNote(response(stale, true))!.content).toBe("I'll draft it.");
    expect(withoutStaleRosterNote(response(stale, false))!.content).toBe(stale);
    const other = "I couldn't find **Dale Ferris** in the Woven roster, so that name is not on the form.\n\nI'll draft it.";
    expect(withoutStaleRosterNote(response(other, true))!.content).toBe(other);
    expect(withoutStaleRosterNote(null)).toBeNull();
  });
});
